/** The existing data resource's rendering fields, kept out of model content. */
export const REPORT_WIDGET_FIELDS = "data_points,places,sources,version,place_id,ai_place_id,report_key,keyword,platform,location,lat,lng,date,grid_size,radius,measurement,arp,atrp,solv,saiv,found_in,total_competitors,competition_solv,max_solv,opportunity_solv";
export const REPORT_WIDGET_META_KEY = "localfalcon/report";

// PHP uses one ordered array type for both lists and dictionaries. Partial
// wildcard selections can therefore encode as objects when indices have gaps
// or were inserted out of order. Maps preserve that order during deep_merge.
const isContainer = (value: any): boolean => value !== null && typeof value === "object";
const entries = (value: any): [string, any][] => value instanceof Map ? [...value] : Object.entries(value);

/** Mirror LF.api's filter_by_mask/deep_merge source contract (masks.php),
 * including null/missing branches and sequential mask merge order. Deployed
 * backend parity still requires verification; don't reinterpret public types.
 */
export function projectReportFields(value: any, fieldmask: string): any {
  if (!fieldmask || fieldmask === "0" || fieldmask === "*") return value;
  function select(source: any, parts: string[]): any {
    if (!parts.length) return source;
    if (!isContainer(source)) return undefined;
    const [head, ...tail] = parts;
    if (head === "*") {
      const selected = new Map<string, any>();
      for (const [key, child] of entries(source)) {
        const partial = select(child, tail);
        if (partial !== undefined && partial !== null) selected.set(key, partial);
      }
      return selected.size ? selected : undefined;
    }
    if (!Object.hasOwn(source, head)) return undefined;
    const child = select(source[head], tail);
    return child === undefined || child === null ? undefined : new Map([[head, child]]);
  }
  function merge(left: any, right: any): any {
    if (!isContainer(left) || !isContainer(right)) return right;
    const result = new Map<string, any>(entries(left));
    for (const [key, child] of entries(right)) {
      result.set(key, result.has(key) ? merge(result.get(key), child) : child);
    }
    return result;
  }
  function encode(selected: any): any {
    if (!(selected instanceof Map)) return selected;
    const values = [...selected].map(([key, child]) => [key, encode(child)] as const);
    return values.every(([key], index) => key === String(index))
      ? values.map(([, child]) => child) : Object.fromEntries(values);
  }
  let selected = new Map<string, any>();
  for (const mask of fieldmask.split(",").map(path => path.trim()).filter(Boolean)) {
    const partial = select(value, mask.split(".").filter(Boolean));
    if (partial !== undefined && partial !== null) selected = merge(selected, partial);
  }
  // The existing report tool spreads a grid-free default into an object, even
  // when no fields matched. Preserve that text-response behavior.
  return selected.size ? encode(selected) : {};
}

/** Request full widget parents first: PHP's ordered deep_merge must not see a
 * sparse child selection before the full grid. Preserve user validation paths
 * and repeated-path counts while projecting model content in its original order.
 */
export function reportFetchFieldmask(fieldmask?: string): string | undefined {
  if (!fieldmask || fieldmask === "0" || fieldmask === "*") return undefined;
  const paths = fieldmask.split(",").map(path => path.trim()).filter(Boolean);
  const widgetFields = REPORT_WIDGET_FIELDS.split(",");
  // Move one exact parent occurrence into the prefix, rather than duplicating
  // it. Additional user repetitions remain so backend warning counts survive.
  for (const field of widgetFields) {
    const index = paths.indexOf(field);
    if (index !== -1) paths.splice(index, 1);
  }
  return [...widgetFields, ...paths].join(",");
}

export function splitReportResult(report: any, fieldmask?: string): { model: any; widget: any } {
  // Processing is explicit; do not mistake absent/malformed grid data for pending.
  if (report?._mcp_status === "processing") {
    const { report_key, _mcp_status, _mcp_note, _warnings } = report;
    const pending = { report_key, _mcp_status, _mcp_note, ...(_warnings ? { _warnings } : {}) };
    return { model: pending, widget: pending };
  }
  // Rendering must preserve the backend's original arrays and nullable values,
  // independently of model-facing PHP partial-selection semantics.
  const widget = Object.fromEntries(REPORT_WIDGET_FIELDS.split(",").filter(field => Object.hasOwn(report, field)).map(field => [field, report[field]]));
  const { data_points: _grid, ...defaultModel } = report;
  if (fieldmask === "*" || fieldmask === "0") fieldmask = undefined;
  const modelSource = fieldmask?.includes("data_points") ? report : defaultModel;
  const model = fieldmask ? projectReportFields(modelSource, fieldmask) : defaultModel;
  // Wildcard masks may select wrapper-added warnings. Filter those by the
  // original user paths below so internal widget warnings stay out of content.
  if (fieldmask) delete model._warnings;
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
