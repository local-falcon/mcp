/** The existing data resource's rendering fields, kept out of model content. */
export const REPORT_WIDGET_FIELDS = "data_points,places,sources,version,place_id,ai_place_id,report_key,keyword,platform,location,lat,lng,date,grid_size,radius,measurement,arp,atrp,solv,saiv,found_in,total_competitors,competition_solv,max_solv,opportunity_solv";
export const REPORT_WIDGET_META_KEY = "localfalcon/report";

type Mask = { whole: boolean; children: Map<string, Mask> };
const newMask = (): Mask => ({ whole: false, children: new Map() });

/** Project LF.api's documented nested and wildcard masks without expanding
 * the model response when the backend request also includes widget fields.
 * Wildcards retain array positions and dictionary keys; scalar dictionaries
 * cannot be descended into. A whole parent takes precedence over child paths.
 */
export function projectReportFields(value: any, fieldmask: string): any {
  const root = newMask();
  for (const path of fieldmask.split(",").map(field => field.trim()).filter(Boolean)) {
    let node = root;
    for (const part of path.split(".")) {
      if (!node.children.has(part)) node.children.set(part, newMask());
      node = node.children.get(part)!;
    }
    node.whole = true;
  }
  function select(source: any, node: Mask): any {
    if (node.whole) return source;
    if (source === null || typeof source !== "object") return undefined;
    const result: any = Array.isArray(source) ? [] : {};
    for (const [key, child] of node.children) {
      const keys = key === "*" ? Object.keys(source) : [key];
      for (const actualKey of keys) {
        if (!Object.hasOwn(source, actualKey)) continue;
        const selected = select(source[actualKey], child);
        if (selected === undefined) continue;
        const existing = result[actualKey];
        // Separate paths such as places.*.name and places.*.arp must merge.
        result[actualKey] = existing && typeof existing === "object" && !child.whole
          ? merge(existing, selected) : selected;
      }
    }
    return result;
  }
  function merge(left: any, right: any): any {
    for (const key of Object.keys(right)) {
      left[key] = left[key] && right[key] && typeof left[key] === "object" && typeof right[key] === "object"
        ? merge(left[key], right[key]) : right[key];
    }
    return left;
  }
  return select(value, root) ?? {};
}

/** Keep user paths so upstream validation can still report invalid fields,
 * even when a whole widget parent is also requested. Deduplicate exact paths.
 */
export function reportFetchFieldmask(fieldmask?: string): string | undefined {
  if (!fieldmask) return undefined; // Preserve the original default model fields.
  const paths = [...new Set(`${fieldmask},${REPORT_WIDGET_FIELDS}`.split(",").map(path => path.trim()).filter(Boolean))];
  return paths.join(",");
}

export function splitReportResult(report: any, fieldmask?: string): { model: any; widget: any } {
  // Processing is explicit; do not mistake absent/malformed grid data for pending.
  if (report?._mcp_status === "processing") {
    const { report_key, _mcp_status, _mcp_note, _warnings } = report;
    const pending = { report_key, _mcp_status, _mcp_note, ...(_warnings ? { _warnings } : {}) };
    return { model: pending, widget: pending };
  }
  const widget = projectReportFields(report, REPORT_WIDGET_FIELDS);
  const { data_points: _grid, ...defaultModel } = report;
  const modelSource = fieldmask?.includes("data_points") ? report : defaultModel;
  const model = fieldmask ? projectReportFields(modelSource, fieldmask) : defaultModel;
  // Preserve only user-requested fieldmask warnings in model content, while
  // the widget receives warnings about its internally requested fields too.
  if (report._warnings) {
    widget._warnings = report._warnings;
    const requested = new Set(fieldmask?.split(",").map(path => path.trim()));
    const warnings = fieldmask ? report._warnings.filter((warning: string) => requested.has(warning.replace(/^Unknown field in fieldmask: /, ""))) : report._warnings;
    if (warnings.length) model._warnings = warnings;
  }
  return { model, widget };
}
