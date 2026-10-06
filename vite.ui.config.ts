import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { readdirSync } from "fs";

const uiDir = resolve(__dirname, "ui");
const entries: string[] = [];
for (const entry of readdirSync(uiDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    try {
      if (readdirSync(resolve(uiDir, entry.name)).includes("index.html")) {
        entries.push(entry.name);
      }
    } catch { /* skip */ }
  }
}

const targetEntry = process.env.UI_ENTRY || entries[0] || "hello-world";

/*
 * Default JS/CSS inlining adapted from vite-plugin-singlefile 2.3.3:
 * https://github.com/richardtallent/vite-plugin-singlefile
 * MIT License
 * Copyright (c) 2021-present, Richard S. Tallent, II
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// This build emits one HTML page with one JS chunk and one CSS asset.
const inlineGeoGridAssets: Plugin = {
  name: "local-falcon:inline-geogrid-assets",
  enforce: "post",
  generateBundle(_options, bundle) {
    const html = bundle["index.html"];
    const scripts = Object.values(bundle).filter(entry => entry.type === "chunk");
    const styles = Object.values(bundle).filter(entry => entry.type === "asset" && entry.fileName.endsWith(".css"));
    if (!html || html.type !== "asset" || scripts.length !== 1 || styles.length !== 1) {
      this.error("Expected one index.html, one JS chunk, and one CSS asset for the geo-grid widget.");
    }
    const script = scripts[0]!;
    const style = styles[0]!;
    if (style.type !== "asset" || typeof html.source !== "string" || typeof style.source !== "string") {
      this.error("Expected HTML and CSS text assets for the geo-grid widget.");
    }
    const scriptTag = new RegExp(`<script([^>]*?) src="(?:[^"]*?/)?${script.fileName.replaceAll(".", "\\.")}"([^>]*)></script>`);
    const styleTag = new RegExp(`<link([^>]*?) href="(?:[^"]*?/)?${style.fileName.replaceAll(".", "\\.")}"([^>]*)>`);
    if (!scriptTag.test(html.source) || !styleTag.test(html.source)) {
      this.error("Could not find the emitted JS/CSS references in the geo-grid HTML.");
    }
    const code = script.code.replace(/"?__VITE_PRELOAD__"?/g, "void 0").replace(/<(\/script>|!--)/g, "\\x3C$1").trim();
    const css = style.source.replace('@charset "UTF-8";', "").trim();
    html.source = html.source
      .replace(scriptTag, (_, before, after) => `<script${before}${after}>${code}</script>`)
      .replace(styleTag, (_, before, after) => `<style${before}${after}>${css}</style>`);
    delete bundle[script.fileName];
    delete bundle[style.fileName];
  },
};

export default defineConfig({
  root: resolve(uiDir, targetEntry),
  base: "./",
  plugins: [inlineGeoGridAssets],
  define: {
    '__GOOGLE_MAPS_API_KEY__': JSON.stringify(process.env.GOOGLE_MAPS_API_KEY || ''),
  },
  build: {
    outDir: resolve(__dirname, "dist/ui", targetEntry),
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    assetsDir: "",
    rollupOptions: { output: { codeSplitting: false } },
  },
});
