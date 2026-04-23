import { describe, expect, test } from "bun:test";
import {
  buildEagerPendingResponse,
  buildScanTimeoutFallback,
  isTimeoutError,
  parseApiError,
  unwrapWithWarnings,
} from "./localfalcon";

describe("isTimeoutError", () => {
  test("matches fetchWithTimeout's actual error message ('timed out', two words)", () => {
    // The message format thrown by fetchWithTimeout. Previously missed by .includes('timeout').
    expect(isTimeoutError(new Error("Request timed out after 15000ms"))).toBe(true);
  });

  test("matches 'timeout' (one word) variants", () => {
    expect(isTimeoutError(new Error("Connection timeout"))).toBe(true);
    expect(isTimeoutError(new Error("Upstream timeout after 5s"))).toBe(true);
  });

  test("is case insensitive", () => {
    expect(isTimeoutError(new Error("TIMEOUT"))).toBe(true);
    expect(isTimeoutError(new Error("Request TIMED OUT"))).toBe(true);
  });

  test("matches AbortError by name even if message is empty", () => {
    const e = new Error("");
    e.name = "AbortError";
    expect(isTimeoutError(e)).toBe(true);
  });

  test("returns false for non-timeout Errors", () => {
    expect(isTimeoutError(new Error("Invalid input"))).toBe(false);
    expect(isTimeoutError(new Error("HTTP 500 Internal Server Error"))).toBe(false);
    expect(isTimeoutError(new Error(""))).toBe(false);
  });

  test("returns false for non-Error values", () => {
    expect(isTimeoutError("timeout string, not Error")).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
    expect(isTimeoutError({ message: "timeout" })).toBe(false);
  });
});

describe("buildEagerPendingResponse (HTTP 202 branch)", () => {
  const params = {
    placeId: "ChIJxxx",
    keyword: "coffee near me",
    gridSize: "5",
    platform: "google",
  };

  test("surfaces report_key and status from data.data", () => {
    const apiResponse = {
      code: 202,
      success: true,
      message: "Your scan has been created and is currently in progress.",
      data: { report_key: "abc123def456789", status: "pending" },
    };
    const result = buildEagerPendingResponse(apiResponse, params);

    expect(result.success).toBe(true);
    expect(result.report_key).toBe("abc123def456789");
    expect(result.status).toBe("pending");
    expect(result.place_id).toBe(params.placeId);
    expect(result.keyword).toBe(params.keyword);
    expect(result.grid_size).toBe(params.gridSize);
    expect(result.platform).toBe(params.platform);
    expect(result.message).toContain("abc123def456789");
    expect(result.message).toContain("Poll getLocalFalconReport");
    expect(result._mcp_note).toContain("Do NOT retry");
  });

  test("defaults status to 'pending' when the server omits it", () => {
    const apiResponse = { data: { report_key: "xyz" } };
    const result = buildEagerPendingResponse(apiResponse, params);
    expect(result.status).toBe("pending");
    expect(result.report_key).toBe("xyz");
  });

  test("falls back to a listing-based recovery message when report_key is missing", () => {
    // Defensive: the server currently always sets report_key on 202, but the
    // helper handles the missing-key case without throwing.
    const apiResponse = { data: {} };
    const result = buildEagerPendingResponse(apiResponse, params);

    expect(result.success).toBe(true);
    expect(result.report_key).toBeUndefined();
    expect(result.message).toContain("listLocalFalconScanReports");
    expect(result.message).not.toContain("Report key:");
  });
});

describe("buildScanTimeoutFallback (network-timeout branch)", () => {
  const params = {
    placeId: "ChIJyyy",
    keyword: "test keyword",
    gridSize: "3",
    platform: "chatgpt",
  };

  test("returns synthetic success with recovery guidance", () => {
    const result = buildScanTimeoutFallback(params);

    expect(result.success).toBe(true);
    expect(result.message).toContain("network timeout");
    expect(result.message).toContain("listLocalFalconScanReports");
    expect(result.place_id).toBe(params.placeId);
    expect(result.keyword).toBe(params.keyword);
    expect(result.grid_size).toBe(params.gridSize);
    expect(result.platform).toBe(params.platform);
    expect(result._mcp_note).toContain("Do NOT retry");
  });

  test("does not carry a report_key (unrecoverable from this code path)", () => {
    const result = buildScanTimeoutFallback(params);
    expect(result.report_key).toBeUndefined();
  });
});

describe("unwrapWithWarnings", () => {
  test("no warnings: returns inner data unchanged", () => {
    const wrapper = {
      code: 200,
      success: true,
      message: false,
      parameters: [],
      data: { report_key: "abc", keyword: "coffee" },
    };
    const result = unwrapWithWarnings(wrapper);
    expect(result).toEqual({ report_key: "abc", keyword: "coffee" });
    expect(result._warnings).toBeUndefined();
  });

  test("no .data key: falls back to the response itself (matches existing ?? pattern)", () => {
    const shapeless = { some: "thing", no_data_key: true };
    const result = unwrapWithWarnings(shapeless);
    expect(result).toEqual(shapeless);
  });

  test("warnings present: object inner gains _warnings sibling", () => {
    const wrapper = {
      data: { report_key: "abc", arp: "3.80" },
      field_mask_warnings: {
        message: "Some field masks were not found in the data.",
        exceptions: ["reports.fake.name", "foo.bar"],
      },
    };
    const result = unwrapWithWarnings(wrapper);
    expect(result.report_key).toBe("abc");
    expect(result.arp).toBe("3.80");
    expect(result._warnings).toEqual([
      "Unknown field in fieldmask: reports.fake.name",
      "Unknown field in fieldmask: foo.bar",
    ]);
  });

  test("empty exceptions array is treated as no warnings", () => {
    const wrapper = {
      data: { a: 1 },
      field_mask_warnings: { exceptions: [] },
    };
    const result = unwrapWithWarnings(wrapper);
    expect(result).toEqual({ a: 1 });
    expect(result._warnings).toBeUndefined();
  });

  test("warnings + array inner: wraps into { items, _warnings }", () => {
    const wrapper = {
      data: [{ id: 1 }, { id: 2 }],
      field_mask_warnings: { exceptions: ["bad.path"] },
    };
    const result = unwrapWithWarnings(wrapper);
    expect(result.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result._warnings).toEqual(["Unknown field in fieldmask: bad.path"]);
  });

  test("warnings + scalar inner: wraps into { value, _warnings }", () => {
    const wrapper = {
      data: "just-a-string",
      field_mask_warnings: { exceptions: ["x"] },
    };
    const result = unwrapWithWarnings(wrapper);
    expect(result.value).toBe("just-a-string");
    expect(result._warnings).toEqual(["Unknown field in fieldmask: x"]);
  });

  test("warnings + null inner: wraps safely", () => {
    const wrapper = {
      data: null,
      field_mask_warnings: { exceptions: ["x"] },
    };
    const result = unwrapWithWarnings(wrapper);
    expect(result.value).toBe(null);
    expect(result._warnings).toEqual(["Unknown field in fieldmask: x"]);
  });

  test("real V.2 probe shape: data has 6 good fields + 4 exceptions", () => {
    // Shape from scratch/session-2/verification/V2-raw-api-response.json
    const wrapper = {
      code: 200,
      code_desc: false,
      success: true,
      message: false,
      parameters: [],
      data: {
        report_key: "ad412d968a25a84",
        date: "4/14/2026 4:00 PM",
        platform: "google",
        arp: "3.80",
        atrp: "11.44",
        solv: "22.22",
      },
      field_masks: [
        "report_key", "date", "platform", "arp", "atrp", "solv",
        "reports.fake.name", "totally_bogus_field", "insights.notreal", "foo.bar.baz",
      ],
      field_mask_warnings: {
        message: "Some field masks were not found in the data.",
        exceptions: [
          "reports.fake.name",
          "totally_bogus_field",
          "insights.notreal",
          "foo.bar.baz",
        ],
      },
    };

    const result = unwrapWithWarnings(wrapper);
    expect(result.report_key).toBe("ad412d968a25a84");
    expect(result.arp).toBe("3.80");
    expect(result.solv).toBe("22.22");
    expect(result._warnings).toEqual([
      "Unknown field in fieldmask: reports.fake.name",
      "Unknown field in fieldmask: totally_bogus_field",
      "Unknown field in fieldmask: insights.notreal",
      "Unknown field in fieldmask: foo.bar.baz",
    ]);
  });
});

// Integration-style verification of unwrapWithWarnings through the actual response-
// handling path used by fetch functions. We don't mock node-fetch here (it's imported
// at the module level, complicating test isolation); instead we simulate the exact
// sequence a fetch function performs: safeParseJson → unwrapWithWarnings → project →
// strip data_points, and assert the final MCP shape. Functionally equivalent to
// end-to-end testing of the wrapper-processing logic, minus the network round-trip.
describe("fetch-function unwrap pattern (end-to-end simulation)", () => {
  test("list-with-slicing + warnings: spread preserves _warnings through the slice", () => {
    const apiResponse = {
      code: 200,
      success: true,
      parameters: [],
      data: {
        reports: [{ report_key: "r1" }, { report_key: "r2" }, { report_key: "r3" }],
        count: 3,
        total: 9370,
        next_token: "tok",
      },
      field_mask_warnings: { exceptions: ["garbage.field"] },
    };
    const unwrapped = unwrapWithWarnings(apiResponse);
    const limitNum = 2;
    const result = {
      ...unwrapped,
      reports: unwrapped.reports.slice(0, limitNum),
    };

    expect(result.reports.length).toBe(2);
    expect(result.reports[0].report_key).toBe("r1");
    expect(result.count).toBe(3);
    expect(result.total).toBe(9370);
    expect(result.next_token).toBe("tok");
    expect(result._warnings).toEqual(["Unknown field in fieldmask: garbage.field"]);
  });

  test("single-get + warnings + data_points strip: _warnings survives destructure", () => {
    const apiResponse = {
      code: 200,
      success: true,
      data: {
        report_key: "abc",
        arp: "3.80",
        data_points: [{ huge: true }],
      },
      field_mask_warnings: { exceptions: ["nope"] },
    };
    const unwrapped = unwrapWithWarnings(apiResponse);
    // Strip data_points the way fetchLocalFalconReport does
    const { data_points, ...cleanData } = unwrapped;

    expect(cleanData.report_key).toBe("abc");
    expect(cleanData.arp).toBe("3.80");
    expect(cleanData.data_points).toBeUndefined();
    expect(cleanData._warnings).toEqual(["Unknown field in fieldmask: nope"]);
  });

  test("projection branch (fetchLocalFalconTrendReports-style): conditional _warnings include", () => {
    const apiResponse = {
      data: {
        next_token: "t",
        ai_analysis: "x",
        reports: [{ report_key: "r", last_date: "d", location: "l", keywords: [] }],
      },
      field_mask_warnings: { exceptions: ["fake"] },
    };
    const unwrapped = unwrapWithWarnings(apiResponse);

    // Mirror the projection-branch pattern: build the object, add _warnings only if present
    const out: any = {
      next_token: unwrapped.next_token,
      ai_analysis: unwrapped.ai_analysis,
      reports: unwrapped.reports.slice(0, 10),
    };
    if (unwrapped._warnings) out._warnings = unwrapped._warnings;

    expect(out.next_token).toBe("t");
    expect(out._warnings).toEqual(["Unknown field in fieldmask: fake"]);
  });
});

describe("parseApiError", () => {
  test("404 with standard wrapper (verified V.3 shape): rewrites to 'Report not found' + server suffix", () => {
    const wrapper = JSON.stringify({
      code: 404,
      code_desc: false,
      success: false,
      message: "The report you requested is not available or you do not have permission to view it.",
      parameters: [],
      data: [],
    });
    const err = parseApiError(404, wrapper);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("Report not found");
    expect(err.message).toContain("may not exist, may have expired, or may belong to a different account");
    expect(err.message).toContain("(Server:"); // server message preserved
    expect(err.message).toContain("not available or you do not have permission");
  });

  test("403 with standard wrapper: rewrites to explicit 'Access denied'", () => {
    const wrapper = JSON.stringify({
      code: 403,
      success: false,
      message: "The report you requested is not available or you do not have permission to view it.",
    });
    const err = parseApiError(403, wrapper);
    expect(err.message).toContain("Access denied");
    expect(err.message).toContain("different account");
    expect(err.message).toContain("(Server:");
  });

  test("400 with server message: passes server message through via suffix", () => {
    const wrapper = JSON.stringify({
      code: 400,
      success: false,
      message: "You must specify a report key.",
    });
    const err = parseApiError(400, wrapper);
    expect(err.message).toContain("Invalid request (400)");
    expect(err.message).toContain("You must specify a report key");
  });

  test("401 maps to 'Authentication failed'", () => {
    const wrapper = JSON.stringify({
      code: 401,
      success: false,
      message: "The API key you provided is not valid or no longer active.",
    });
    const err = parseApiError(401, wrapper);
    expect(err.message).toContain("Authentication failed");
    expect(err.message).toContain("API key");
  });

  test("429 maps to 'Rate limit exceeded'", () => {
    const err = parseApiError(429, JSON.stringify({ code: 429, message: "Too many requests" }));
    expect(err.message).toContain("Rate limit exceeded");
  });

  test("plain-text error body (non-JSON, e.g., reviewsAnalysis endpoint): falls back to status + body", () => {
    // The reviewsAnalysis endpoint in V.3 returned plain text, not the standard wrapper
    const err = parseApiError(500, "You do not have permission to access this resource.");
    expect(err.message).toContain("status 500");
    expect(err.message).toContain("You do not have permission");
  });

  test("accepts an already-parsed data object (action-endpoint call pattern)", () => {
    const parsed = { code: 404, message: "The report you requested is not available..." };
    const err = parseApiError(404, parsed);
    expect(err.message).toContain("Report not found");
    expect(err.message).toContain("(Server:");
  });

  test("empty server message: falls back gracefully", () => {
    const err = parseApiError(404, JSON.stringify({ code: 404, message: "" }));
    expect(err.message).toContain("Report not found");
    expect(err.message).not.toContain("(Server:"); // no suffix when message is empty
  });

  test("unknown 5xx: generic fallback with status", () => {
    const err = parseApiError(503, JSON.stringify({ code: 503, message: "Service unavailable" }));
    expect(err.message).toContain("Local Falcon API error: 503");
    expect(err.message).toContain("Service unavailable");
  });

  test("totally empty error body: doesn't crash, generic fallback", () => {
    const err = parseApiError(500, "");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("500");
  });

  test("server code differs from status (takes server code)", () => {
    // If the server returns HTTP 200 but code:404 in body (unusual but possible)
    const wrapper = JSON.stringify({ code: 404, message: "nope" });
    const err = parseApiError(200, wrapper);
    expect(err.message).toContain("Report not found");
  });
});
