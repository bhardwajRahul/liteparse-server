# @llamaindex/liteparse-rest

An [Express](https://expressjs.com) server that exposes [`@llamaindex/liteparse`](https://www.npmjs.com/package/@llamaindex/liteparse) as an HTTP parsing backend. It supports single-file parsing, page screenshotting, and document complexity estimation.

For a full production setup with built-in rate limiting (Redis), distributed tracing (OpenTelemetry → Jaeger), and metrics (OpenTelemetry → Prometheus → Grafana), see the [Docker Compose example](./examples/docker-compose).

> **Prefer gRPC?** This repo also ships [`@llamaindex/liteparse-grpc`](./packages/liteparse-grpc) — a gRPC server (and matching client) exposing the same LiteParse capabilities. See its [README](./packages/liteparse-grpc/README.md) for details.

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Docker](#docker)
- [Full server setup](#full-server-setup)
- [API specification](#api-specification)
- [Testing with the test script](#testing-with-the-test-script)
- [Related packages](#related-packages)

## Installation

```bash
npm install -g @llamaindex/liteparse-rest
# or
pnpm add -g @llamaindex/liteparse-rest
```

You can also invoke it directly without installing:

```bash
npx @llamaindex/liteparse-rest
```

## Quick start

Once installed, launch the server with:

```bash
liteparse-rest-server
```

The server listens on **port 5707** by default. Point a client at `http://localhost:5707` and start hitting the [API](#api-specification).

The published binary is the **slim** build — it removes built-in Redis caching, rate limiting and OpenTelemetry observability so it has **no external dependencies**. If you need those features, use the [full server setup](#full-server-setup).

## Docker

The repo ships a `slim.Dockerfile` that produces a self-contained image with no observability dependencies:

```bash
# Build the image
docker build -f slim.Dockerfile -t liteparse-rest .

# Run exposing port 5707
docker run -p 5707:5707 liteparse-rest
```

The API is then available at **http://localhost:5707**.

## Full server setup

If you want an all-in-one deployment with **built-in observability, caching, and rate-limiting**, follow the guide in [`examples/docker-compose`](./examples/docker-compose/README.md).

## API specification

The server exposes three endpoints:

| Method | Path           | Description                                         |
| ------ | -------------- | --------------------------------------------------- |
| `POST` | `/parse`       | Parse a file into JSON pages, text, or markdown     |
| `POST` | `/screenshots` | Render document pages as PNG images (NDJSON stream) |
| `POST` | `/is-complex`  | Estimate document complexity / need for OCR         |

The full specification — request fields, query parameters, response shapes and error codes — is available in [`API_SPEC.md`](./API_SPEC.md).

## Testing with the test script

[`scripts/server-test.py`](scripts/server-test.py) is a self-contained script that uses [`uv`](https://github.com/astral-sh/uv) to manage its own dependencies (`httpx`). Make sure the server is running before using it.

### Usage

```bash
python scripts/server-test.py <command> <path> [options]
```

Or, if `uv` is available, run it directly:

```bash
./scripts/server-test.py <command> <path> [options]
```

### Commands

#### Parse a single file (JSON pages response)

```bash
./scripts/server-test.py file path/to/document.pdf
```

#### Parse a single file (plain text or markdown response)

```bash
# plain text
./scripts/server-test.py file path/to/document.pdf text
# markdown
./scripts/server-test.py file path/to/document.pdf markdown
```

#### Screenshot pages of a document

```bash
# Screenshot all pages — images saved to the current directory
./scripts/server-test.py screen path/to/document.pdf

# Screenshot specific pages (comma-separated, 1-based)
./scripts/server-test.py screen path/to/document.pdf pages=1,2,3
```

Screenshots are saved as `page_0.png`, `page_1.png`, etc. in the current working directory.

#### Estimate document complexity

```bash
./scripts/server-test.py is-complex path/to/document.pdf
```

## Related packages

This repository is a pnpm workspace containing:

| Package                                                   | Description                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@llamaindex/liteparse-rest`](./)                        | This package — an Express HTTP server wrapping LiteParse                                   |
| [`@llamaindex/liteparse-grpc`](./packages/liteparse-grpc) | A gRPC server + client for the same LiteParse capabilities, with a bundled `.proto` schema |

## License

MIT
