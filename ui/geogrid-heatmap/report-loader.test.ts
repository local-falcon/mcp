import { expect, test } from "bun:test";
import { loadReportGrid, reportFromToolResult, reportModelData, isPermissionError, unavailableMessage, type RefreshBudget } from "./report-loader";

const key = "494b540411352e4";
const pending = { report_key: key, _mcp_status: "processing" };
const completed = { report_key: key, data_points: [{ lat: 41, lng: -81, rank: 1 }], places: {} };
const tool = (data: any) => ({ content: [{ type: "text", text: JSON.stringify({ report_key: data.report_key, _mcp_status: data._mcp_status }) }], _meta: { "localfalcon/report": data } });

function fixture(responses: unknown[], initial: unknown = pending, budget: RefreshBudget = { checks: 0, retries: 0 }) {
  const calls: string[] = [], waits: number[] = [], states: any[] = [];
  const controller = new AbortController();
  return { calls, waits, states, controller, budget, run: () => loadReportGrid(key, initial, {
    refresh: async (reportKey) => {
      calls.push(reportKey);
      const next = responses.shift() ?? tool(pending);
      if (next instanceof Error) throw next;
      return next;
    },
    wait: async ms => { waits.push(ms); }, budget,
    onState: state => states.push(state), onError: () => {}, signal: controller.signal,
  }) };
}

test("completed inline data returns unchanged without calls or waits", async () => {
  const f = fixture([], completed);
  expect(await f.run()).toEqual(completed);
  expect(f.calls).toEqual([]);
  expect(f.waits).toEqual([]);
});

test("processing takes precedence over stale points and restores complete metadata", async () => {
  const full = { ...completed, keyword: "department store", platform: "gemini", ai_place_id: "ai-target", sources: [{ href: "https://example.test" }] };
  const f = fixture([tool({ ...pending, data_points: completed.data_points }), tool(full)]);
  expect(await f.run()).toEqual(full);
  expect(f.waits).toEqual([15000, 30000]);
});

test("pending polling has four same-report checks and cannot reset its lifetime budget", async () => {
  const f = fixture([]);
  expect(await f.run()).toBeNull();
  expect(f.calls).toEqual(Array(4).fill(key));
  expect(f.waits).toEqual([15000, 30000, 60000, 120000]);
  const again = fixture([], pending, f.budget);
  expect(await again.run()).toBeNull();
  expect(again.calls).toEqual([]);
  expect(again.states.at(-1).message).toContain("again later");
});

test("unsupported read-only bridge shows honest check-later state without calls", async () => {
  const states: any[] = [];
  expect(await loadReportGrid(key, pending, { signal: new AbortController().signal, budget: { checks: 0, retries: 0 }, onState: s => states.push(s), onError: () => {} })).toBeNull();
  expect(states.at(-1)).toMatchObject({ kind: "processing" });
  expect(states.at(-1).message).toContain(key);
  expect(states.at(-1).message).toContain("again later");
});

test("network failures retry at most twice, with a persistent retry budget", async () => {
  const f = fixture([new Error("Failed to fetch"), new Error("connection reset"), tool(completed)]);
  expect(await f.run()).toEqual(completed);
  expect(f.waits).toEqual([15000, 1000, 3000]);
  expect(f.calls).toHaveLength(3);
  const next = fixture([new Error("Failed to fetch")], pending, f.budget);
  expect(await next.run()).toBeNull();
  expect(next.calls).toHaveLength(1);
  expect(next.states.at(-1).kind).toBe("unavailable");
});

test("scope and authorization denials stop permanently with no retry", async () => {
  for (const denied of [new Error("MCP app cannot read resource outside its widget scope."),
    { isError: true, content: [{ type: "text", text: "This Local Falcon account is not authorized to view that report." }] },
    { isError: true, content: [{ type: "text", text: "Authentication failed. Check your API key." }] },
    { content: [{ type: "text", text: JSON.stringify({ report_key: key, success: false, message: "Report is not accessible to this account" }) }] },
  ]) {
    const f = fixture([denied]);
    expect(await f.run()).toBeNull();
    expect(f.calls).toHaveLength(1);
    expect(f.waits).toEqual([15000]);
    expect(f.states.at(-1).kind).toBe("unauthorized");
    const next = fixture([], pending, f.budget);
    await next.run();
    expect(next.calls).toEqual([]);
    expect(next.states.at(-1).kind).toBe("unauthorized");
  }
});

test("malformed and unavailable responses do not become processing", async () => {
  for (const initial of [{ report_key: key }, { ...completed, data_points: [{ lat: null, lng: 0 }] }, { ...completed, data_points: [{ lat: "", lng: 0 }] }, { report_key: key, _mcp_status: "unavailable" }]) {
    const f = fixture([], initial);
    expect(await f.run()).toBeNull();
    expect(f.calls).toEqual([]);
    expect(f.states.at(-1).kind).toBe(initial._mcp_status === "unavailable" ? "unavailable" : "malformed");
    expect(f.states.at(-1).message).not.toMatch(/No data_points|Check console|still processing/);
  }
});

test("cancellation suppresses pending calls and late results", async () => {
  const f = fixture([]);
  const promise = f.run(); f.controller.abort();
  expect(await promise).toBeNull(); expect(f.calls).toEqual([]);
  const controller = new AbortController();
  let finish!: (value: unknown) => void;
  const late = loadReportGrid(key, pending, { refresh: () => new Promise(resolve => { finish = resolve; }), wait: async () => {}, signal: controller.signal, budget: { checks: 0, retries: 0 }, onState: () => {}, onError: () => {} });
  await Promise.resolve(); controller.abort(); finish(tool(completed));
  expect(await late).toBeNull();
});

test("decoder preserves MCP, Claude double encoding and both canonical ChatGPT metadata envelopes", () => {
  expect(reportFromToolResult(tool(completed))).toEqual(completed);
  const slim = { report_key: key };
  for (const name of ["call_tool_result", "mcp_tool_result"]) expect(reportFromToolResult({ text: JSON.stringify(slim) }, { [name]: tool(completed) })).toEqual(completed);
  expect(reportFromToolResult(slim, { "localfalcon/report": completed })).toEqual(completed);
  expect(reportFromToolResult({ content: [{ type: "text", text: JSON.stringify({ text: JSON.stringify(pending) }) }] })).toEqual(pending);
  expect(reportFromToolResult({ structuredContent: { text: JSON.stringify(pending) } })).toEqual(pending);
});

test("decoder rejects cross-report metadata and never lets stale success override errors", () => {
  expect(reportFromToolResult({ report_key: "other" }, { call_tool_result: tool(completed) })).toMatchObject({ report_key: "other", _widget_error: "malformed" });
  const denied = { isError: true, content: [{ type: "text", text: "Forbidden" }] };
  expect(reportFromToolResult({ report_key: key }, { call_tool_result: { ...tool(completed), ...denied } })).toMatchObject({ error: "Forbidden", _widget_error: "tool" });
  expect(reportFromToolResult(undefined, { ...tool(completed), ...denied })).toMatchObject({ error: "Forbidden", _widget_error: "tool" });
});

// Executes the production event/refresh wiring. A resource read throws the exact
// reviewer error; any added mutation fails immediately at the host boundary.
async function widgetHarness(responses: unknown[] = [], support = true, globals: any = {}, mapWait?: Promise<void>, duringConnect?: (app: any) => Promise<void>) {
  const source = await Bun.file(new URL("./main.ts", import.meta.url)).text();
  const lifecycle = source.slice(source.indexOf("let activeLoad:"), duringConnect ? undefined : source.indexOf("await app.connect();"));
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(lifecycle);
  const element = () => ({ textContent: "", innerHTML: "", style: {}, offsetWidth: 500, offsetHeight: 40, classList: { hidden: false, add() { this.hidden = true; }, remove() { this.hidden = false; } } });
  const loading = element(); const rendered: any[] = [], metrics: any[] = [], reads: string[] = [], calls: any[] = [];
  const mapContainer = element();
  const listeners: Record<string, Function> = {};
  const window: any = { openai: globals, addEventListener: (name: string, fn: Function) => { listeners[name] = fn; } };
  const app: any = {
    readServerResource: ({ uri }: any) => { reads.push(uri); throw new Error("MCP app cannot read resource outside its widget scope."); },
    getHostCapabilities: () => support ? { serverTools: {} } : {},
    callServerTool: async (params: any, options: any) => {
      if (params.name !== "getLocalFalconReport" || params.arguments.reportKey !== key) throw new Error("Mutation or unrelated read forbidden");
      calls.push({ params, options });
      const response = responses.shift() ?? tool(pending);
      if (response instanceof Error) throw response;
      return response;
    }, sendSizeChanged: async () => {}, connect: async () => duringConnect?.(app),
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("app", "loadingEl", "loadReportGrid", "reportFromToolResult", "reportModelData", "isPermissionError", "unavailableMessage", "renderMetrics", "renderMap", "renderFallbackGrid", "allZeroCoords", "mapContainerEl", "metricsPanelEl", "detailPanelEl", "console", "document", "window",
    `let scanReport, gridData, map, currentOutsideClickHandler, detailJustOpened; ${js}`)(
    app, loading, (key: string, initial: unknown, options: any) => loadReportGrid(key, initial, { ...options, wait: async () => {} }), reportFromToolResult, reportModelData, isPermissionError, unavailableMessage,
    (report: any) => metrics.push(report), async (report: any, grid: any, signal: AbortSignal) => { if (mapWait) await mapWait; if (!signal.aborted) rendered.push({ report, grid, kind: "map" }); },
    (report: any, grid: any) => rendered.push({ report, grid, kind: "fallback" }), (points: any[]) => points.every(point => Number(point.lat) === 0 && Number(point.lng) === 0),
    mapContainer, element(), element(), { log() {}, error() {} }, { removeEventListener() {}, querySelectorAll: () => [], getElementById: () => element() }, window,
  );
  return { app, loading, rendered, metrics, reads, calls, listeners, window, mapContainer };
}

test("reviewer regression: completed inline result renders when separate resources/read is denied", async () => {
  const widget = await widgetHarness();
  await widget.app.ontoolresult(tool(completed));
  expect(widget.rendered).toHaveLength(1);
  expect(widget.rendered[0].grid).toEqual(completed);
  expect(widget.reads).toEqual([]);
  expect(widget.calls).toEqual([]);
});

test("widget restores Maps, AI and brand data from metadata with no resource calls", async () => {
  for (const platform of ["google", "gemini", "brand"]) {
    const grid = { ...completed, platform, keyword: "store", ai_place_id: "ai-target", data_points: [{ ...completed.data_points[0], lat: platform === "brand" ? 0 : 41, lng: platform === "brand" ? 0 : -81, results: [{ place_id: "ai-target", rank: 1 }], scrape: "AI answer", sources: [{ link: "https://example.test" }] }] };
    const widget = await widgetHarness(); await widget.app.ontoolresult(tool(grid));
    expect(widget.rendered[0].grid).toEqual(grid);
    expect(widget.metrics[0].keyword).toBe("store");
    expect(widget.rendered[0].kind).toBe(platform === "brand" ? "fallback" : "map");
    expect(widget.reads).toEqual([]);
  }
});

test("widget refresh only calls same report read tool and transitions to completed", async () => {
  const widget = await widgetHarness([tool(pending), tool(completed)]);
  await widget.app.ontoolresult(tool(pending));
  expect(widget.rendered).toHaveLength(1);
  expect(widget.loading.classList.hidden).toBe(true);
  expect(widget.calls.map(call => call.params)).toEqual(Array(2).fill({ name: "getLocalFalconReport", arguments: { reportKey: key, fieldmask: "report_key" } }));
  expect(widget.calls.every(call => call.options.signal instanceof AbortSignal)).toBe(true);
  expect(widget.reads).toEqual([]);
});

test("repeated pending notifications do not overlap or restart polling budget", async () => {
  const widget = await widgetHarness();
  await Promise.all(Array.from({ length: 10 }, () => widget.app.ontoolresult(tool(pending))));
  await widget.app.ontoolresult(tool(pending));
  expect(widget.calls).toHaveLength(4);
  expect(widget.rendered).toEqual([]);
  expect(widget.loading.textContent).toContain("again later");
  expect(widget.reads).toEqual([]);
});

test("duplicate completed events render only once while Maps is loading", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const widget = await widgetHarness([], true, {}, wait);
  const first = widget.app.ontoolresult(tool(completed));
  await widget.app.ontoolresult(tool(completed)); release(); await first;
  await widget.app.ontoolresult(tool(completed));
  expect(widget.rendered).toHaveLength(1);
});

test("host canonical globals hydrate a slim notification, but mismatching metadata cannot leak another report", async () => {
  const widget = await widgetHarness([], false, { toolOutput: { report_key: key }, toolResponseMetadata: { call_tool_result: tool(completed) } });
  await widget.app.ontoolresult({ structuredContent: { report_key: key } });
  expect(widget.rendered).toHaveLength(1);
  const other = await widgetHarness([], false, widget.window.openai);
  await other.app.ontoolresult({ structuredContent: { report_key: "different" } });
  expect(other.rendered).toEqual([]);
  expect(other.loading.textContent).not.toContain("still processing");
});

test("unmount and report switch cancel obsolete rendering", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const widget = await widgetHarness([], true, {}, wait);
  const first = widget.app.ontoolresult(tool(completed));
  await Promise.resolve(); await widget.app.onteardown(); release(); await first;
  expect(widget.rendered).toEqual([]);
  const switched = await widgetHarness();
  const pendingLoad = switched.app.ontoolresult(tool(pending));
  await switched.app.ontoolresult(tool({ ...completed, report_key: "other" }));
  await pendingLoad;
  expect(switched.rendered.map(item => item.report.report_key)).toEqual(["other"]);
  expect(switched.reads).toEqual([]);
});

test("direct Apps events for an old report cannot render or poll after input switches", async () => {
  const nextKey = "fedcba987654321";
  const widget = await widgetHarness();
  widget.app.ontoolinput({ arguments: { reportKey: key } });
  await widget.app.ontoolresult(tool(completed));
  widget.app.ontoolinput({ arguments: { reportKey: nextKey } });
  await widget.app.ontoolresult(tool(completed));
  await widget.app.ontoolresult(tool(pending));
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([key]);
  expect(widget.calls).toEqual([]);
  expect(widget.loading.classList.hidden).toBe(false);
  await widget.app.ontoolresult(tool({ ...completed, report_key: nextKey }));
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([key, nextKey]);
  expect(widget.reads).toEqual([]);
});

test("late OpenAI globals cannot replace the current report using stale tool input", async () => {
  const nextKey = "fedcba987654321";
  const widget = await widgetHarness([], false, { toolInput: { reportKey: key } });
  widget.app.ontoolinput({ arguments: { reportKey: key } });
  await widget.app.ontoolresult(tool(completed));
  widget.app.ontoolinput({ arguments: { reportKey: nextKey } });
  await widget.app.ontoolresult(tool({ ...completed, report_key: nextKey }));
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolResponseMetadata: { call_tool_result: tool(completed) } } } });
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([key, nextKey]);
  expect(widget.loading.classList.hidden).toBe(true);
  expect(widget.calls).toEqual([]);
});

test("stale full OpenAI globals cannot override a newer Apps input", async () => {
  const nextKey = "fedcba987654321";
  const widget = await widgetHarness([], false);
  widget.app.ontoolinput({ arguments: { reportKey: key } });
  await widget.app.ontoolresult(tool(completed));
  widget.app.ontoolinput({ arguments: { reportKey: nextKey } });
  await widget.app.ontoolresult(tool({ ...completed, report_key: nextKey }));
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolInput: { reportKey: key }, toolResponseMetadata: { call_tool_result: tool(completed) } } } });
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([key, nextKey]);
  expect(widget.loading.classList.hidden).toBe(true);
});

test("OpenAI-only explicit input updates cancel old report events without requiring Apps input", async () => {
  const nextKey = "fedcba987654321";
  const widget = await widgetHarness([], false);
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolInput: { reportKey: key }, toolResponseMetadata: { call_tool_result: tool(completed) } } } });
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolInput: { reportKey: nextKey } } } });
  await widget.app.ontoolresult(tool(completed));
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([key]);
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolResponseMetadata: { call_tool_result: tool({ ...completed, report_key: nextKey }) } } } });
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([key, nextKey]);
});

test("identity-free echoes from a cancelled refresh cannot stop the new report", async () => {
  const nextKey = "fedcba987654321";
  const widget = await widgetHarness();
  const finish = new Map<string, (value: any) => void>();
  widget.app.callServerTool = async (params: any) => {
    expect(params.name).toBe("getLocalFalconReport");
    widget.calls.push({ params });
    return new Promise(resolve => finish.set(params.arguments.reportKey, resolve));
  };
  widget.app.ontoolinput({ arguments: { reportKey: key } });
  const oldLoad = widget.app.ontoolresult(tool(pending));
  await Promise.resolve();
  widget.app.ontoolinput({ arguments: { reportKey: nextKey } });
  const currentLoad = widget.app.ontoolresult(tool({ ...pending, report_key: nextKey }));
  await Promise.resolve();
  const failure = { isError: true, content: [{ type: "text", text: "Authentication failed" }] };
  await widget.app.ontoolresult(failure);
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolOutput: failure } } });
  expect(widget.loading.textContent).toContain(nextKey);
  expect(widget.loading.textContent).toContain("still processing");
  finish.get(key)!(failure);
  await oldLoad;
  finish.get(nextKey)!(tool({ ...completed, report_key: nextKey }));
  await currentLoad;
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([nextKey]);
  expect(widget.loading.classList.hidden).toBe(true);
  expect(widget.calls.map(call => call.params.arguments.reportKey)).toEqual([key, nextKey]);
  expect(widget.reads).toEqual([]);
});

test("anonymous old-refresh echoes cannot clear a completed current report after settlement", async () => {
  for (const channel of ["apps", "openai"]) {
    const nextKey = "fedcba987654321";
    const widget = await widgetHarness();
    let finish!: (value: any) => void;
    widget.app.callServerTool = async (params: any) => {
      widget.calls.push({ params });
      return new Promise(resolve => { finish = resolve; });
    };
    widget.app.ontoolinput({ arguments: { reportKey: key } });
    const oldLoad = widget.app.ontoolresult(tool(pending));
    await Promise.resolve();
    widget.app.ontoolinput({ arguments: { reportKey: nextKey } });
    await widget.app.ontoolresult(tool({ ...completed, report_key: nextKey }));
    // OpenAI retains the successful current result when only toolOutput changes.
    widget.window.openai.toolResponseMetadata = { call_tool_result: tool({ ...completed, report_key: nextKey }) };
    const failure = { isError: true, content: [{ type: "text", text: "Authentication failed" }] };
    finish(failure);
    await oldLoad;
    if (channel === "apps") await widget.app.ontoolresult(failure);
    else await widget.listeners["openai:set_globals"]({ detail: { globals: { toolOutput: failure } } });
    expect(widget.loading.classList.hidden).toBe(true);
    expect(widget.loading.textContent).not.toContain("cannot be accessed");
    expect(widget.rendered.map(item => item.report.report_key)).toEqual([nextKey]);
    expect(widget.calls).toHaveLength(1);
    expect(widget.reads).toEqual([]);
  }
});

test("anonymous failures cannot borrow report identity from retained successful metadata", () => {
  const failure = { isError: true, content: [{ type: "text", text: "Authentication failed" }] };
  const decoded = reportFromToolResult(failure, { call_tool_result: tool(completed) });
  expect(decoded.report_key).toBeUndefined();
  expect(decoded._widget_error).toBe("tool");
  expect(decoded.error).toBe("Authentication failed");
  expect(reportFromToolResult({ report_key: key }, { call_tool_result: failure }).report_key).toBeUndefined();
  expect(reportFromToolResult(undefined, { call_tool_result: { ...failure, content: [{ type: "text", text: JSON.stringify({ report_key: key, error: "Authentication failed" }) }] } }).report_key).toBe(key);
});

test("anonymous errors cannot interrupt completed rendering but identified current errors still apply", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const widget = await widgetHarness([], true, {}, wait);
  widget.app.ontoolinput({ arguments: { reportKey: key } });
  const currentLoad = widget.app.ontoolresult(tool(completed));
  await Promise.resolve();
  const failure = { isError: true, content: [{ type: "text", text: "Authentication failed" }] };
  await widget.app.ontoolresult(failure);
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolOutput: failure } } });
  release();
  await currentLoad;
  expect(widget.rendered).toHaveLength(1);
  expect(widget.loading.classList.hidden).toBe(true);
  await widget.app.ontoolresult(tool({ report_key: key, error: "Authentication failed" }));
  expect(widget.loading.classList.hidden).toBe(false);
  expect(widget.loading.textContent).toContain("cannot be accessed");
  expect(widget.calls).toEqual([]);
  expect(widget.reads).toEqual([]);
});

test("a late anonymous echo after old refresh settlement cannot abort the current refresh", async () => {
  const nextKey = "fedcba987654321";
  const widget = await widgetHarness();
  const finish = new Map<string, (value: any) => void>();
  widget.app.callServerTool = async (params: any) => {
    widget.calls.push({ params });
    return new Promise(resolve => finish.set(params.arguments.reportKey, resolve));
  };
  widget.app.ontoolinput({ arguments: { reportKey: key } });
  const oldLoad = widget.app.ontoolresult(tool(pending));
  await Promise.resolve();
  widget.app.ontoolinput({ arguments: { reportKey: nextKey } });
  const currentLoad = widget.app.ontoolresult(tool({ ...pending, report_key: nextKey }));
  await Promise.resolve();
  const failure = { isError: true, content: [{ type: "text", text: "Authentication failed" }] };
  finish.get(key)!(failure);
  await oldLoad;
  await widget.app.ontoolresult(failure);
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolOutput: failure } } });
  expect(widget.loading.textContent).toContain("still processing");
  finish.get(nextKey)!(tool({ ...completed, report_key: nextKey }));
  await currentLoad;
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([nextKey]);
  expect(widget.calls.map(call => call.params.arguments.reportKey)).toEqual([key, nextKey]);
  expect(widget.reads).toEqual([]);
});

test("an ignored stale event during connect cannot suppress the valid initial globals", async () => {
  const nextKey = "fedcba987654321";
  const next = { ...completed, report_key: nextKey };
  const widget = await widgetHarness([], false, { toolInput: { reportKey: nextKey }, toolResponseMetadata: { call_tool_result: tool(next) } }, undefined, async app => {
    app.ontoolinput({ arguments: { reportKey: nextKey } });
    await app.ontoolresult(tool(completed));
  });
  await Promise.resolve();
  expect(widget.rendered.map(item => item.report.report_key)).toEqual([nextKey]);
  expect(widget.reads).toEqual([]);
  expect(widget.calls).toEqual([]);
});

test("accepted results for the previous input cannot suppress current bootstrap globals", async () => {
  const nextKey = "fedcba987654321";
  const next = { ...completed, report_key: nextKey };
  for (const previousFailed of [false, true]) {
    const widget = await widgetHarness([], false, { toolInput: { reportKey: nextKey }, toolResponseMetadata: { call_tool_result: tool(next) } }, undefined, async app => {
      app.ontoolinput({ arguments: { reportKey: key } });
      await app.ontoolresult(previousFailed
        ? { isError: true, content: [{ type: "text", text: "Report temporarily unavailable" }] }
        : tool(completed));
      app.ontoolinput({ arguments: { reportKey: nextKey } });
    });
    await Promise.resolve();
    expect(widget.rendered.map(item => item.report.report_key)).toEqual(previousFailed ? [nextKey] : [key, nextKey]);
    expect(widget.loading.classList.hidden).toBe(true);
    expect(widget.reads).toEqual([]);
    expect(widget.calls).toEqual([]);
  }
});

test("processing in a host without refresh stays friendly without technical errors or resources/read", async () => {
  const widget = await widgetHarness([], false);
  await widget.app.ontoolresult({ content: [{ type: "text", text: JSON.stringify({ text: JSON.stringify(pending) }) }] });
  expect(widget.loading.textContent).toContain(key);
  expect(widget.loading.textContent).not.toMatch(/No data_points|Check console|finishes immediately/);
  expect(widget.rendered).toEqual([]); expect(widget.calls).toEqual([]); expect(widget.reads).toEqual([]);
});

test("metadata-only canonical globals render lean-mask report and repeated notifications do not duplicate", async () => {
  for (const before of [true, false]) {
    const lean = { arp: 1.5 };
    const canonical = { call_tool_result: { content: [{ type: "text", text: JSON.stringify(lean) }], _meta: { "localfalcon/report": completed } } };
    const widget = await widgetHarness([], false, { toolInput: { reportKey: key }, toolResponseMetadata: canonical });
    widget.app.ontoolinput({ arguments: { reportKey: key } });
    const globals = () => widget.listeners["openai:set_globals"]({ detail: { globals: { toolResponseMetadata: canonical } } });
    if (before) await globals();
    await widget.app.ontoolresult({ content: [{ type: "text", text: JSON.stringify(lean) }] });
    if (!before) await globals();
    expect(widget.rendered).toHaveLength(1);
    expect(widget.rendered[0].report.report_key).toBe(key);
    expect(widget.reads).toEqual([]);
    expect(widget.calls).toEqual([]);
  }
});

test("metadata-only globals cannot override mismatching current tool input", async () => {
  const widget = await widgetHarness([], false, { toolInput: { reportKey: "other" } });
  await widget.listeners["openai:set_globals"]({ detail: { globals: { toolResponseMetadata: { call_tool_result: tool(completed) } } } });
  expect(widget.rendered).toEqual([]);
  expect(widget.loading.textContent).not.toContain("still processing");
});

test("switching a report with an open detail panel restores map interaction", async () => {
  const widget = await widgetHarness();
  await widget.app.ontoolresult(tool(completed));
  (widget.mapContainer.style as any).pointerEvents = "none";
  await widget.app.ontoolresult(tool({ ...completed, report_key: "other" }));
  expect((widget.mapContainer.style as any).pointerEvents).toBe("");
});

test("authorization tool errors without report identity have a distinct access state", async () => {
  const widget = await widgetHarness();
  await widget.app.ontoolresult({ isError: true, content: [{ type: "text", text: "Authentication failed. Check your API key." }] });
  expect(widget.loading.textContent).toContain("cannot be accessed");
  expect(widget.loading.textContent).not.toMatch(/processing|API key/);
  expect(widget.calls).toEqual([]);
});

test("tool failures without report identity remain unavailable, distinct from malformed responses", async () => {
  for (const message of ["Report not found (404)", "Request timed out", "Report temporarily unavailable"]) {
    const widget = await widgetHarness();
    widget.app.ontoolinput({ arguments: { reportKey: key } });
    await widget.app.ontoolresult({ isError: true, content: [{ type: "text", text: message }] });
    expect(widget.loading.textContent).toContain("couldn't be loaded right now");
    expect(widget.loading.textContent).toContain(key);
    expect(widget.loading.textContent).not.toContain("could not be understood");
    expect(widget.calls).toEqual([]);
  }
  const malformed = await widgetHarness();
  await malformed.app.ontoolresult({ content: [{ type: "text", text: "{bad json" }] });
  expect(malformed.loading.textContent).toContain("could not be understood");
  expect(malformed.calls).toEqual([]);
});

test("identity-free failure echoed during refresh permanently stops pending replay", async () => {
  for (const message of ["MCP app cannot read resource outside its widget scope.", "Authentication failed. Check your API key.", "Report temporarily unavailable"]) {
    const widget = await widgetHarness();
    let resolve!: (value: any) => void;
    widget.app.callServerTool = async (params: any) => {
      widget.calls.push({ params });
      return new Promise(done => { resolve = done; });
    };
    const pendingLoad = widget.app.ontoolresult(tool(pending));
    await Promise.resolve();
    const failure = { isError: true, content: [{ type: "text", text: message }] };
    await widget.app.ontoolresult(failure);
    resolve(failure);
    await pendingLoad;
    await widget.app.ontoolresult(tool(pending));
    expect(widget.calls).toHaveLength(1);
    expect(widget.loading.textContent).toContain(isPermissionError(message) ? "cannot be accessed" : "couldn't be loaded right now");
    expect(widget.loading.textContent).not.toContain("still processing");
    expect(widget.reads).toEqual([]);
  }
});
