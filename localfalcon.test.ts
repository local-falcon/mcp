import { describe, expect, test } from "bun:test";
import { isTimeoutError } from "./localfalcon";

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
