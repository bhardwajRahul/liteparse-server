/* eslint-disable */

// build-server.js
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/run.ts"],
    bundle: true,
    outfile: "dist/slim.js",
    platform: "node",
    target: "node24",
    format: "esm",
    sourcemap: true,
    external: [
      "@llamaindex/liteparse",
      "@opentelemetry/api",
      "express",
      "multer",
      "tslog",
    ],
  })
  .catch(() => process.exit(1));
