import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const assetDirectory = fileURLToPath(new URL("../public/assets/", import.meta.url));
await mkdir(assetDirectory, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  platform: "browser",
  target: ["es2020"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
  banner: { js: "// @ts-nocheck" },
};

await build({
  bundle: true,
  minify: true,
  target: ["es2020"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
  entryPoints: [fileURLToPath(new URL("../src/styles/global.css", import.meta.url))],
  outfile: fileURLToPath(new URL("../public/assets/site.css", import.meta.url)),
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL("../src/client/site-ui.js", import.meta.url))],
  format: "iife",
  outfile: fileURLToPath(new URL("../public/assets/site-ui.js", import.meta.url)),
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL("../src/client/exif-helper.js", import.meta.url))],
  format: "iife",
  outfile: fileURLToPath(new URL("../public/assets/exif-helper.js", import.meta.url)),
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL("../src/client/photo-map.js", import.meta.url))],
  format: "iife",
  outfile: fileURLToPath(new URL("../public/assets/photo-map.js", import.meta.url)),
  loader: { ".css": "css", ".png": "dataurl" },
});
