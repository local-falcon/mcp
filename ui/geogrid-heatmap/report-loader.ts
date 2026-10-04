// Only the existing read-only report tool may refresh a pending report.
// Completed reports render from tool results; there is no resource-read fallback.
const PROCESSING_DELAYS = [15000, 30000, 60000, 120000];
const FETCH_RETRY_DELAYS = [1000, 3000];
export const REPORT_META_KEY = "localfalcon/report";
export type GridLoadState = { kind: "processing" | "unavailable" | "unauthorized" | "malformed"; message: string };
export type RefreshBudget = { checks: number; retries: number; stopped?: boolean; terminalState?: GridLoadState };
export const unavailableMessage = (key: string) =>
  `The grid couldn't be loaded right now. The scan has not been rerun or charged again. Ask your assistant to check report ${key} again later.`;

export function reportModelData(value: any, depth = 0): any {
  if (depth > 6) return undefined;
  if (typeof value === "string") {
    try { return reportModelData(JSON.parse(value), depth + 1); } catch { return undefined; }
  }
  if (Array.isArray(value)) return reportModelData(value[0], depth + 1);
  if (!value || typeof value !== "object") return undefined;
  if (value.report_key || value.data_points || value._mcp_status || value.error) return value;
  if (value.structuredContent) return reportModelData(value.structuredContent, depth + 1);
  if (Array.isArray(value.content)) return reportModelData(value.content.find((block: any) => block.type === "text")?.text, depth + 1);
  if (value.text !== undefined) return reportModelData(value.text, depth + 1);
  if (value.data !== undefined) return reportModelData(value.data, depth + 1);
  return value;
}
function inlineReport(value: any): any {
  if (!value || typeof value !== "object") return undefined;
  const result = value.call_tool_result ?? value.mcp_tool_result ?? value;
  return result?._meta?.[REPORT_META_KEY] ?? result?.[REPORT_META_KEY];
}
export function reportFromToolResult(result: any, toolResponseMetadata?: any): any {
  const original = toolResponseMetadata?.call_tool_result ?? toolResponseMetadata?.mcp_tool_result ??
    (toolResponseMetadata?.content || toolResponseMetadata?.isError ? toolResponseMetadata : undefined);
  const report = reportModelData(result) ?? reportModelData(original);
  const failed = result?.isError ? result : original?.isError ? original : undefined;
  if (failed) return { ...report, error: failed.content?.find((block: any) => block.type === "text")?.text ?? report?.error, _widget_error: "tool" };
  const inline = inlineReport(result) ?? inlineReport(toolResponseMetadata);
  if (inline !== undefined) {
    if (!inline || typeof inline !== "object" || Array.isArray(inline) ||
        (report?.report_key && inline.report_key !== report.report_key)) {
      return { report_key: report?.report_key, _widget_error: "malformed" };
    }
    return { ...report, ...inline };
  }
  return report;
}
function errorText(value: any): string {
  return value instanceof Error ? value.message : typeof value === "string" ? value : JSON.stringify(value ?? "");
}
export function isPermissionError(value: any): boolean {
  return /outside its widget scope|unauthori[sz]ed|not authori[sz]ed|authentication|not accessible to this account|forbidden|access denied|permission|not permitted|not allowed|\b401\b|\b403\b/i.test(errorText(value));
}
function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
export async function loadReportGrid(
  key: string, initial: any,
  options: {
    refresh?: (key: string, signal: AbortSignal) => Promise<unknown>;
    signal: AbortSignal;
    budget: RefreshBudget;
    onState: (state: GridLoadState) => void;
    onError: (error: unknown) => void;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  },
): Promise<any | null> {
  const { signal, onState, onError, budget } = options;
  const wait = options.wait ?? waitForRetry;
  const fail = (kind: GridLoadState["kind"], message: string) => {
    budget.stopped = true;
    budget.terminalState = { kind, message };
    if (!signal.aborted) onState({ kind, message });
    return null;
  };
  const denied = () => fail("unauthorized", `This report cannot be accessed with the current connection. Ask your assistant to check access to report ${key}.`);
  let data = initial;
  while (!signal.aborted) {
    if (data?._widget_error || data?.error || data?.success === false || data?._mcp_status === "unauthorized") {
      if (isPermissionError(data) || data?._mcp_status === "unauthorized") return denied();
      return fail(data?._widget_error === "malformed" ? "malformed" : "unavailable", unavailableMessage(key));
    }
    if (data?.report_key !== key) return fail("malformed", `The report response could not be understood. Ask your assistant to retrieve report ${key} again.`);
    if (data._mcp_status !== "processing") {
      if (Array.isArray(data.data_points) && data.data_points.length > 0 &&
          data.data_points.every((point: any) => point &&
            [point.lat, point.lng].every(coord => (typeof coord === "number" || (typeof coord === "string" && coord.trim() !== "")) && Number.isFinite(Number(coord))))) return data;
      return fail(data._mcp_status === "unavailable" ? "unavailable" : "malformed", unavailableMessage(key));
    }
    if (budget.terminalState) {
      onState(budget.terminalState);
      return null;
    }
    const canRefresh = !!options.refresh && !budget.stopped && budget.checks < PROCESSING_DELAYS.length;
    onState({ kind: "processing", message: canRefresh
      ? `This Local Falcon scan is still processing. The grid will appear when the report is ready. Report: ${key}.`
      : `This scan is still processing. Ask your assistant to check report ${key} again later.` });
    if (!canRefresh) return null;
    await wait(PROCESSING_DELAYS[budget.checks++], signal);
    if (signal.aborted) return null;
    let result: any;
    for (;;) {
      try { result = await options.refresh!(key, signal); break; }
      catch (error) {
        if (signal.aborted) return null;
        onError(error);
        if (isPermissionError(error)) return denied();
        if (!/failed to fetch|network|connection reset|timeout|timed out/i.test(errorText(error)) ||
            budget.retries >= FETCH_RETRY_DELAYS.length) return fail("unavailable", unavailableMessage(key));
        await wait(FETCH_RETRY_DELAYS[budget.retries++], signal);
        if (signal.aborted) return null;
      }
    }
    if (signal.aborted) return null;
    data = reportFromToolResult(result);
  }
  return null;
}
