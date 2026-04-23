import { describe, expect, test } from "bun:test";
import { buildEagerPendingResponse, buildScanTimeoutFallback, isTimeoutError } from "./localfalcon";

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
