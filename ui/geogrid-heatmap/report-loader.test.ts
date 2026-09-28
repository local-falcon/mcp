import { expect, test } from "bun:test";
import { loadReportGrid } from "./report-loader";

const key = "494b540411352e4";
const pending = { report_key: key, _mcp_status: "processing" };
const completed = { data_points: [{ lat: 41, lng: -81, rank: 1 }], places: {} };
const resource = (data: unknown) => ({ contents: [{ text: JSON.stringify(data) }] });

function fixture(responses: unknown[], initial: unknown = pending) {
  const reads: string[] = [];
  const waits: number[] = [];
  const states: any[] = [];
  const controller = new AbortController();
  return {
    reads, waits, states, controller,
    run: () => loadReportGrid(key, initial, {
      read: async (uri) => {
        reads.push(uri);
        const next = responses.shift() ?? resource(pending);
        if (next instanceof Error) throw next;
        return next;
      },
      wait: async (ms) => { waits.push(ms); },
      onState: (state) => states.push(state),
      onError: () => {},
      signal: controller.signal,
    }),
  };
}

test("initial processing waits before first read, polls only the same resource four times and stays non-error", async () => {
  const f = fixture([]);
  const promise = f.run();
  expect(f.reads).toEqual([]);
  expect(f.states[0].kind).toBe("processing");
  expect(await promise).toBeNull();
  expect(f.waits).toEqual([15000, 30000, 60000, 120000]);
  expect(f.reads).toEqual(Array(4).fill(`localfalcon://reports/${key}/data_points`));
  expect(f.states.every(s => s.kind === "processing")).toBe(true);
  expect(f.states.at(-1).message).toContain(key);
});

test("processing takes precedence over even stale data_points and eventual completion preserves full payload", async () => {
  const f = fixture([resource({ ...pending, data_points: completed.data_points }), resource(completed)]);
  expect(await f.run()).toEqual(completed);
  expect(f.waits).toEqual([15000, 30000]);
});

test("completed tool result loads its resource immediately and returns unchanged grid data", async () => {
  const f = fixture([resource(completed)], { report_key: key });
  expect(await f.run()).toEqual(completed);
  expect(f.waits).toEqual([]);
  expect(f.reads).toHaveLength(1);
});

test("initial resource processing is recognized before any missing-data failure", async () => {
  const f = fixture([resource(pending), resource(completed)], { report_key: key });
  expect(await f.run()).toEqual(completed);
  expect(f.waits).toEqual([15000]);
  expect(f.states.some(s => s.kind === "unavailable")).toBe(false);
});

test("transient resource errors retry twice with bounded backoff and recover", async () => {
  const f = fixture([new Error("Failed to fetch"), new Error("connection reset"), resource(completed)], { report_key: key });
  expect(await f.run()).toEqual(completed);
  expect(f.waits).toEqual([1000, 3000]);
  expect(f.reads).toHaveLength(3);
});

test("exhausted transient retries show friendly state, never raw technical error", async () => {
  const f = fixture(Array(3).fill(new Error("MCP error -32000: Failed to fetch")), { report_key: key });
  expect(await f.run()).toBeNull();
  expect(f.waits).toEqual([1000, 3000]);
  expect(f.reads).toHaveLength(3);
  expect(f.states.at(-1).kind).toBe("unavailable");
  expect(f.states.at(-1).message).toContain("has not been rerun or charged again");
  expect(f.states.at(-1).message).not.toMatch(/-32000|Check console|Failed to fetch/);
});

test("replacement tool result cancels pending polling without another read", async () => {
  const f = fixture([]);
  const promise = f.run();
  f.controller.abort();
  expect(await promise).toBeNull();
  expect(f.reads).toEqual([]);
});

test("late resource response after cancellation cannot reach completed renderer", async () => {
  const controller = new AbortController();
  let finish!: (value: unknown) => void;
  const promise = loadReportGrid(key, { report_key: key }, {
    read: () => new Promise(resolve => { finish = resolve; }),
    signal: controller.signal, onState: () => {}, onError: () => {},
  });
  controller.abort();
  finish(resource(completed));
  expect(await promise).toBeNull();
});

test("malformed completed response does not expose missing-data internals", async () => {
  const f = fixture([resource({ items: [] })], { report_key: key });
  expect(await f.run()).toBeNull();
  expect(f.reads).toHaveLength(1);
  expect(f.states.at(-1).kind).toBe("unavailable");
  expect(f.states.at(-1).message).not.toContain("data_points");
});

// Exercise the actual widget event handler with DOM/renderer stand-ins. Tool calls
// are forbidden at this boundary; only resources/read can be used during polling.
async function widgetHarness(responses: unknown[]) {
  const source = await Bun.file(new URL("./main.ts", import.meta.url)).text();
  const lifecycle = source.slice(source.indexOf("let activeLoad:"), source.indexOf("await app.connect();"));
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(lifecycle);
  const loading = { textContent: "", classList: { add() {}, remove() {} } };
  const rendered: any[] = [];
  const metrics: any[] = [];
  const reads: string[] = [];
  let forbiddenCalls = 0;
  const app: any = {
    readServerResource: async ({ uri }: { uri: string }) => {
      reads.push(uri);
      const response = responses.shift() ?? resource(pending);
      if (response instanceof Error) throw response;
      return response;
    },
    callServerTool: () => { forbiddenCalls++; throw new Error("No tool calls permitted"); },
    sendSizeChanged: async () => {},
  };
  new Function("app", "loadingEl", "loadReportGrid", "unavailableMessage", "renderMetrics", "renderMap",
    "renderFallbackGrid", "allZeroCoords", "mapContainerEl", "metricsPanelEl", "console",
    `let scanReport, gridData; ${js}`)(
      app, loading,
      (key: string, initial: unknown, options: any) => loadReportGrid(key, initial, { ...options, wait: async () => {} }),
      (await import("./report-loader")).unavailableMessage,
      (report: unknown) => metrics.push(report),
      async (report: unknown, grid: unknown) => rendered.push({ report, grid }),
      () => { throw new Error("Unexpected fallback renderer"); },
      () => false, { offsetWidth: 500 }, { offsetHeight: 40 }, { log() {}, error() {} },
    );
  return { app, loading, rendered, metrics, reads, forbiddenCalls: () => forbiddenCalls };
}

test("widget routes pending result to completed map renderer with restored report metadata and no tool calls", async () => {
  const grid = { ...completed, keyword: "department store sales", platform: "gemini", grid_size: 3, radius: 1 };
  const widget = await widgetHarness([resource(pending), resource(grid)]);
  await widget.app.ontoolresult({ structuredContent: { text: JSON.stringify(pending) } });
  expect(widget.rendered).toHaveLength(1);
  expect(widget.rendered[0].grid).toEqual(grid);
  expect(widget.rendered[0].report.keyword).toBe(grid.keyword);
  expect(widget.metrics[0].platform).toBe("gemini");
  expect(widget.rendered[0].report.report_key).toBe(key);
  expect(widget.forbiddenCalls()).toBe(0);
});

test("widget processing exhaustion and failed retries never display missing data or technical errors", async () => {
  for (const responses of [[], Array(3).fill(new Error("MCP error -32000: Failed to fetch"))]) {
    const widget = await widgetHarness(responses);
    await widget.app.ontoolresult({ content: [{ type: "text", text: JSON.stringify(pending) }] });
    expect(widget.rendered).toEqual([]);
    expect(widget.loading.textContent).toContain(key);
    expect(widget.loading.textContent).not.toMatch(/No data_points|Check console|-32000|Failed to fetch/);
    expect(widget.forbiddenCalls()).toBe(0);
  }
});
