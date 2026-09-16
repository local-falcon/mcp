/**
 * Bounded in-memory event store for Streamable HTTP resumability.
 *
 * Replaces `InMemoryEventStore` from
 * `@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js`, whose own
 * header says it is "primarily intended for examples and testing, not for
 * production use". Two concrete problems with it, in a server that keeps one
 * instance per session for the session's whole life:
 *
 *   1. Unbounded growth. It holds a single `Map` and only ever calls `.set()` —
 *      there is no delete, TTL or cap anywhere in the class, and
 *      `transport.close()` does not touch it. Every notification ever sent on a
 *      session is retained until the session itself is collected.
 *
 *   2. O(n log n) replay with a full copy. `replayEventsAfter` does
 *      `[...this.events.entries()].sort(...)` across *every* event in the store,
 *      including other streams', on every `Last-Event-ID` reconnect. Against a
 *      proxy that reconnects every few seconds and a store that never shrinks,
 *      that becomes an allocation storm.
 *
 * This implementation keeps events per stream in insertion order and caps both
 * the per-stream count and the per-store total, evicting oldest-first. Replay
 * walks only the requested stream's buffer, so cost is bounded by the cap rather
 * than by the store's history.
 *
 * Event IDs stay wire-compatible with the SDK's format: `<streamId>_<seq>`,
 * parsed back via the last underscore. A monotonic sequence replaces the SDK's
 * `Date.now()`-plus-random so ordering is exact rather than lexicographic, and
 * so two events in the same millisecond cannot collide.
 */

/** Default number of events retained per stream. */
const DEFAULT_MAX_EVENTS_PER_STREAM = 256;

/** Default number of events retained across all streams in one store. */
const DEFAULT_MAX_EVENTS_TOTAL = 1024;

interface StoredEvent {
  eventId: string;
  message: unknown;
}

export interface BoundedEventStoreOptions {
  maxEventsPerStream?: number;
  maxEventsTotal?: number;
}

export class BoundedEventStore {
  private readonly streams = new Map<string, StoredEvent[]>();
  private readonly maxEventsPerStream: number;
  private readonly maxEventsTotal: number;
  private sequence = 0;
  private total = 0;
  private evicted = 0;

  constructor(options: BoundedEventStoreOptions = {}) {
    this.maxEventsPerStream = Math.max(1, options.maxEventsPerStream ?? DEFAULT_MAX_EVENTS_PER_STREAM);
    this.maxEventsTotal = Math.max(1, options.maxEventsTotal ?? DEFAULT_MAX_EVENTS_TOTAL);
  }

  /** Total events currently retained, for /healthz instrumentation. */
  size(): number {
    return this.total;
  }

  /** Events dropped to stay within the caps, for /healthz instrumentation. */
  evictedCount(): number {
    return this.evicted;
  }

  /**
   * Store an event and return its ID.
   *
   * Implements the SDK's `EventStore.storeEvent`.
   */
  async storeEvent(streamId: string, message: unknown): Promise<string> {
    const eventId = `${streamId}_${++this.sequence}`;

    let buffer = this.streams.get(streamId);
    if (!buffer) {
      buffer = [];
      this.streams.set(streamId, buffer);
    }

    buffer.push({ eventId, message });
    this.total++;

    // Per-stream cap: drop this stream's oldest.
    while (buffer.length > this.maxEventsPerStream) {
      buffer.shift();
      this.total--;
      this.evicted++;
    }

    // Global cap: drop from the largest stream so one busy stream cannot starve
    // the others' replay windows.
    while (this.total > this.maxEventsTotal) {
      const largest = this.largestStream();
      if (!largest) break;
      const [streamKey, largestBuffer] = largest;
      largestBuffer.shift();
      this.total--;
      this.evicted++;
      if (largestBuffer.length === 0) this.streams.delete(streamKey);
    }

    return eventId;
  }

  /**
   * Replay the events that followed `lastEventId` on its stream.
   *
   * Implements the SDK's `EventStore.replayEventsAfter`. Returns the stream ID
   * so the transport can attach the resumed stream, or "" when the event is
   * unknown — including when it has been evicted, which the transport treats
   * the same as an unknown ID.
   */
  async replayEventsAfter(
    lastEventId: string,
    { send }: { send: (eventId: string, message: unknown) => Promise<void> }
  ): Promise<string> {
    if (!lastEventId) return "";

    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) return "";

    const buffer = this.streams.get(streamId);
    if (!buffer) return "";

    const index = buffer.findIndex((event) => event.eventId === lastEventId);
    if (index === -1) {
      // Either never ours, or evicted. The client cannot be resumed from here.
      return "";
    }

    for (const event of buffer.slice(index + 1)) {
      await send(event.eventId, event.message);
    }

    return streamId;
  }

  /**
   * Extract the stream ID from an event ID.
   *
   * Split on the LAST underscore, since a stream ID may itself contain one —
   * the SDK's example splits on the first, which mis-parses such IDs.
   */
  private getStreamIdFromEventId(eventId: string): string {
    const separator = eventId.lastIndexOf("_");
    return separator <= 0 ? "" : eventId.slice(0, separator);
  }

  private largestStream(): [string, StoredEvent[]] | undefined {
    let found: [string, StoredEvent[]] | undefined;
    for (const entry of this.streams) {
      if (!found || entry[1].length > found[1].length) found = entry;
    }
    return found;
  }
}
