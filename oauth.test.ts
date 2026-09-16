import { afterEach, describe, expect, test } from "bun:test";
import { checkRedirectUri, resetTrustedDomainCache } from "./oauth/clientStore";

// The redirect_uri allowlist is the only hard control protecting authorization
// codes: the server issues one shared static client_id by design, so the
// upstream consent screen cannot distinguish a legitimate integration from an
// attacker's. These cases pin the boundaries named in clientStore.ts's own doc
// comment, which previously had no coverage at all.

afterEach(() => {
  delete process.env.ADDITIONAL_TRUSTED_REDIRECT_DOMAINS;
  delete process.env.ADDITIONAL_TRUSTED_REDIRECT_URIS;
  resetTrustedDomainCache();
});

describe("checkRedirectUri — allowed", () => {
  test("loopback hosts, with and without ports (RFC 8252 §7.3)", () => {
    for (const uri of [
      "http://localhost/cb",
      "http://localhost:33418/cb",
      "http://127.0.0.1:9000/cb",
      "http://[::1]:9000/cb",
      "https://127.0.0.1:9000/cb",
    ]) {
      const decision = checkRedirectUri(uri);
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("loopback");
    }
  });

  test("trusted platform hosts and their subdomains", () => {
    for (const uri of [
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://auth.openai.com/cb",
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/cb",
      "https://vscode.dev/redirect",
      "https://insiders.vscode.dev/redirect",
      "https://cursor.com/cb",
      "https://chat.mistral.ai/cb",
      "https://perplexity.ai/cb",
      "https://gemini.google.com/cb",
      "https://copilot.microsoft.com/cb",
      "https://localfalcon.com/cb",
    ]) {
      const decision = checkRedirectUri(uri);
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("trusted-domain");
    }
  });
});

describe("checkRedirectUri — denied", () => {
  test("hosts that merely resemble a trusted domain", () => {
    // Boundary matching must require a literal "." before the trusted domain,
    // and must key on the real host rather than anything that looks like one.
    for (const uri of [
      "https://evilchatgpt.com/cb",
      "https://chatgpt.com.evil.test/cb",
      "https://notclaude.ai/cb",
      "https://attacker-controlled-test.example.org/cb",
      "https://example.com/cb1",
    ]) {
      expect(checkRedirectUri(uri)).toEqual({ allowed: false, reason: "host-not-trusted" });
    }
  });

  test("mega-domains are not trusted as bare domains", () => {
    // google.com and microsoft.com host large amounts of unrelated user content
    // and have well-known open redirects; only the product hosts are listed.
    expect(checkRedirectUri("https://anything.google.com/cb").allowed).toBe(false);
    expect(checkRedirectUri("https://google.com/cb").allowed).toBe(false);
    expect(checkRedirectUri("https://anything.microsoft.com/cb").allowed).toBe(false);
  });

  test("userinfo cannot be used to disguise a hostile host", () => {
    // Resolves to host evil.test, not chatgpt.com.
    expect(checkRedirectUri("https://chatgpt.com@evil.test/cb")).toEqual({
      allowed: false,
      reason: "userinfo-not-allowed",
    });
    expect(checkRedirectUri("https://user:pass@chatgpt.com/cb")).toEqual({
      allowed: false,
      reason: "userinfo-not-allowed",
    });
  });

  test("non-https schemes, including script-bearing ones", () => {
    expect(checkRedirectUri("javascript:alert(document.domain)").reason).toBe(
      "disallowed-scheme:javascript:"
    );
    expect(checkRedirectUri("data:text/html,<script>1</script>").reason).toBe(
      "disallowed-scheme:data:"
    );
    expect(checkRedirectUri("file:///etc/passwd").reason).toBe("disallowed-scheme:file:");
  });

  test("http is rejected for non-loopback hosts (no downgrade)", () => {
    expect(checkRedirectUri("http://chatgpt.com/cb")).toEqual({
      allowed: false,
      reason: "http-requires-loopback-host",
    });
  });

  test("fragments are rejected (RFC 6749 §3.1.2)", () => {
    expect(checkRedirectUri("https://chatgpt.com/cb#frag")).toEqual({
      allowed: false,
      reason: "fragment-not-allowed",
    });
  });

  test("malformed URIs", () => {
    for (const uri of ["not a uri", "", "://nope"]) {
      expect(checkRedirectUri(uri)).toEqual({ allowed: false, reason: "malformed-uri" });
    }
  });
});

describe("checkRedirectUri — ADDITIONAL_TRUSTED_REDIRECT_DOMAINS", () => {
  test("an operator-listed domain and its subdomains become trusted", () => {
    expect(checkRedirectUri("https://selfhosted.example/cb").allowed).toBe(false);

    process.env.ADDITIONAL_TRUSTED_REDIRECT_DOMAINS = "selfhosted.example";
    resetTrustedDomainCache();

    expect(checkRedirectUri("https://selfhosted.example/cb").allowed).toBe(true);
    expect(checkRedirectUri("https://sub.selfhosted.example/cb").allowed).toBe(true);
    // Still scoped — an unlisted host gains nothing.
    expect(checkRedirectUri("https://other.example/cb").allowed).toBe(false);
  });

  test("malformed entries are ignored rather than widening the policy", () => {
    process.env.ADDITIONAL_TRUSTED_REDIRECT_DOMAINS =
      "ok.example, bad host!, https://nope.com, *.wild.example";
    resetTrustedDomainCache();

    expect(checkRedirectUri("https://ok.example/cb").allowed).toBe(true);
    expect(checkRedirectUri("https://nope.com/cb").allowed).toBe(false);
    expect(checkRedirectUri("https://wild.example/cb").allowed).toBe(false);
    expect(checkRedirectUri("https://anything.wild.example/cb").allowed).toBe(false);
  });

  test("the operator escape hatch still cannot bypass scheme or structure rules", () => {
    process.env.ADDITIONAL_TRUSTED_REDIRECT_DOMAINS = "selfhosted.example";
    resetTrustedDomainCache();

    expect(checkRedirectUri("http://selfhosted.example/cb").allowed).toBe(false);
    expect(checkRedirectUri("https://selfhosted.example/cb#f").allowed).toBe(false);
    expect(checkRedirectUri("https://u:p@selfhosted.example/cb").allowed).toBe(false);
  });
});

describe("checkRedirectUri — ADDITIONAL_TRUSTED_REDIRECT_URIS", () => {
  const setUris = (value: string) => {
    process.env.ADDITIONAL_TRUSTED_REDIRECT_URIS = value;
    resetTrustedDomainCache();
  };

  test("an exact listed URI is allowed, and nothing around it is", () => {
    expect(checkRedirectUri("https://partner.example/oauth/callback").allowed).toBe(false);

    setUris("https://partner.example/oauth/callback");

    expect(checkRedirectUri("https://partner.example/oauth/callback")).toEqual({
      allowed: true,
      reason: "operator-allowlisted-uri",
    });
    // Exact means exact: no sibling paths, no subdomains, no bare host.
    expect(checkRedirectUri("https://partner.example/oauth/other").allowed).toBe(false);
    expect(checkRedirectUri("https://partner.example/").allowed).toBe(false);
    expect(checkRedirectUri("https://sub.partner.example/oauth/callback").allowed).toBe(false);
  });

  test("equivalent spellings of the same URI match", () => {
    setUris("https://Partner.Example:443/oauth/callback");
    // Host and scheme case-fold, and the default port is implied.
    expect(checkRedirectUri("https://partner.example/oauth/callback").allowed).toBe(true);
    expect(checkRedirectUri("https://PARTNER.example/oauth/callback").allowed).toBe(true);
    // Paths are case-sensitive, so this is a different endpoint.
    expect(checkRedirectUri("https://partner.example/OAuth/Callback").allowed).toBe(false);
  });

  test("the query string is part of the identity", () => {
    setUris("https://partner.example/cb?tenant=a");
    expect(checkRedirectUri("https://partner.example/cb?tenant=a").allowed).toBe(true);
    expect(checkRedirectUri("https://partner.example/cb?tenant=b").allowed).toBe(false);
    expect(checkRedirectUri("https://partner.example/cb").allowed).toBe(false);
  });

  test("multiple entries, and whitespace around them, are handled", () => {
    setUris(" https://a.example/cb ,https://b.example/cb ");
    expect(checkRedirectUri("https://a.example/cb").allowed).toBe(true);
    expect(checkRedirectUri("https://b.example/cb").allowed).toBe(true);
    expect(checkRedirectUri("https://c.example/cb").allowed).toBe(false);
  });

  test("loopback http is accepted as an entry; other http is not", () => {
    setUris("http://127.0.0.1:5173/cb,http://insecure.example/cb");
    expect(checkRedirectUri("http://127.0.0.1:5173/cb").allowed).toBe(true);
    expect(checkRedirectUri("http://insecure.example/cb").allowed).toBe(false);
  });

  test("entries that could never be valid targets are ignored", () => {
    setUris(
      "javascript:alert(1),data:text/html;base64_,https://ok.example/cb#frag," +
        "https://u:p@ok.example/cb,not-a-uri,partner.example/cb"
    );
    // A dangerous entry cannot take effect: scheme/fragment/userinfo are
    // rejected before any allowlist is consulted.
    expect(checkRedirectUri("javascript:alert(1)").allowed).toBe(false);
    expect(checkRedirectUri("https://ok.example/cb#frag").allowed).toBe(false);
    expect(checkRedirectUri("https://u:p@ok.example/cb").allowed).toBe(false);
    // And none of them accidentally allowlisted the bare host.
    expect(checkRedirectUri("https://ok.example/cb").allowed).toBe(false);
    expect(checkRedirectUri("https://partner.example/cb").allowed).toBe(false);
  });

  test("it composes with the domains list rather than replacing it", () => {
    process.env.ADDITIONAL_TRUSTED_REDIRECT_DOMAINS = "domainwide.example";
    setUris("https://exact.example/cb");

    expect(checkRedirectUri("https://exact.example/cb").reason).toBe("operator-allowlisted-uri");
    expect(checkRedirectUri("https://anything.domainwide.example/x").reason).toBe("trusted-domain");
    expect(checkRedirectUri("https://chatgpt.com/cb").reason).toBe("trusted-domain");
    expect(checkRedirectUri("https://neither.example/cb").allowed).toBe(false);
  });
});

describe("POST /register redirect_uri policy", () => {
  // Mirrors the decision logic in index.ts's /register handler: structurally
  // impossible URIs are refused outright; a registration with no usable URI is
  // refused because it could never complete a flow; a mix is accepted.
  type Outcome = "reject-malformed" | "reject-no-usable" | "accept";

  const classify = (uris: string[]): Outcome => {
    const decisions = uris.map((uri) => checkRedirectUri(uri));
    if (decisions.some((d) => !d.allowed && d.reason !== "host-not-trusted")) {
      return "reject-malformed";
    }
    if (decisions.length > 0 && !decisions.some((d) => d.allowed)) {
      return "reject-no-usable";
    }
    return "accept";
  };

  test("the reported reproduction is now refused", () => {
    expect(classify(["https://example.com/cb1"])).toBe("reject-no-usable");
    expect(classify(["https://attacker-controlled-test.example.org/cb"])).toBe(
      "reject-no-usable"
    );
  });

  test("legitimate single-callback registrations are accepted", () => {
    expect(classify(["https://chatgpt.com/cb"])).toBe("accept");
    expect(classify(["http://127.0.0.1:33418/cb"])).toBe("accept");
  });

  test("a mix containing a usable callback is accepted", () => {
    // Protects a register-one/authorize-with-another client we cannot inspect.
    expect(classify(["https://untrusted.example/cb", "https://chatgpt.com/cb"])).toBe("accept");
  });

  test("structurally impossible URIs are refused even alongside a usable one", () => {
    expect(classify(["https://chatgpt.com/cb", "javascript:alert(1)"])).toBe("reject-malformed");
  });

  test("an absent redirect_uris list is left alone", () => {
    // Pre-existing behaviour: nothing to validate, so nothing to refuse.
    expect(classify([])).toBe("accept");
  });
});
