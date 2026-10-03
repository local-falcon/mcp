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
    expect(projectReportFields(source, "rankings.by_arp.*.arp")).toEqual({ rankings: { by_arp: {} } });
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
});
