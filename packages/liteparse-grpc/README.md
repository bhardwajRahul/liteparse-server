# @llamaindex/liteparse-grpc

A [gRPC](https://grpc.io) server (and matching client) that exposes [`@llamaindex/liteparse`](https://www.npmjs.com/package/@llamaindex/liteparse) for parsing, screenshotting, and complexity estimation of unstructured documents.

The package ships:

- A **server binary** (`liteparse-grpc-server`) that runs the gRPC service
- A **client binary** (`liteparse-grpc-client`) for quickly exercising the service from the command line
- The **generated TypeScript stubs** so you can build your own client or server against the same `.proto`
- The raw **`parser.proto`** file for generating stubs in other languages

## Installation

```bash
npm install @llamaindex/liteparse-grpc
# or
pnpm add @llamaindex/liteparse-grpc
```

## Service definition

The service exposes three RPCs:

| RPC          | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| `Parse`      | Parse a file into JSON pages, plain text, or markdown       |
| `Screenshot` | Render the pages of a PDF as PNG images                     |
| `IsComplex`  | Estimate the complexity of a file and whether OCR is needed |

See [`proto/parser.proto`](./proto/parser.proto) for the full schema, or import it from the package:

```ts
import protoPath from "@llamaindex/liteparse-grpc/proto";
```

## Running the server

```bash
# From an install
npx liteparse-grpc-server

# Bind address is configurable via env var (default: 127.0.0.1:50051)
GRPC_BIND_ADDR=0.0.0.0:50051 npx liteparse-grpc-server
```

Environment variables:

| Variable         | Default           | Description                                   |
| ---------------- | ----------------- | --------------------------------------------- |
| `GRPC_BIND_ADDR` | `127.0.0.1:50051` | Address the gRPC server binds to              |
| `LOG_LEVEL`      | `info`            | pino log level (`trace`/`debug`/`info`/...)   |
| `NODE_ENV`       | —                 | Set to `production` to disable pretty logging |

## Docker

The repo ships a [`Dockerfile`](./Dockerfile) that produces a self-contained image with all system libraries needed for full LiteParse functionality (libvips, LibreOffice, ImageMagick).

Build and run it from the **repo root** (the Dockerfile expects the workspace layout):

```bash
# Build the image
docker build -f packages/liteparse-grpc/Dockerfile -t liteparse-grpc .

# Run exposing port 50051
docker run -p 50051:50051 liteparse-grpc
```

The gRPC server is then reachable at **localhost:50051**. Override `GRPC_BIND_ADDR` or `LOG_LEVEL` with `-e` as needed.

## Using the client binary

```bash
# Parse a file (defaults to plain text output)
npx liteparse-grpc-client parse ./document.pdf

# Parse as JSON pages
npx liteparse-grpc-client parse ./document.pdf --json

# Parse as markdown
npx liteparse-grpc-client parse ./document.pdf --markdown

# Estimate complexity
npx liteparse-grpc-client is-complex ./document.pdf

# Screenshot every page to ./imgs/
npx liteparse-grpc-client screenshot ./document.pdf --dest-dir ./imgs

# Provide a custom LiteParseConfig via JSON file
npx liteparse-grpc-client parse ./document.pdf --config-file ./my-config.json
```

Run `npx liteparse-grpc-client --help` for the full option list.

## Programmatic usage

The generated stubs are re-exported from the package root, and dedicated client/server entry points are also available:

```ts
// Generated protobuf types & service definitions
import {
  ParserServiceClient,
  ParserServiceService,
  OutputFormat,
  ImageMode,
  type LiteParseConfig,
} from "@llamaindex/liteparse-grpc";

import * as grpc from "@grpc/grpc-js";

const client = new ParserServiceClient(
  "127.0.0.1:50051",
  grpc.credentials.createInsecure(),
);

const file = /* Buffer of your document */;
const config: LiteParseConfig = {
  ocrLanguage: "eng",
  ocrEnabled: true,
  outputFormat: OutputFormat.OUTPUT_FORMAT_MARKDOWN,
  imageMode: ImageMode.IMAGE_MODE_OFF,
  // ...see proto/parser.proto for all fields
};

client.parse({ config, file }, (err, response) => {
  if (err) throw err;
  console.log(response.text);
});
```

## Generating stubs in other languages

Because the `.proto` is bundled, you can point `protoc` (or your language's equivalent) at it:

```bash
protoc \
  --proto_path=node_modules/@llamaindex/liteparse-grpc/proto \
  --python_out=./gen \
  --grpc_python_out=./gen \
  parser.proto
```

## Development

```bash
# Regenerate TS stubs from the .proto
pnpm run build:proto

# Build everything (proto + server + client + type declarations)
pnpm run build
```

## License

MIT
