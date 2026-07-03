/* eslint-disable */

// build-server.js
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/client.ts"],
    bundle: true,
    outfile: "dist/client.js",
    platform: "node",
    target: "node24",
    format: "esm",
    sourcemap: true,
    external: ["@grpc/grpc-js", "@bufbuild/protobuf"],
  })
  .catch(() => process.exit(1));
