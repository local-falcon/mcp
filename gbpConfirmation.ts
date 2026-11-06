import crypto from "crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ════════════════════════════════════════════════════════════════════════════
// Human confirmation gate for destructive Google Business Profile writes
// ════════════════════════════════════════════════════════════════════════════
//
// The Local Falcon API demands a literal confirmation token (DELETE_POST,
// REPLACE_SERVICES, ...) on its destructive /gbp/* endpoints. localfalcon.ts
// supplies those tokens itself, so from the API's point of view the caller has
// always "confirmed" — which is exactly the safeguard an AI model should not be
// able to satisfy on its own. This module puts a human back in the loop before
// any of those seven operations is sent, without changing what the API sees.
//
// Two paths, chosen by what the connected client can do:
//
//   1. Elicitation dialog (hard gate). If the client declared `elicitation.form`
//      in its initialize capabilities, the server asks the client to show the
//      user an approval dialog and proceeds only on an explicit accept. The
//      model never sees or answers the dialog.
//
//   2. Preview → token (in-conversation confirm step). Clients that cannot show
//      a dialog get a preview describing the exact operation plus a
//      server-minted confirmationToken bound to a hash of the arguments. The
//      tool must be called again with identical arguments and the token. Tokens
//      are single-use, expire after DEFAULT_TOKEN_TTL_MS, and live in a small
//      per-session map, so a stale or altered request can never be approved
//      "half-specified".
//
// Path 1 falls back to path 2 when the dialog goes unanswered for the elicit
// timeout, or the request fails. Advertising elicitation does not guarantee the
// request can be delivered: on 2026-09-28 the claude.ai connector proxy in front
// of Claude Code passed the client's elicitation capability through to staging
// but never relayed the server's request, so every destructive call there hung
// until the client gave up. Refusing in that case would make those actions
// unusable; falling back keeps the model-mediated confirm step. No answer is
// never treated as approval: the SDK cancels the dialog request on timeout
// (notifications/cancelled), a late accept lands on a request id the server has
// already forgotten, and by then this call has already returned the preview.
//
// The timeout is short on the remote transports, where a proxy may sit in the
// path, and longer on STDIO, where delivery is one pipe and a human needs time
// to read the summary. GBP_CONFIRM_TIMEOUT_MS overrides both.
//
// Transport note: the elicitation is sent via server.server.elicitInput(),
// never via ctx.sendRequest(). The latter tags the request with
// relatedRequestId, and in Streamable HTTP with enableJsonResponse (index.ts)
// such a request is never written. Untagged requests ride the standalone GET
// stream, which the HTTP handler exposes.
//
// Results never throw and never carry `success:false` or `isError`, so the
// ChatGPT profile wrapper (chatgptPolicy.ts) passes them through untouched.
// Every decision is logged to stderr as "[gbp-confirm] ..." so two clients that
// behave differently can be compared from the server logs alone.

export type GbpConfirmOperation =
  | "DELETE_POST"
  | "DELETE_MEDIA"
  | "DELETE_REPLY"
  | "DELETE_LINK"
  | "REPLACE_SERVICES"
  | "CLOSED_PERMANENTLY"
  | "SET_ATTRIBUTES";

/** The slice of McpServer the gate needs. `McpServer` satisfies it via `.server`. */
export type GateServer = { server: Pick<Server, "getClientCapabilities" | "elicitInput" | "transport"> };

export interface GateOptions {
  /** Clock, injectable for expiry tests. */
  now?: () => number;
  tokenTtlMs?: number;
  /** Fixed dialog timeout; otherwise GBP_CONFIRM_TIMEOUT_MS, else the per-transport default. */
  elicitTimeoutMs?: number;
  maxTokens?: number;
  mintToken?: () => string;
}

export interface GateRequest {
  tool: string;
  operation: GbpConfirmOperation;
  /** The full parsed tool arguments, including any confirmationToken. */
  args: Record<string, unknown>;
  signal?: AbortSignal;
}

export type GateOutcome = { approved: true } | { approved: false; result: CallToolResult };

export const DEFAULT_TOKEN_TTL_MS = 10 * 60_000;
/** HTTP/SSE: a connector proxy may advertise elicitation it cannot deliver, so give up fast. */
export const DEFAULT_REMOTE_ELICIT_TIMEOUT_MS = 10_000;
/** STDIO and in-process: delivery is guaranteed, so leave time to read and click. */
export const DEFAULT_LOCAL_ELICIT_TIMEOUT_MS = 45_000;
export const MAX_PENDING_TOKENS = 20;

export const CANCELLED_TEXT =
  "Cancelled by the user. Nothing was changed on the Google Business Profile. Do not retry unless the user asks again.";
export const PREVIEW_INSTRUCTIONS =
  "Show the summary and warning to the user and wait for their explicit approval. Only after the user approves, call this tool again with exactly the same arguments plus this confirmationToken. Never approve on the user's behalf. If the user declines, do not call again.";

type TokenRejection = "unknown" | "expired" | "mismatch";
type PromptFallback = "timed_out" | "failed";

const REJECTION_NOTE: Record<TokenRejection, string> = {
  unknown: "not recognised (already used, or issued to a different session)",
  expired: "expired",
  mismatch: "issued for different arguments",
};

interface PendingToken {
  hash: string;
  operation: GbpConfirmOperation;
  expiresAt: number;
}

export interface OperationDescription {
  summary: string;
  warning: string;
  details: Record<string, unknown>;
}

// ── Describers ──────────────────────────────────────────────────────────────
// Built from the tool arguments only. The place ID is the only location
// identifier available without a further API call; the surrounding
// conversation supplies the business name.

const MAX_LISTED = 10;

function ident(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "(unspecified)";
}

function fmt(value: unknown): string {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
}

function listed(items: unknown[], render: (item: any) => string): string {
  const shown = items.slice(0, MAX_LISTED).map(render);
  return items.length > MAX_LISTED ? `${shown.join(", ")}, … (+${items.length - MAX_LISTED} more)` : shown.join(", ");
}

function attributeHint(attr: any): string {
  const parts: string[] = [];
  if (Array.isArray(attr?.values) && attr.values.length) parts.push(`=${attr.values.map(fmt).join("|")}`);
  if (Array.isArray(attr?.set_values) && attr.set_values.length) parts.push(`+${attr.set_values.map(fmt).join("|")}`);
  if (Array.isArray(attr?.unset_values) && attr.unset_values.length) parts.push(`-${attr.unset_values.map(fmt).join("|")}`);
  if (Array.isArray(attr?.uris) && attr.uris.length) parts.push(`uris=${attr.uris.map(fmt).join("|")}`);
  return parts.join(" ");
}

const DESCRIBERS: Record<GbpConfirmOperation, (args: Record<string, any>) => OperationDescription> = {
  DELETE_POST: (a) => ({
    summary: `Permanently delete post ${ident(a.postId)} from the Google Business Profile ${ident(a.placeId)}.`,
    warning: "Deleted posts cannot be recovered.",
    details: { placeId: a.placeId, postId: a.postId },
  }),
  DELETE_MEDIA: (a) => ({
    summary: `Permanently delete media item ${ident(a.mediaId)} from the Google Business Profile ${ident(a.placeId)}.`,
    warning: "Deleted media cannot be recovered.",
    details: { placeId: a.placeId, mediaId: a.mediaId },
  }),
  DELETE_REPLY: (a) => ({
    summary: `Delete the owner reply to review ${ident(a.reviewId)} on the Google Business Profile ${ident(a.placeId)}. The reply disappears publicly.`,
    warning: "A deleted reply cannot be recovered; the customer's review itself stays.",
    details: { placeId: a.placeId, reviewId: a.reviewId },
  }),
  DELETE_LINK: (a) => ({
    summary: `Remove action link ${ident(a.linkId)} from the Google Business Profile ${ident(a.placeId)}.`,
    warning: "A removed link must be recreated manually if it is needed again.",
    details: { placeId: a.placeId, linkId: a.linkId },
  }),
  REPLACE_SERVICES: (a) => {
    const services: unknown[] = Array.isArray(a.services) ? a.services : [];
    const names = listed(services, (svc) => ident(svc?.name ?? svc?.service_type_id));
    return {
      summary: `Replace the ENTIRE service list on the Google Business Profile ${ident(a.placeId)} with ${services.length} service(s): ${names}.`,
      warning: "Every existing service not in this list is removed.",
      details: { placeId: a.placeId, services },
    };
  },
  CLOSED_PERMANENTLY: (a) => ({
    summary: `Mark the Google Business Profile ${ident(a.placeId)} as CLOSED_PERMANENTLY on Google.`,
    warning: "Google treats permanent closure as effectively irreversible.",
    details: { placeId: a.placeId, status: "CLOSED_PERMANENTLY", ...(a.openingDate ? { openingDate: a.openingDate } : {}) },
  }),
  SET_ATTRIBUTES: (a) => {
    const attributes: unknown[] = Array.isArray(a.attributes) ? a.attributes : [];
    const rendered = listed(attributes, (attr) => `${ident(attr?.name)}${attributeHint(attr) ? " " + attributeHint(attr) : ""}`);
    return {
      summary: `Set ${attributes.length} attribute(s) on the Google Business Profile ${ident(a.placeId)}: ${rendered}.`,
      warning: "Attributes set through the API cannot currently be removed through the API (known limitation, issue #40); undoing them requires manual edits in Google Business Profile.",
      details: { placeId: a.placeId, attributes },
    };
  },
};

export function describeGbpOperation(operation: GbpConfirmOperation, args: Record<string, unknown>): OperationDescription {
  return DESCRIBERS[operation](args);
}

// ── Argument hashing ────────────────────────────────────────────────────────

/**
 * Deterministic JSON: keys sorted, `undefined`/`null`/"" dropped at every depth
 * (the same three values appendFormValue in localfalcon.ts never sends), and a
 * container left empty by that stripping is dropped too, because it would put
 * no fields on the wire either. Array order is preserved. So `openingDate: ""`
 * on the preview call and an omitted openingDate on the confirming call hash
 * identically, as do `callToAction: { url: "" }` and no callToAction.
 */
export function stableStringify(value: unknown): string {
  const normalized = normalize(value);
  return JSON.stringify(normalized === undefined ? null : normalized);
}

function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    const entries = value.map(normalize).filter((entry) => entry !== undefined);
    return entries.length ? entries : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = normalize((value as Record<string, unknown>)[key]);
      if (entry !== undefined) out[key] = entry;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** HTTP and legacy SSE: a connector proxy may sit between us and the client. */
export function isRemoteTransport(transport: Transport | undefined): boolean {
  return transport instanceof StreamableHTTPServerTransport || transport instanceof SSEServerTransport;
}

function transportKind(transport: Transport | undefined): string {
  if (transport instanceof StreamableHTTPServerTransport) return "streamable-http";
  if (transport instanceof SSEServerTransport) return "sse";
  return transport ? transport.constructor?.name ?? "unknown" : "none";
}

function isRequestTimeout(error: unknown): boolean {
  return error instanceof McpError && error.code === ErrorCode.RequestTimeout;
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function log(message: string): void {
  // stderr only: in STDIO mode stdout is the protocol channel.
  console.error(`[gbp-confirm] ${message}`);
}

// ── Gate ────────────────────────────────────────────────────────────────────

export function createGbpConfirmationGate(gateServer: GateServer, options: GateOptions = {}) {
  const now = options.now ?? Date.now;
  const tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
  const maxTokens = options.maxTokens ?? MAX_PENDING_TOKENS;
  const mintToken = options.mintToken ?? (() => crypto.randomBytes(16).toString("hex"));
  // Insertion-ordered, so the first key is always the oldest entry.
  const pending = new Map<string, PendingToken>();

  function resolveElicitTimeout(): number {
    if (options.elicitTimeoutMs !== undefined) return options.elicitTimeoutMs;
    const raw = Number(process.env.GBP_CONFIRM_TIMEOUT_MS);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return isRemoteTransport(gateServer.server.transport) ? DEFAULT_REMOTE_ELICIT_TIMEOUT_MS : DEFAULT_LOCAL_ELICIT_TIMEOUT_MS;
  }

  function pruneExpired(): void {
    const current = now();
    for (const [token, entry] of pending) {
      if (entry.expiresAt <= current) pending.delete(token);
    }
  }

  function mint(hash: string, operation: GbpConfirmOperation): string {
    pruneExpired();
    while (pending.size >= maxTokens) {
      const oldest = pending.keys().next().value;
      if (oldest === undefined) break;
      pending.delete(oldest);
    }
    const token = mintToken();
    pending.set(token, { hash, operation, expiresAt: now() + tokenTtlMs });
    return token;
  }

  function clientSupportsFormElicitation(): boolean {
    // Mirrors the SDK's own guard in Server.elicitInput, so we never call into
    // a path that would throw "Client does not support form elicitation".
    return Boolean(gateServer.server.getClientCapabilities()?.elicitation?.form);
  }

  function cancelled(): GateOutcome {
    return { approved: false, result: textResult(CANCELLED_TEXT) };
  }

  function preview(
    req: GateRequest,
    description: OperationDescription,
    token: string,
    rejected?: TokenRejection,
    fallback?: { reason: PromptFallback; timeoutMs: number },
  ): GateOutcome {
    const payload: Record<string, unknown> = {
      confirmation_required: true,
      changed: false,
      tool: req.tool,
      operation: req.operation,
      summary: description.summary,
      warning: description.warning,
      details: description.details,
      confirmationToken: token,
      expires_in_seconds: Math.round(tokenTtlMs / 1000),
      instructions: PREVIEW_INSTRUCTIONS,
    };
    if (rejected) {
      payload.previous_token = rejected;
      payload.note = `The supplied confirmationToken was ${REJECTION_NOTE[rejected]}; a new token was issued. Nothing was changed.`;
    }
    if (fallback) {
      payload.approval_prompt = fallback.reason;
      payload.approval_prompt_note = fallback.reason === "timed_out"
        ? `The client advertised an approval dialog but did not answer it within ${Math.round(fallback.timeoutMs / 1000)} s, so nothing was changed. Confirm with the user in the conversation instead, then call again with the confirmationToken.`
        : "The client advertised an approval dialog but it failed, so nothing was changed. Confirm with the user in the conversation instead, then call again with the confirmationToken.";
    }
    return { approved: false, result: textResult(JSON.stringify(payload, null, 2)) };
  }

  async function confirm(req: GateRequest): Promise<GateOutcome> {
    const label = `${req.operation} via ${req.tool}`;
    const { confirmationToken: rawToken, ...rest } = req.args;
    const token = typeof rawToken === "string" && rawToken.trim() ? rawToken.trim() : undefined;
    const hash = sha256(stableStringify({ tool: req.tool, operation: req.operation, args: rest }));

    // A supplied token is checked first so a legitimate second call on the
    // token path never waits on a dialog. It is consumed whatever the outcome.
    let rejected: TokenRejection | undefined;
    if (token) {
      const entry = pending.get(token);
      pending.delete(token);
      if (!entry) rejected = "unknown";
      else if (entry.expiresAt <= now()) rejected = "expired";
      else if (entry.hash !== hash) rejected = "mismatch";
      else {
        log(`${label}: confirmationToken accepted`);
        return { approved: true };
      }
      log(`${label}: confirmationToken rejected (${rejected})`);
    }

    if (req.signal?.aborted) return cancelled();

    const description = describeGbpOperation(req.operation, rest);
    let fallback: { reason: PromptFallback; timeoutMs: number } | undefined;

    if (clientSupportsFormElicitation()) {
      // A bad token on an elicitation-capable client is simply ignored: the
      // human is asked. A token is minted on this path only if the dialog
      // itself goes unanswered or fails.
      const timeoutMs = resolveElicitTimeout();
      const started = now();
      log(`${label}: approval dialog sent over ${transportKind(gateServer.server.transport)} transport; waiting up to ${timeoutMs} ms`);
      try {
        const result = await gateServer.server.elicitInput(
          {
            mode: "form",
            message: `${description.summary}\n\n${description.warning}\n\nApprove this change to your Google Business Profile?`,
            requestedSchema: {
              type: "object",
              properties: {
                confirm: {
                  type: "boolean",
                  title: "Yes, apply this change",
                  description: "Leave unticked, or cancel, to keep everything unchanged.",
                  default: false,
                },
              },
              required: ["confirm"],
            },
          },
          { timeout: timeoutMs, signal: req.signal },
        );
        const approved = result.action === "accept" && result.content?.confirm === true;
        log(`${label}: dialog answered "${result.action}"${result.action === "accept" ? ` confirm=${String(result.content?.confirm)}` : ""} after ${now() - started} ms; ${approved ? "approved" : "cancelled"}`);
        return approved ? { approved: true } : cancelled();
      } catch (error) {
        if (req.signal?.aborted) {
          log(`${label}: tool call cancelled by the client while the dialog was open`);
          return cancelled();
        }
        fallback = { reason: isRequestTimeout(error) ? "timed_out" : "failed", timeoutMs };
        log(fallback.reason === "timed_out"
          ? `${label}: dialog unanswered after ${now() - started} ms; falling back to a confirmation token`
          : `${label}: dialog failed (${error instanceof Error ? error.message : String(error)}); falling back to a confirmation token`);
      }
    }

    log(`${label}: preview issued with a confirmation token`);
    return preview(req, description, mint(hash, req.operation), rejected, fallback);
  }

  return { confirm };
}

export type GbpConfirmationGate = ReturnType<typeof createGbpConfirmationGate>;
