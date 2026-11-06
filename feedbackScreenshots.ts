/**
 * Turns the screenshot inputs of submitLocalFalconFeedback into validated
 * base64 data URIs for POST /v2/feedback/submit/ (`screenshots_base64[]`).
 *
 * MCP tool arguments are JSON, so an image "file" reaches this server one of
 * three ways depending on the client:
 *
 *   files   ChatGPT uploads, delivered via _meta["openai/fileParams"] as
 *           { download_url, file_id, mime_type?, file_name? }. Downloaded here.
 *   paths   Local file paths. STDIO only — a hosted server cannot read the
 *           caller's disk, so remote sessions never see this field.
 *   base64  Raw base64 or a data: URI, from any client.
 *
 * Every source gets the same checks the API applies (≤ 8 MB, PNG/JPEG/GIF/WEBP
 * detected from magic bytes), so a bad image fails with a precise local error
 * instead of a round trip — and a local path can only ever ship an image.
 *
 * Downloads are a server-side fetch of a caller-supplied URL. OpenAI does not
 * document the download host, so rather than an allowlist the fetch is
 * restricted to https on public addresses: IP-literal hosts are checked up
 * front, and DNS names are checked inside the socket's own lookup (so a name
 * cannot resolve to a public address for a check and a private one for the
 * connect). Redirects are followed manually and each hop re-checked. No
 * credentials are sent, and a downloaded body never reaches the caller — only
 * the API, and only if it is an image.
 */
import fetch from "node-fetch";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promises as fsp } from "node:fs";

export const MAX_SCREENSHOTS = 5;
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** The file object ChatGPT passes for each entry of an openai/fileParams field. */
export interface FeedbackFileRef {
  download_url: string;
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

export interface FeedbackScreenshotInput {
  files?: FeedbackFileRef[] | null;
  base64?: string[] | null;
  paths?: string[] | null;
}

/** Detects the image type from its leading bytes; the file name is never trusted. */
export function sniffImageMime(buf: Uint8Array): string | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && (b.toString("latin1", 0, 6) === "GIF87a" || b.toString("latin1", 0, 6) === "GIF89a")) return "image/gif";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDataUri(buf: Buffer, label: string): string {
  if (buf.length === 0) throw new Error(`${label} is empty.`);
  if (buf.length > MAX_SCREENSHOT_BYTES) {
    throw new Error(`${label} is ${megabytes(buf.length)}; screenshots can be at most 8 MB each.`);
  }
  const mime = sniffImageMime(buf);
  if (!mime) throw new Error(`${label} must be a PNG, JPEG, GIF or WEBP image.`);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ── base64 ──────────────────────────────────────────────────────────────────

function decodeBase64(value: string, label: string): string {
  let payload = value.trim();
  const dataUri = /^data:([^,]*),/i.exec(payload);
  if (dataUri) {
    if (!/;base64$/i.test(dataUri[1])) throw new Error(`${label} is a data URI that is not base64-encoded.`);
    payload = payload.slice(dataUri[0].length);
  }
  payload = payload.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(payload)) throw new Error(`${label} is not valid base64.`);
  // Reject oversize input before allocating the decoded buffer.
  if (Math.floor(payload.length * 3 / 4) - 2 > MAX_SCREENSHOT_BYTES) {
    throw new Error(`${label} is larger than 8 MB; screenshots can be at most 8 MB each.`);
  }
  return toDataUri(Buffer.from(payload, "base64"), label);
}

// ── local paths (STDIO only) ────────────────────────────────────────────────

async function readLocalImage(filePath: string, label: string): Promise<string> {
  const expanded = filePath.startsWith("~") ? path.join(os.homedir(), filePath.slice(1)) : filePath;
  const resolved = path.resolve(expanded);
  if (!IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error(`${label} (${filePath}) must be a .png, .jpg, .jpeg, .gif or .webp file.`);
  }
  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    throw new Error(`${label} (${filePath}) was not found or cannot be read.`);
  }
  if (!stat.isFile()) throw new Error(`${label} (${filePath}) is not a file.`);
  if (stat.size > MAX_SCREENSHOT_BYTES) {
    throw new Error(`${label} (${filePath}) is ${megabytes(stat.size)}; screenshots can be at most 8 MB each.`);
  }
  return toDataUri(await fsp.readFile(resolved), `${label} (${filePath})`);
}

// ── downloads ───────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

// Loopback, private, link-local, CGNAT, documentation, benchmarking,
// multicast and reserved ranges.
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Expands an IPv6 address into eight 16-bit groups. */
function ipv6Groups(ip: string): number[] {
  let address = ip.toLowerCase().split("%")[0];
  // A trailing dotted IPv4 (e.g. ::ffff:10.0.0.1) becomes two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[1]);
    address = address.slice(0, -dotted[1].length) + `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const [head, tail] = address.includes("::") ? address.split("::") : [address, undefined];
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : new Array(8 - headGroups.length - tailGroups.length).fill("0");
  return [...headGroups, ...fill, ...tailGroups].map(group => parseInt(group || "0", 16));
}

function groupsToV4(hi: number, lo: number): string {
  return [hi >>> 8, hi & 0xff, lo >>> 8, lo & 0xff].join(".");
}

function isBlockedV6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (g.length !== 8 || g.some(n => Number.isNaN(n))) return true;
  // ::, ::1 and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 6).every(n => n === 0)) return true;
  // IPv4-mapped ::ffff:a.b.c.d — judge the embedded IPv4.
  if (g.slice(0, 5).every(n => n === 0) && g[5] === 0xffff) return isBlockedV4(groupsToV4(g[6], g[7]));
  // 6to4 2002:AABB:CCDD::/16 embeds an IPv4.
  if (g[0] === 0x2002) return isBlockedV4(groupsToV4(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return true; // documentation, Teredo
  return false;
}

/** True for any address a server-side fetch must not reach. Exported for tests. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isBlockedV4(address);
  if (family === 6) return isBlockedV6(address);
  return true;
}

// Socket-level lookup: the address checked is the address connected to.
const publicOnlyLookup: any = (hostname: string, options: any, callback: any) => {
  const opts = typeof options === "object" && options !== null ? options : { family: options };
  dns.lookup(hostname, { ...opts, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = addresses as unknown as dns.LookupAddress[];
    if (list.length === 0 || list.some(entry => isBlockedAddress(entry.address))) {
      return callback(new Error(`Screenshot host ${hostname} does not resolve to a public address.`));
    }
    if (opts.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

const publicOnlyAgent = new https.Agent({ lookup: publicOnlyLookup });

function checkDownloadUrl(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} has an invalid download_url.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} download_url must use https.`);
  if (url.username || url.password) throw new Error(`${label} download_url must not contain credentials.`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Node skips the lookup for IP literals, so they are checked here instead.
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new Error(`${label} download_url must point to a public address.`);
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error(`${label} download_url must point to a public address.`);
  }
  return url;
}

async function readCapped(res: any, label: string): Promise<Buffer> {
  const declared = Number(res.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SCREENSHOT_BYTES) {
    throw new Error(`${label} is ${megabytes(declared)}; screenshots can be at most 8 MB each.`);
  }
  const body = res.body;
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      total += chunk.length;
      if (total > MAX_SCREENSHOT_BYTES) {
        body.destroy?.();
        throw new Error(`${label} is larger than 8 MB; screenshots can be at most 8 MB each.`);
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadImage(file: FeedbackFileRef, label: string): Promise<string> {
  const named = file.file_name ? `${label} (${file.file_name})` : label;
  let url = checkDownloadUrl(file.download_url, named);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      let res: any;
      try {
        res = await fetch(url.toString(), {
          method: "GET",
          redirect: "manual",
          agent: publicOnlyAgent,
          signal: controller.signal as any,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") throw new Error(`${named} could not be downloaded within ${DOWNLOAD_TIMEOUT_MS / 1000}s.`);
        const reason = (error as Error).message?.includes("public address") ? " It does not resolve to a public address." : "";
        throw new Error(`${named} could not be downloaded.${reason}`);
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers?.get?.("location");
        if (!location || hop >= MAX_REDIRECTS) throw new Error(`${named} could not be downloaded (too many redirects).`);
        url = checkDownloadUrl(new URL(location, url).toString(), named);
        continue;
      }
      if (!res.ok) throw new Error(`${named} could not be downloaded (HTTP ${res.status}).`);
      return toDataUri(await readCapped(res, named), named);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validates and converts every screenshot input into a data URI, in the order
 * files, paths, base64. Throws an Error naming the offending screenshot; no
 * request is made to Local Falcon unless all of them pass.
 */
export async function resolveFeedbackScreenshots(
  input: FeedbackScreenshotInput,
  options: { localFiles: boolean }
): Promise<string[]> {
  const files = input.files ?? [];
  const paths = input.paths ?? [];
  const base64 = input.base64 ?? [];

  const total = files.length + paths.length + base64.length;
  if (total > MAX_SCREENSHOTS) {
    throw new Error(`You can attach at most ${MAX_SCREENSHOTS} screenshots in total; ${total} were supplied.`);
  }
  if (paths.length > 0 && !options.localFiles) {
    throw new Error("Screenshot file paths only work with the locally installed (STDIO) Local Falcon MCP server. Send the image as base64 in screenshotsBase64 instead.");
  }

  const result: string[] = [];
  let n = 0;
  for (const file of files) result.push(await downloadImage(file, `Screenshot #${++n}`));
  for (const filePath of paths) result.push(await readLocalImage(filePath, `Screenshot #${++n}`));
  for (const value of base64) result.push(decodeBase64(value, `Screenshot #${++n}`));
  return result;
}
