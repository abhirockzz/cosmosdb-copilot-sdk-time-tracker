import * as esbuild from "esbuild";
import { cpSync } from "fs";

const commonOpts = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  external: ["electron", "@github/copilot", "@azure/cosmos", "@azure/identity"],
};

// Bundle main process
await esbuild.build({
  ...commonOpts,
  entryPoints: ["src/main/main.ts"],
  outfile: "dist/main/main.js",
});

// Bundle preload script
await esbuild.build({
  ...commonOpts,
  entryPoints: ["src/main/preload.ts"],
  outfile: "dist/main/preload.js",
});

// Copy renderer files
cpSync("src/renderer", "dist/renderer", { recursive: true });

// Copy marked for renderer-side markdown rendering
cpSync("node_modules/marked/lib/marked.umd.js", "dist/renderer/marked.umd.js");

console.log("Build complete.");
