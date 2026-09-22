/**
 * Request-source attribution.
 *
 * Every outgoing Local Falcon API call carries a `request_source` parameter
 * naming the client that caused it, so usage can be attributed to the
 * integration driving it rather than arriving as one undifferentiated stream
 * from this server.
 *
 * ── Why this is not just the Origin header ──────────────────────────────────
 *
 * The motivating case is identifying ChatGPT's connector, and ChatGPT reaches
 * this server two different ways:
 *
 *   - The connector itself calls server-side from OpenAI's infrastructure. There
 *     is no browser in that path, so there is no Origin header at all; it
 *     identifies itself only by `User-Agent: openai-mcp/1.0.0`.
 *   - The MCP App widget calls from a sandbox iframe whose origin is an
 *     unpredictable `*.web-sandbox.oaiusercontent.com` host — and a sandboxed
 *     iframe may send the literal `Origin: null` instead.
 *
 * So a host-only implementation would miss ChatGPT's plugin entirely on the
 * path that matters most, and would spread its widget traffic across a new
 * subdomain per session. Recognised platforms are therefore collapsed to one
 * canonical label (`chatgpt`, `claude`, …) whichever signal reveals them, which
 * also makes the field aggregatable. Unrecognised callers fall back to their
 * literal domain, so a new integration still shows up as itself.
 *
 * ── Why AsyncLocalStorage ───────────────────────────────────────────────────
 *
 * The alternative was threading a parameter through ~100 exported client
 * functions and all 60 tool handlers, each of which would additionally need the
 * tool `extra`/`ctx` object plumbed into it. ALS keeps the change to the one
 * Express middleware that resolves the value and the one fetch helper that
 * stamps it. The context survives `await`, the rate limiter's queueing and the
 * retry backoff timers — Node propagates it across all of them.
 *
 * ── Tiers ───────────────────────────────────────────────────────────────────
 *
 *   platform   (4) A known client, from any signal. `openai-mcp` names ChatGPT
 *                  more definitively than an opaque sandbox domain does, so
 *                  this outranks a raw host.
 *   domain     (3) Literal Origin/Referer hostname of an unrecognised caller.
 *   clientName (2) MCP `clientInfo.name` from the initialize body.
 *   userAgent  (1) User-Agent product token.
 *   fallback   (0) LOCAL_FALCON_REQUEST_SOURCE, or "stdio" in STDIO mode.
 *
 * Tiers exist because the best signal often does not arrive on the request that
 * opens the session: a connector's `initialize` carries no Origin while the
 * widget's later tool calls do, and the `GET /sse` that creates an SSE session
 * precedes the `initialize` that names the client. A session therefore remembers
 * the best tier it has seen rather than the first value it saw.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Query/form parameter name appended to every Local Falcon API request. */
export const REQUEST_SOURCE_PARAM = "request_source";

/** Emitted when nothing at all resolves, so the field is never sent blank. */
export const UNKNOWN_REQUEST_SOURCE = "unknown";

/** Signal quality. Ordered, compared numerically; a higher tier replaces a lower. */
export const SOURCE_TIER = {
  fallback: 0,
  userAgent: 1,
  clientName: 2,
  domain: 3,
  platform: 4,
} as const;

export interface RequestSource {
  value: string;
  tier: number;
}

/** Headers and parsed JSON-RPC body — as much of a request as this module needs. */
export interface RequestSourceInput {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/**
 * Known MCP clients, matched on callback host, MCP client name or User-Agent
 * token. Order matters only in that the first match wins.
 *
 * `hosts` match the host itself or any subdomain of it, which is what makes the
 * per-session `*.web-sandbox.oaiusercontent.com` widget origins collapse to one
 * value. Keep this list conservative: an entry here means traffic is reported
 * under a canonical label instead of its literal domain.
 */
interface PlatformRule {
  label: string;
  hosts: string[];
  tokens: string[];
}

const PLATFORMS: PlatformRule[] = [
  {
    // oaiusercontent.com is the widget sandbox (see the MCP Apps notes in
    // CLAUDE.md); openai-mcp is the connector's own User-Agent.
    label: "chatgpt",
    hosts: ["chatgpt.com", "chat.openai.com", "openai.com", "oaiusercontent.com"],
    tokens: ["openai", "chatgpt"],
  },
  {
    label: "claude",
    hosts: [
      "claude.ai",
      "claude.com",
      "anthropic.com",
      "claudemcpcontent.com",
      "claudeusercontent.com",
    ],
    tokens: ["claude", "anthropic"],
  },
  { label: "vscode", hosts: ["vscode.dev", "github.dev"], tokens: ["vscode", "code-oss"] },
  { label: "cursor", hosts: ["cursor.com", "cursor.sh"], tokens: ["cursor"] },
  { label: "perplexity", hosts: ["perplexity.ai"], tokens: ["perplexity"] },
  { label: "gemini", hosts: ["gemini.google.com"], tokens: ["gemini"] },
  { label: "copilot", hosts: ["copilot.microsoft.com"], tokens: ["copilot"] },
  { label: "mistral", hosts: ["mistral.ai"], tokens: ["mistral"] },
  { label: "localfalcon", hosts: ["localfalcon.com"], tokens: [] },
];

// Values land in a third-party query string and in log lines, so the charset is
// restricted rather than forwarded raw: headers are attacker-controlled input.
const MAX_SOURCE_LENGTH = 100;

/**
 * Lowercase, collapse anything outside `[a-z0-9._:-]` to a hyphen, cap the
 * length. Returns undefined when nothing usable is left.
 */
export function sanitizeRequestSource(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, MAX_SOURCE_LENGTH)
    .replace(/[-.]+$/, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Operator override; also the STDIO default once setProcessRequestSource runs. */
let processFallback: string | undefined = sanitizeRequestSource(
  process.env.LOCAL_FALCON_REQUEST_SOURCE
);

/**
 * Set the process-wide fallback (STDIO mode calls this with "stdio").
 * An explicit LOCAL_FALCON_REQUEST_SOURCE wins, so an operator can label a
 * self-hosted or white-label deployment without a code change.
 */
export function setProcessRequestSource(value: string): void {
  if (processFallback) return;
  processFallback = sanitizeRequestSource(value);
}

/** Exposed for tests; not used in normal operation. */
export function resetProcessRequestSource(): void {
  processFallback = sanitizeRequestSource(process.env.LOCAL_FALCON_REQUEST_SOURCE);
}

function headerValue(
  headers: RequestSourceInput["headers"],
  name: string
): string | undefined {
  const raw = headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Hostname of an Origin or Referer header.
 *
 * Port is dropped: `localhost:33418` and `localhost:51000` are the same client
 * on two runs, so the port adds cardinality without attribution value.
 */
function hostOf(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  // A sandboxed iframe sends the literal "Origin: null" for its opaque origin,
  // which is what ChatGPT's and Claude's widget hosts may do. That is an absent
  // domain, not a domain named "null".
  if (!trimmed || trimmed === "null") return undefined;
  try {
    return sanitizeRequestSource(new URL(trimmed).hostname);
  } catch {
    // Referer is occasionally a bare host rather than an absolute URL.
    return sanitizeRequestSource(trimmed.split("/")[0]);
  }
}

/** `clientInfo.name` from an MCP initialize request body, when present. */
function clientNameOf(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const params = (body as { params?: { clientInfo?: { name?: unknown } } }).params;
  return sanitizeRequestSource(params?.clientInfo?.name);
}

/** Product token of a User-Agent: "openai-mcp/1.0.0 (+https://…)" → openai-mcp. */
function userAgentTokenOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return sanitizeRequestSource(value.trim().split(/[\s/]/)[0]);
}

/** Canonical label for a host, if it belongs to a known platform. */
function platformForHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  for (const { label, hosts } of PLATFORMS) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return label;
  }
  return undefined;
}

/** Canonical label for a client name or User-Agent token, if recognised. */
function platformForToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  for (const { label, tokens } of PLATFORMS) {
    if (tokens.some((t) => token.includes(t))) return label;
  }
  return undefined;
}

/**
 * Resolve the best available source for one request.
 *
 * @param remembered The best value seen earlier on this session, if any. It
 *   competes on tier with this request's signals and loses ties, so a fresh
 *   signal always beats a stale one of equal quality.
 */
export function deriveRequestSource(
  input: RequestSourceInput,
  remembered?: RequestSource
): RequestSource {
  const host =
    hostOf(headerValue(input.headers, "origin")) ??
    hostOf(headerValue(input.headers, "referer"));
  const clientName = clientNameOf(input.body);
  const uaToken = userAgentTokenOf(headerValue(input.headers, "user-agent"));

  const candidates: RequestSource[] = [];

  // A recognised platform outranks everything: it is the one value that is
  // stable across ChatGPT's two request paths (connector User-Agent, widget
  // sandbox origin) and across its per-session sandbox subdomains.
  const platform =
    platformForHost(host) ?? platformForToken(clientName) ?? platformForToken(uaToken);
  if (platform) candidates.push({ value: platform, tier: SOURCE_TIER.platform });

  if (host) candidates.push({ value: host, tier: SOURCE_TIER.domain });
  if (clientName) candidates.push({ value: clientName, tier: SOURCE_TIER.clientName });
  if (uaToken) candidates.push({ value: uaToken, tier: SOURCE_TIER.userAgent });

  if (remembered) candidates.push(remembered);
  if (processFallback) candidates.push({ value: processFallback, tier: SOURCE_TIER.fallback });

  let best: RequestSource | undefined;
  for (const candidate of candidates) {
    if (!best || candidate.tier > best.tier) best = candidate;
  }

  return best ?? { value: UNKNOWN_REQUEST_SOURCE, tier: SOURCE_TIER.fallback };
}

const store = new AsyncLocalStorage<RequestSource>();

/** Run `fn` — and everything it awaits — with `source` as the active attribution. */
export function runWithRequestSource<T>(source: RequestSource, fn: () => T): T {
  return store.run(source, fn);
}

/** The active source including its tier, for persisting onto a session record. */
export function currentRequestSource(): RequestSource | undefined {
  return store.getStore();
}

/**
 * The value to stamp on an outgoing API call. Never empty: code paths with no
 * request context at all (startup probes, timers) report "unknown" rather than
 * silently omitting the parameter.
 */
export function getRequestSource(): string {
  return store.getStore()?.value ?? processFallback ?? UNKNOWN_REQUEST_SOURCE;
}
