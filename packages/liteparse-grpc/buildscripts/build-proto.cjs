/* eslint-disable */

// build-proto.js
//
// Emits the generated proto module (messages + gRPC service stubs) as a
// standalone library entry point. Unlike the CLI bundles this build is
// intentionally NOT bundled: consumers of `@llamaindex/liteparse-grpc` should
// resolve `@grpc/grpc-js` / `@bufbuild/protobuf` from their own node_modules.
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/protogen/parser.ts"],
    bundle: false,
    outfile: "dist/protogen/parser.js",
    platform: "node",
    target: "node24",
    format: "esm",
    sourcemap: true,
  })
  .catch(() => process.exit(1));
