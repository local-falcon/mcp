import { describe, expect, test } from "bun:test";
import { projectReportFields, reportFetchFieldmask, splitReportResult, REPORT_WIDGET_FIELDS } from "./reportPayload";

describe("report model/widget field separation", () => {
  const source = {
    report_key: "abc123def456789", arp: 3,
    location: { name: "Target", address: "Secret from lean response" },
    places: { one: { name: "One", arp: 1, address: "One street" }, two: { name: "Two", arp: 2 } },
    rankings: { by_arp: { one: 1, two: 2 } },
    data_points: [{ lat: 1, lng: 2, rank: 1, results: ["one"] }, { lat: 3, lng: 4, rank: 2, results: ["two"] }],
    ai_analysis: { summary: "Narrative", citations: [{ url: "https://example.test" }] },
  };
  test("nested fields, object dictionaries and array wildcards retain only requested paths", () => {
    expect(projectReportFields(source, "location.name,places.*.name,places.*.arp,data_points.*.lat,data_points.*.rank,ai_analysis.summary")).toEqual({
      location: { name: "Target" },
      places: { one: { name: "One", arp: 1 }, two: { name: "Two", arp: 2 } },
      data_points: [{ lat: 1, rank: 1 }, { lat: 3, rank: 2 }],
      ai_analysis: { summary: "Narrative" },
    });
  });
  test("whole parent wins independent of field order and scalar dictionaries do not allow descent", () => {
    for (const mask of ["location.name,location", "location,location.name"]) expect(projectReportFields(source, mask)).toEqual({ location: source.location });
    expect(projectReportFields(source, "rankings.by_arp")).toEqual({ rankings: source.rankings });
    expect(projectReportFields(source, "rankings.by_arp.*.arp")).toEqual({});
    expect(projectReportFields(source, "unknown.path")).toEqual({});
  });
  test("broadened backend mask retains user validation paths and requests each widget parent once", () => {
    const mask = reportFetchFieldmask("location.name,places.*.arp,arp,ai_analysis.summary")!;
    expect(mask).toContain("ai_analysis.summary");
    expect(mask).toContain("location.name");
    expect(mask).toContain("places.*.arp");
    expect(mask.split(",").filter(field => field === "arp")).toHaveLength(1);
    for (const field of REPORT_WIDGET_FIELDS.split(",")) expect(mask.split(",")).toContain(field);
    expect(reportFetchFieldmask()).toBeUndefined();
  });
  test("default model response still omits points and retains normal analysis fields", () => {
    const { model, widget } = splitReportResult(source);
    expect(model).not.toHaveProperty("data_points");
    expect(model.ai_analysis).toEqual(source.ai_analysis);
    expect(widget.data_points).toEqual(source.data_points);
    expect(widget).not.toHaveProperty("ai_analysis");
    expect(splitReportResult(source, "*").model).not.toHaveProperty("data_points");
    expect(splitReportResult(source, "data_points.*.rank").model).toEqual({ data_points: [{ rank: 1 }, { rank: 2 }] });
  });
  test("processing preserves key and warnings independently of the lean mask and drops stale completed data", () => {
    const pending = { ...source, _mcp_status: "processing", _mcp_note: "Check later", _warnings: ["Unknown field in fieldmask: data_points"] };
    const { model, widget } = splitReportResult(pending, "arp");
    expect(model).toEqual({ report_key: source.report_key, _mcp_status: "processing", _mcp_note: "Check later", _warnings: pending._warnings });
    expect(widget).toEqual(model);
  });
  test("internally requested-field warnings stay out of lean model content", () => {
    const { model, widget } = splitReportResult({ ...source, _warnings: ["Unknown field in fieldmask: typo", "Unknown field in fieldmask: sources"] }, "arp,typo");
    expect(model).toEqual({ arp: 3, _warnings: ["Unknown field in fieldmask: typo"] });
    expect(widget._warnings).toHaveLength(2);
  });

  // Expected shapes follow LF.api src/functions/masks.php at aa1c15334a633ec41ad4f595be21d307ae2c0215.
  // This source contract is not proof of which backend commit is deployed.
  test("null or missing leaves and empty wildcard selections omit the whole branch", () => {
    const data = { location: { name: null, address: "Only address" }, places: {}, rank: false, count: 0, note: "" };
    expect(projectReportFields(data, "location.name,location.missing,places.*.name")).toEqual({});
    expect(projectReportFields(data, "rank,count,note")).toEqual({ rank: false, count: 0, note: "" });
    expect(projectReportFields(data, "location,places")).toEqual({ location: data.location, places: {} });
    expect(projectReportFields(data, "location..address")).toEqual({ location: { address: "Only address" } });
  });

  test("sparse wildcard indices remain objects while complete index sets remain arrays", () => {
    const data = { data_points: [{ lat: 1 }, { lat: 2, rank: 3 }, { lat: 3, rank: null }] };
    expect(projectReportFields(data, "data_points.*.rank")).toEqual({ data_points: { "1": { rank: 3 } } });
    expect(projectReportFields(data, "data_points.*.lat")).toEqual({ data_points: [{ lat: 1 }, { lat: 2 }, { lat: 3 }] });
    expect(projectReportFields(data, "data_points.1.lat,data_points.0.lat")).toEqual({ data_points: { "1": { lat: 2 }, "0": { lat: 1 } } });
    expect(projectReportFields(data, "data_points.*.rank,data_points.*.lat")).toEqual({ data_points: { "1": { rank: 3, lat: 2 }, "0": { lat: 1 }, "2": { lat: 3 } } });
  });

  test("upstream union starts with full widget parents so later-point masks cannot reorder its grid", () => {
    const full = { ...source, data_points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4, rank: 2 }] };
    for (const mask of ["data_points.1.lat", "data_points.*.rank", "data_points.1.lat,data_points", "data_points.1.lat,data_points,data_points"]) {
      const fetchMask = reportFetchFieldmask(mask)!;
      // Exercise the captured PHP ordered-merge contract before the split,
      // rather than pretending the backend always returns the original array.
      const upstream = projectReportFields(full, fetchMask);
      expect(upstream.data_points).toEqual(full.data_points);
      expect(Array.isArray(upstream.data_points)).toBe(true);
      const { model, widget } = splitReportResult(upstream, mask);
      expect(widget.data_points).toEqual(full.data_points);
      expect(model).toEqual(projectReportFields(full, mask));
      expect(fetchMask.split(",").indexOf("data_points")).toBeLessThan(fetchMask.split(",").indexOf(mask.split(",")[0]));
    }
    expect(reportFetchFieldmask("data_points,data_points")!.split(",").filter(path => path === "data_points")).toHaveLength(2);
  });

  test("union projection preserves user warnings and nullable full widget data independently", () => {
    const full = { ...source, location: { name: null, address: "Only address" }, data_points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4, rank: 2 }], _warnings: ["Unknown field in fieldmask: location.name", "Unknown field in fieldmask: places.missing", "Unknown field in fieldmask: sources"] };
    const { model, widget } = splitReportResult(full, "location.name,places.missing,data_points.*.rank");
    expect(model).toEqual({ data_points: { "1": { rank: 2 } }, _warnings: ["Unknown field in fieldmask: location.name", "Unknown field in fieldmask: places.missing"] });
    expect(widget.location).toEqual(full.location);
    expect(widget.data_points).toEqual(full.data_points);
    expect(Array.isArray(widget.data_points)).toBe(true);
    expect(widget._warnings).toEqual(full._warnings);
    expect(full.data_points).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4, rank: 2 }]);
  });

  test("default wildcard and PHP-falsy mask keep default model shape without widening grid visibility", () => {
    for (const mask of ["*", "0"]) {
      expect(reportFetchFieldmask(mask)).toBeUndefined();
      expect(splitReportResult(source, mask).model).toEqual(splitReportResult(source).model);
      expect(splitReportResult(source, mask).widget.data_points).toEqual(source.data_points);
    }
    expect(reportFetchFieldmask("typo,typo")!.split(",").filter(field => field === "typo")).toHaveLength(2);
    expect(splitReportResult({ ...source, _warnings: ["Unknown field in fieldmask: typo", "Unknown field in fieldmask: typo", "Unknown field in fieldmask: sources"] }, "typo,typo").model).toEqual({ _warnings: ["Unknown field in fieldmask: typo", "Unknown field in fieldmask: typo"] });
  });

  test("wildcard projections cannot copy internally added warnings into model content", () => {
    const full = { ...source, _warnings: ["Unknown field in fieldmask: sources", "Unknown field in fieldmask: typo"] };
    for (const mask of ["*,arp", "  *  "]) expect(splitReportResult(full, mask).model).not.toHaveProperty("_warnings");
    expect(splitReportResult(full, "*,typo").model._warnings).toEqual(["Unknown field in fieldmask: typo"]);
  });
});
