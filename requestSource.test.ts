import { afterEach, describe, expect, test } from "bun:test";
import {
  REQUEST_SOURCE_PARAM,
  SOURCE_TIER,
  UNKNOWN_REQUEST_SOURCE,
  deriveRequestSource,
  getRequestSource,
  resetProcessRequestSource,
  runWithRequestSource,
  setProcessRequestSource,
} from "./requestSource";
import { applyRequestSource } from "./localfalcon";

// request_source is the only signal Local Falcon gets about which integration
// drove an API call. The cases that actually matter are ChatGPT's, because its
// connector and its widget arrive by different paths with different signals —
// the connector sends no Origin at all, so a host-only implementation would
// report every ChatGPT call as unknown.

afterEach(() => {
  delete process.env.LOCAL_FALCON_REQUEST_SOURCE;
  resetProcessRequestSource();
});

const initialize = (clientName: string) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", clientInfo: { name: clientName, version: "1.0.0" } },
});

describe("deriveRequestSource — ChatGPT", () => {
  test("connector identifies itself by User-Agent alone, with no Origin", () => {
    const resolved = deriveRequestSource({
      headers: { "user-agent": "openai-mcp/1.0.0" },
    });
    expect(resolved.value).toBe("chatgpt");
    expect(resolved.tier).toBe(SOURCE_TIER.platform);
  });

  test("widget sandbox subdomains collapse to one value", () => {
    for (const origin of [
      "https://web-sandbox.oaiusercontent.com",
      "https://74e0d6e848652234efed.web-sandbox.oaiusercontent.com",
      "https://chatgpt.com",
      "https://chat.openai.com",
    ]) {
      expect(deriveRequestSource({ headers: { origin } }).value).toBe("chatgpt");
    }
  });

  test("opaque iframe origin (literal \"null\") falls through to the User-Agent", () => {
    const resolved = deriveRequestSource({
      headers: { origin: "null", "user-agent": "openai-mcp/1.0.0" },
    });
    expect(resolved.value).toBe("chatgpt");
  });

  test("clientInfo.name on initialize is recognised", () => {
    expect(deriveRequestSource({ headers: {}, body: initialize("openai-mcp") }).value).toBe(
      "chatgpt"
    );
  });
});

describe("deriveRequestSource — other clients", () => {
  test("Claude's web origin and widget sandbox", () => {
    expect(deriveRequestSource({ headers: { origin: "https://claude.ai" } }).value).toBe("claude");
    expect(
      deriveRequestSource({ headers: { origin: "https://abc.claudemcpcontent.com" } }).value
    ).toBe("claude");
  });

  test("Claude Code by client name", () => {
    expect(deriveRequestSource({ headers: {}, body: initialize("claude-code") }).value).toBe(
      "claude"
    );
  });

  test("an unrecognised caller reports its literal host, port dropped", () => {
    const resolved = deriveRequestSource({ headers: { origin: "https://app.example.com:8443" } });
    expect(resolved.value).toBe("app.example.com");
    expect(resolved.tier).toBe(SOURCE_TIER.domain);
  });

  test("Referer is used when Origin is absent", () => {
    expect(deriveRequestSource({ headers: { referer: "https://app.example.com/x" } }).value).toBe(
      "app.example.com"
    );
  });

  test("an unrecognised client falls back to name, then User-Agent", () => {
    expect(deriveRequestSource({ headers: {}, body: initialize("some-agent") }).value).toBe(
      "some-agent"
    );
    expect(deriveRequestSource({ headers: { "user-agent": "curl/8.4.0" } }).value).toBe("curl");
  });

  test("nothing resolvable reports unknown rather than an empty field", () => {
    expect(deriveRequestSource({ headers: {} }).value).toBe(UNKNOWN_REQUEST_SOURCE);
  });
});

describe("deriveRequestSource — tiers and session memory", () => {
  test("a remembered platform survives a later request with no signals", () => {
    const remembered = { value: "chatgpt", tier: SOURCE_TIER.platform };
    expect(deriveRequestSource({ headers: {} }, remembered).value).toBe("chatgpt");
  });

  test("a stronger signal on a later request outranks a weaker remembered one", () => {
    const remembered = { value: "node", tier: SOURCE_TIER.userAgent };
    const resolved = deriveRequestSource(
      { headers: { origin: "https://chatgpt.com" } },
      remembered
    );
    expect(resolved.value).toBe("chatgpt");
    expect(resolved.tier).toBe(SOURCE_TIER.platform);
  });

  test("a remembered value does not displace an equal-tier fresh one", () => {
    const remembered = { value: "old.example.com", tier: SOURCE_TIER.domain };
    expect(
      deriveRequestSource({ headers: { origin: "https://new.example.com" } }, remembered).value
    ).toBe("new.example.com");
  });
});

describe("sanitisation", () => {
  test("header injection and whitespace are neutralised", () => {
    const resolved = deriveRequestSource({
      headers: { "user-agent": "evil agent\r\nX-Injected: 1" },
    });
    expect(resolved.value).toBe("evil");
    expect(resolved.value).not.toContain("\n");
  });

  test("a hostile client name is reduced to the permitted charset", () => {
    const resolved = deriveRequestSource({
      headers: {},
      body: initialize("Foo Bar <script>&=?#"),
    });
    expect(resolved.value).toBe("foo-bar-script");
  });

  test("the value is length-capped", () => {
    const resolved = deriveRequestSource({ headers: {}, body: initialize("x".repeat(500)) });
    expect(resolved.value.length).toBe(100);
  });
});

describe("process fallback", () => {
  test("STDIO mode labels its calls stdio", () => {
    setProcessRequestSource("stdio");
    expect(getRequestSource()).toBe("stdio");
  });

  test("LOCAL_FALCON_REQUEST_SOURCE overrides the STDIO default", () => {
    process.env.LOCAL_FALCON_REQUEST_SOURCE = "self-hosted.example";
    resetProcessRequestSource();
    setProcessRequestSource("stdio");
    expect(getRequestSource()).toBe("self-hosted.example");
  });

  test("out-of-context calls report unknown, never an empty value", () => {
    expect(getRequestSource()).toBe(UNKNOWN_REQUEST_SOURCE);
  });
});

describe("runWithRequestSource", () => {
  test("the value survives awaits, so it reaches the API client layer", async () => {
    await runWithRequestSource({ value: "chatgpt", tier: SOURCE_TIER.platform }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getRequestSource()).toBe("chatgpt");
    });
  });

  test("contexts do not leak between concurrent requests", async () => {
    const seen = await Promise.all([
      runWithRequestSource({ value: "chatgpt", tier: 4 }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getRequestSource();
      }),
      runWithRequestSource({ value: "claude", tier: 4 }, async () => getRequestSource()),
    ]);
    expect(seen).toEqual(["chatgpt", "claude"]);
  });
});

describe("applyRequestSource — stamping outgoing calls", () => {
  const withSource = <T>(fn: () => T): T =>
    runWithRequestSource({ value: "chatgpt", tier: SOURCE_TIER.platform }, fn);

  test("v1 URL-parameter endpoints get a query parameter", () => {
    const stamped = withSource(() =>
      applyRequestSource("https://api.localfalcon.com/v1/reports?limit=10", {})
    );
    expect(new URL(stamped).searchParams.get(REQUEST_SOURCE_PARAM)).toBe("chatgpt");
    expect(new URL(stamped).searchParams.get("limit")).toBe("10");
  });

  test("v2 form endpoints get the field in the body as well", () => {
    const form = new FormData();
    form.append("place_id", "abc");
    const stamped = withSource(() =>
      applyRequestSource("https://api.localfalcon.com/v2/run-scan/", { body: form })
    );
    expect(form.get(REQUEST_SOURCE_PARAM)).toBe("chatgpt");
    expect(new URL(stamped).searchParams.get(REQUEST_SOURCE_PARAM)).toBe("chatgpt");
  });

  test("a retry of the same request does not stack duplicate form fields", () => {
    const form = new FormData();
    const call = () =>
      withSource(() => applyRequestSource("https://api.localfalcon.com/v2/run-scan/", { body: form }));
    const first = call();
    const second = call();
    // withRetry re-invokes its callback with the same FormData instance, so
    // append() here would send request_source three times after two retries.
    expect(form.getAll(REQUEST_SOURCE_PARAM)).toEqual(["chatgpt"]);
    expect(first).toBe(second);
  });

  test("non-API hosts are left completely untouched", () => {
    const form = new FormData();
    const imageUrl = "https://www.localfalcon.com/uploads/identity/logos/logo.png";
    expect(withSource(() => applyRequestSource(imageUrl, { body: form }))).toBe(imageUrl);
    expect(form.get(REQUEST_SOURCE_PARAM)).toBeNull();
    // The OAuth host is not the API host and must not be stamped either.
    const tokenUrl = "https://app.localfalcon.com/oauth-v2/token";
    expect(withSource(() => applyRequestSource(tokenUrl, {}))).toBe(tokenUrl);
  });

  test("a non-URL string is returned unchanged rather than throwing", () => {
    expect(withSource(() => applyRequestSource("not a url", {}))).toBe("not a url");
  });
});
