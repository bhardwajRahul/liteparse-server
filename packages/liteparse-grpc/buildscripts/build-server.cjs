/* eslint-disable */

// build-server.js
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/server.ts"],
    bundle: true,
    outfile: "dist/server.js",
    platform: "node",
    target: "node24",
    format: "esm",
    sourcemap: true,
    external: [
      "@llamaindex/liteparse",
      "@grpc/grpc-js",
      "@bufbuild/protobuf",
      "pino",
      "pino-pretty",
    ],
  })
  .catch(() => process.exit(1));
