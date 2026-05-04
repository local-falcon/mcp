import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
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

export default defineConfig({
  root: resolve(uiDir, targetEntry),
  plugins: [viteSingleFile()],
  define: {
    '__GOOGLE_MAPS_API_KEY__': JSON.stringify(process.env.GOOGLE_MAPS_API_KEY || ''),
  },
  build: {
    outDir: resolve(__dirname, "dist/ui", targetEntry),
    emptyOutDir: true,
  },
});
