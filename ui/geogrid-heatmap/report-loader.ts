// This loader has only a resource-read capability: it cannot submit a scan/tool call.
const PROCESSING_DELAYS = [15000, 30000, 60000, 120000];
const FETCH_RETRY_DELAYS = [1000, 3000];

export type GridLoadState = { kind: "loading" | "processing" | "unavailable"; message: string };
export const unavailableMessage = (key: string) =>
  `The grid couldn't be loaded right now. The scan has not been rerun or charged again. Ask ChatGPT to check report ${key} again later.`;

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

function unpackResource(result: any): any {
  if (result?.contents) {
    const content = result.contents.find((item: any) => item.text);
    return typeof content?.text === "string" ? JSON.parse(content.text) : content?.text;
  }
  return typeof result === "string" ? JSON.parse(result) : result;
}

export async function loadReportGrid(
  key: string,
  initial: any,
  options: {
    read: (uri: string) => Promise<unknown>;
    signal: AbortSignal;
    onState: (state: GridLoadState) => void;
    onError: (error: unknown) => void;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  },
): Promise<any | null> {
  const { signal, onState, onError } = options;
  const wait = options.wait ?? waitForRetry;
  const uri = `localfalcon://reports/${encodeURIComponent(key)}/data_points`;
  let processing = initial?._mcp_status === "processing";
  let checks = 0;
  const unavailable = () => {
    if (!signal.aborted) onState({ kind: "unavailable", message: unavailableMessage(key) });
    return null;
  };
  while (!signal.aborted) {
    if (processing) {
      const exhausted = checks >= PROCESSING_DELAYS.length;
      onState({ kind: "processing", message: exhausted
        ? `This scan is still processing. You can ask ChatGPT to check report ${key} again later.`
        : `This Local Falcon scan is still processing. The grid will appear when the report is ready. Report: ${key}.` });
      if (exhausted) return null;
      await wait(PROCESSING_DELAYS[checks++], signal);
      if (signal.aborted) return null;
    } else {
      onState({ kind: "loading", message: `Loading grid data for ${key}...` });
    }

    let result: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await options.read(uri);
        break;
      } catch (error) {
        if (signal.aborted) return null;
        onError(error);
        if (attempt >= FETCH_RETRY_DELAYS.length) return unavailable();
        await wait(FETCH_RETRY_DELAYS[attempt], signal);
        if (signal.aborted) return null;
      }
    }
    if (signal.aborted) return null;
    let data: any;
    try { data = unpackResource(result); }
    catch (error) { onError(error); return unavailable(); }
    // Processing must be checked before grid validation, including envelopes with stale points.
    processing = data?._mcp_status === "processing";
    if (processing) continue;
    if (Array.isArray(data?.data_points) && data.data_points.length > 0) return data;
    onError(new Error("Report resource did not contain grid data or a processing status"));
    return unavailable();
  }
  return null;
}
