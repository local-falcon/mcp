import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AsyncLocalStorage } from "node:async_hooks";

export type McpProfile = "normal" | "chatgpt";
// Per-invocation context lets the API parser handle errors before existing
// clients unwrap envelopes, without changing normal clients or concurrent calls.
const activeProfile = new AsyncLocalStorage<McpProfile>();

/** Consume the existing resolved attribution; never detect clients here. */
export function getMcpProfile(requestSource: string): McpProfile {
  return requestSource === "chatgpt" ? "chatgpt" : "normal";
}

export const CHATGPT_EXCLUDED_TOOLS = new Set([
  "getLocalFalconGoogleBusinessLocations",
  "getLocalFalconRankingAtCoordinate",
  "getLocalFalconKeywordAtCoordinate",
]);

const BLOCKED_KB_IDS = new Set(["15", "16", "23", "37", "57", "81"]);
export const PRICING_URL = "https://www.localfalcon.com/pricing";
export const KB_UNAVAILABLE = `This Knowledge Base article is not available through the ChatGPT integration. For general information about Local Falcon plans and entitlements, visit ${PRICING_URL}.`;
export const INSUFFICIENT_CREDITS = "Your existing Local Falcon credit balance is insufficient for this action, so it was not run.";

export function normalizeArticleId(id: string | number): string {
  return String(id).trim().replace(/^KB/i, "").replace(/^0+(?=\d)/, "");
}

export function isBlockedArticle(id: string | number): boolean {
  return BLOCKED_KB_IDS.has(normalizeArticleId(id));
}

/** Preserve the upstream cursor; total is omitted because it includes denied articles. */
export function filterKnowledgeBaseSearch(response: any): any {
  if (response?.success === false || !Array.isArray(response?.data?.articles)) return response;
  const articles = response.data.articles.filter((article: any) => !isBlockedArticle(article.id));
  const { total: _unfilteredTotal, ...data } = response.data;
  return { ...response, data: { ...data, articles, count: articles.length } };
}

export function textError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function failureText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  // Inspect failure metadata only; never include it verbatim in the final error.
  return JSON.stringify(value) ?? "";
}

function creditAmounts(value: any): { required: number; available: number } | undefined {
  // Only explicit numeric API fields are authoritative. Never infer amounts from
  // grid size, numbers in HTML, a stale balance, or a search cost in the prompt.
  for (const candidate of [value, value?.data]) {
    if (typeof candidate?.required_credits === "number" && Number.isFinite(candidate.required_credits) && candidate.required_credits >= 0 &&
        typeof candidate?.available_credits === "number" && Number.isFinite(candidate.available_credits) && candidate.available_credits >= 0) {
      return { required: candidate.required_credits, available: candidate.available_credits };
    }
  }
}

export function neutralFailure(value: unknown): CallToolResult {
  if (value instanceof ChatGptApiFailure) return value.result;
  const detail = failureText(value);
  if (/insufficient.{0,40}credits?|not (?:have )?enough credits?|credits?.{0,40}insufficient|INSUFFICIENT_CREDITS/i.test(detail)) {
    const amounts = creditAmounts(value);
    return textError(amounts
      ? `This action requires ${amounts.required} existing Local Falcon credits. Your account currently has ${amounts.available} available credits, so the action was not run.`
      : INSUFFICIENT_CREDITS);
  }
  if (/entitlement|subscription|plan|package|upgrade|purchase|checkout|recharge/i.test(detail)) {
    return textError(`Your current Local Falcon account does not include the entitlement required for this action, so it was not run. For information about available Local Falcon plans and credit entitlements, see ${PRICING_URL}.`);
  }
  if (/not found|404|expired|different account/i.test(detail)) {
    return textError("The requested Local Falcon resource is unavailable or is not accessible to this account.");
  }
  if (/401|403|permission|access denied|authentication/i.test(detail)) {
    return textError("This Local Falcon account is not authorized to access the requested resource. Check the connected account and its permissions.");
  }
  // A timeout does not prove the action failed. Do not say it was not run or
  // encourage retrying an operation which may already have consumed credits.
  if (/timeout|timed out|network|abort/i.test(detail)) {
    return textError("The Local Falcon result could not be confirmed. The action may still be processing; check its status before trying again.");
  }
  return textError("Local Falcon could not complete this request. Check the requested parameters and account access.");
}

class ChatGptApiFailure extends Error {
  constructor(readonly result: CallToolResult) {
    super(result.content.filter(item => item.type === "text").map(item => item.text).join("\n"));
  }
}

/** Called before the API client can discard success/message fields. */
export function rejectChatGptApiFailure(value: any, httpFailure = false): void {
  if (activeProfile.getStore() === "chatgpt" && (httpFailure || value?.success === false)) {
    throw new ChatGptApiFailure(neutralFailure(value));
  }
}

/** Normalize application-level failures as well as SDK/HTTP thrown errors. */
export function normalizeChatGptResult(result: CallToolResult): CallToolResult {
  for (const item of result.content) {
    if (item.type !== "text") continue;
    let parsed: any;
    try { parsed = JSON.parse(item.text); } catch { continue; }
    if (parsed?.success === false) return neutralFailure(parsed);
  }
  // Locally-created isError messages contain no upstream content and stay intact.
  return result;
}

export function withProfilePolicy<T extends (...args: any[]) => any>(profile: McpProfile, handler: T): T {
  if (profile === "normal") return handler;
  return ((...args: Parameters<T>) => activeProfile.run(profile, async () => {
    try {
      return normalizeChatGptResult(await handler(...args));
    } catch (error) {
      return neutralFailure(error);
    }
  })) as T;
}

/** The report widget reads an MCP resource, not a tool, but uses the same API. */
export function withResourceProfilePolicy<T extends (...args: any[]) => any>(profile: McpProfile, handler: T): T {
  if (profile === "normal") return handler;
  return ((...args: Parameters<T>) => activeProfile.run(profile, async () => {
    try {
      return await handler(...args);
    } catch (error) {
      const result = neutralFailure(error);
      const message = result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
      return { contents: [{ uri: args[0].href, mimeType: "application/json", text: JSON.stringify({ success: false, message }) }] };
    }
  })) as T;
}

const TRANSACTION_FIELD = /(?:purchase|checkout|upgrade|recharge|payment)[_-]?(?:url|uri|link)|(?:url|uri|link)[_-]?(?:purchase|checkout|upgrade|recharge|payment)/i;
const TRANSACTION_URL = /(?:https?:\/\/buy\.stripe\.com(?:[\/?#]|$)|\/billing\/(?:purchase[-_]credits|auto[-_]recharge)|https?:\/\/[^\s<>"']*(?:checkout|buy[-_]credits|purchase[-_]credits|auto[-_]recharge|\/upgrade(?:[/?#]|$))|\/(?:checkout|buy[-_]credits|purchase[-_]credits|auto[-_]recharge|upgrade)(?:[/?#\s"']|$))/i;
const PROMOTIONAL_COPY = /(?:purchase|buy|get more)\s+(?:more\s+|additional\s+)?credits|enable\s+auto[ -]?recharge|(?:please\s+)?upgrade\s+(?:(?:your|the|a)\s+)?(?:subscription|plan|package|account)|upgrade\s+(?:now|to\b)/i;

/** Small account-only cleanup; preserve normal identity, plan and balance fields.
 * This is not a KB content classifier or a restriction on GBP business content.
 */
export function sanitizeAccountResponse(value: any): any {
  if (typeof value === "string") {
    return TRANSACTION_URL.test(value) || PROMOTIONAL_COPY.test(value) ? undefined : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeAccountResponse).filter(item => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const clean: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (TRANSACTION_FIELD.test(key) || TRANSACTION_URL.test(key) || PROMOTIONAL_COPY.test(key)) continue;
    const safe = sanitizeAccountResponse(field);
    if (safe !== undefined) clean[key] = safe;
  }
  return clean;
}
