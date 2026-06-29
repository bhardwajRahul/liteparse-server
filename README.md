# liteparse-server

An Express server that exposes [`@llamaindex/liteparse`](https://www.npmjs.com/package/@llamaindex/liteparse) as an HTTP parsing backend. It supports single-file parsing and page screenshotting. An example of how to use it with built-in rate limiting (Redis), distributed tracing (OpenTelemetry → Jaeger), and metrics (OpenTelemetry → Prometheus → Grafana) is available [here](./examples/docker-compose).

## Table of contents

- [Requirements](#requirements)
- [Minimal Server](#minimal-server)
- [API Specification](#api-specification)
- [Testing with the test script](#testing-with-the-test-script)

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (for the supporting services)
- [uv](https://github.com/astral-sh/uv) (for the test script, optional)

## Minimal Server

`src/slim.ts` is a minimal version of the liteparse server that removes all built-in caching, rate limiting and and observability. It exposes the same two endpoints (`POST /parse`, `POST /screenshots`) and keeps rate limiting and logging, but requires **no Redis caching/rate-limiting**, **no OpenTelemetry Collector**, and **no supporting metrics/tracing services**.

### Running locally

```bash
bun run start-slim:bun
# or with Node
npm run start-slim:node
```

The server listens on **port 5707**.

### Building and running with Docker

The `slim.Dockerfile` produces a self-contained image with no observability dependencies:

```bash
# Build the image
docker build -f slim.Dockerfile -t liteparse-server-slim .
# Run exposing port 5707
docker run -p 5707:5707 liteparse-server-slim
```

The API is then available at **http://localhost:5707**.

## Full Server Setup

If you wish to leverage an all-in-one server setup, with **built-in observability, caching and rate-limiting**, you can follow [this guide](./examples/docker-compose/README.md).

## API Specification

The full API specification is available [here](./API_SPEC.md)

## Testing with the test script

[`scripts/server-test.py`](scripts/server-test.py) is a self-contained script that uses [`uv`](https://github.com/astral-sh/uv) to manage its own dependencies (`httpx`). Make sure the server is running before using it.

### Usage

```
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

#### Parse a single file (plain text response)

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

#### Infer complexity of a document

```bash
./scripts/server-test.py is-complex path/to/document.pdf
```
