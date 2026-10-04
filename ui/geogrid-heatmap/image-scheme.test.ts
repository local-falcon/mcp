import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule } from "typescript";

// Exercise the actual private URL validator without mounting the Maps widget or
// importing its network-capable bridge. The VM exposes only URL, never fetch.
const widgetSource = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const start = widgetSource.indexOf("const IMG_DOMAIN_EXACT");
const end = widgetSource.indexOf("const STYLE_TEXT_ALIGN_RE", start);
if (start < 0 || end < start) throw new Error("Image validator source not found");
const validatorSource = transpileModule(widgetSource.slice(start, end), {}).outputText;
const isAllowedImage: (src: string) => boolean = runInNewContext(
  `${validatorSource}\nisAllowedImgDomain`, { URL },
);

test("scrape images use HTTPS to match the widget's resource CSP", () => {
  expect(isAllowedImage("https://images.openai.com/example.png")).toBe(true);
  expect(isAllowedImage("https://lh3.googleusercontent.com/example.png")).toBe(true);
  for (const src of [
    "http://images.openai.com/example.png",
    "ftp://images.openai.com/example.png",
    "blob:https://images.openai.com/example",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "https://images.openai.com.attacker.example/image.png",
    "https://attacker.example/image.png",
    "not a URL",
  ]) expect(isAllowedImage(src)).toBe(false);
});

test("scrape images cannot bypass the exact provider origins declared by the CSP", () => {
  for (const host of [
    "maps.googleapis.com", "mapsresources-pa.googleapis.com", "maps.gstatic.com",
    "fonts.gstatic.com", "fonts.googleapis.com", "csi.gstatic.com",
    "lh3.googleusercontent.com", "lh4.googleusercontent.com", "lh5.googleusercontent.com", "lh6.googleusercontent.com",
    "images.openai.com", "fastly.4sqi.net",
  ]) expect(isAllowedImage(`https://${host}/example.png`)).toBe(true);
  for (const host of [
    "attacker-bucket.s3.us-east-1.amazonaws.com", "unused.googleapis.com",
    "arbitrary.google.com", "arbitrary.gstatic.com", "arbitrary.googleusercontent.com",
    "lh7.googleusercontent.com", "lh3.googleusercontent.com.attacker.example",
    "images.openai.com.attacker.example", "lf-static-v2.localfalcon.com",
  ]) expect(isAllowedImage(`https://${host}/example.png`)).toBe(false);
});
