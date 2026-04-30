# liteparse-server

An Express server that exposes [`@llamaindex/liteparse`](https://www.npmjs.com/package/@llamaindex/liteparse) as an HTTP parsing backend. It supports single-file parsing, batch parsing, and page screenshotting, with built-in rate limiting (Redis), distributed tracing (OpenTelemetry → Jaeger), and metrics (OpenTelemetry → Prometheus → Grafana).

A **slim variant** (`src/slim.ts`) is also available — it exposes the same API surface with no caching and no observability instrumentation, making it ideal for lightweight deployments where Redis, the OTel Collector, and supporting services are not needed.

---

## Table of contents

- [Requirements](#requirements)
- [Environment variables](#environment-variables)
- [Running the server](#running-the-server)
- [Running with Docker](#running-with-docker)
- [Supporting services](#supporting-services)
- [Caching](#caching)
- [Slim server](#slim-server)
- [API reference](#api-reference)
- [Testing with the test script](#testing-with-the-test-script)

---

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (for the supporting services)
- [uv](https://github.com/astral-sh/uv) (for the test script, optional)

---

## Environment variables

Create a `.env` file in the project root. The following variables are required:

| Variable                   | Description                                                                                  | Example                            |
|----------------------------|----------------------------------------------------------------------------------------------|------------------------------------|
| `REDIS_URI`                | URI of the Redis instance used for rate limiting                                             | `redis://localhost:6379`           |
| `REDIS_PASSWORD`           | Password for Redis                                                                           | `s3cr3t`                           |
| `GRAFANA_USER`             | Grafana admin username                                                                       | `admin`                            |
| `GRAFANA_PASS`             | Grafana admin password                                                                       | `admin`                            |
| `OTEL_COLLECTOR_ENDPOINT`  | Base URL of the OpenTelemetry Collector (no path suffix). The server appends `/v1/traces` and `/v1/metrics` automatically. | `http://localhost:4318` |

> **Note:** When running the server locally (outside Docker), set `OTEL_COLLECTOR_ENDPOINT=http://localhost:4318` and `REDIS_URI=redis://localhost:6379`. When running via Docker Compose, set them to `http://otel-collector:4318` and `redis://redis:6379` respectively, so the server can reach the collector and Redis instance over the internal Docker network (see [Running with Docker](#running-with-docker)).

---

## Running the server

### 1. Install dependencies

```bash
bun install
```

### 2. Start the supporting services

```bash
docker compose up -d
```

### 3. Start the API server

```bash
bun --preload ./src/instrumentation.ts src/index.ts
```

The server listens on **port 5000**.

---

## Running with Docker

`compose.yaml` includes a `liteparse-server` service that builds the image locally and starts the full stack — server, Redis, OTel Collector, Jaeger, Prometheus, and Grafana — in one command.

### 1. Set environment variables

Add the following to your `.env` file (in addition to the variables listed above). When running inside Docker Compose the collector is reachable via its service name:

```env
OTEL_COLLECTOR_ENDPOINT=http://otel-collector:4318
REDIS_URI=redis://redis:6379
```

### 2. Build and start the full stack

```bash
docker compose up -d --build
```

The `--build` flag rebuilds the `liteparse-server` image from the local `Dockerfile`. Omit it on subsequent starts if the source hasn't changed.

### 3. Verify

```bash
docker compose ps
```

The API server will be available at **http://localhost:5000**, and all supporting service UIs remain on their usual ports (Jaeger: 16686, Prometheus: 9090, Grafana: 3000).

### Stopping the stack

```bash
docker compose down
```

---

## Supporting services

All services are defined in `compose.yaml` and can be started together with `docker compose up -d`.

### Redis — rate limiting

| Detail      | Value                  |
|-------------|------------------------|
| Image       | `redis:latest`         |
| Port        | `6379`                 |
| Persistence | append-only file (AOF) |

Redis is used by `rate-limiter-flexible` to enforce a per-IP rate limit of **100 requests per 60 seconds** on every endpoint. The connection is configured via the `REDIS_URI` and `REDIS_PASSWORD` environment variables.

### OpenTelemetry Collector

| Detail  | Value                                          |
|---------|------------------------------------------------|
| Image   | `otel/opentelemetry-collector-contrib:latest`  |
| Ports   | `4318` (OTLP/HTTP), `9464` (Prometheus scrape) |
| Config  | `otel-collector.yaml`                          |

The server ships traces and metrics to the collector over OTLP/HTTP (`http://localhost:4318`). The collector:

- Forwards **traces** to Jaeger via OTLP/gRPC.
- Exposes **metrics** on port `9464` in Prometheus format for scraping.

### Jaeger — distributed tracing UI

| Detail | Value                          |
|--------|--------------------------------|
| Image  | `jaegertracing/all-in-one:latest` |
| UI     | <http://localhost:16686>       |

Traces from every parse/screenshot request are visible in the Jaeger UI. Each trace includes span attributes like `file.name`, `file.size`, `file.mimetype`, `parse.mode`, and `parse.pages_count`.

### Prometheus — metrics storage

| Detail  | Value                     |
|---------|---------------------------|
| Image   | `prom/prometheus:latest`  |
| Port    | `9090`                    |
| Config  | `prometheus.yaml`         |
| UI      | <http://localhost:9090>   |

Prometheus scrapes the OTel Collector every 5 seconds. Available metrics include HTTP request counts, request durations, rate-limited request counts, parse durations, page counts, file sizes, and error totals.

### Grafana — dashboards

| Detail        | Value                      |
|---------------|----------------------------|
| Image         | `grafana/grafana:latest`   |
| Port          | `3000`                     |
| Credentials   | `GRAFANA_USER` / `GRAFANA_PASS` env vars |
| UI            | <http://localhost:3000>    |

Grafana is pre-provisioned with Prometheus as its default datasource (`grafana/provisioning/datasources/datasource.yml`). Dashboards can be added manually or via additional provisioning files.

---

## Caching

All three endpoints cache their results in Redis, keyed on a **SHA-256 hash of the uploaded file content(s)** combined with the `config` options and the `text` flag. Identical requests are served from the cache without re-invoking the parser.

| Endpoint        | Redis key prefix | TTL      |
|-----------------|------------------|----------|
| `POST /parse`        | `parse:`         | 1 hour   |
| `POST /batch/parse`  | `batch_parse:`   | 12 hours |
| `POST /screenshots`  | `screenshot:`    | 24 hours |

Cache hits increment the corresponding OpenTelemetry counter metric (`liteparse.parse.cache_hits`, `liteparse.batch_parse.cache_hits`, `liteparse.screenshot.cache_hits`) and set a `cache.hit` span attribute (`"true"` / `"false"`) on the active trace span — both visible in Grafana and Jaeger respectively.

The cache shares the same Redis instance used for rate limiting and is configured via the same `REDIS_URI` and `REDIS_PASSWORD` environment variables.

---

## Slim server

`src/slim.ts` is a stripped-down variant of the server that removes all built-in caching and observability. It exposes the same three endpoints (`POST /parse`, `POST /batch/parse`, `POST /screenshots`) and keeps rate limiting and logging, but requires **no Redis caching/rate-limiting**, **no OpenTelemetry Collector**, and **no supporting metrics/tracing services**.

### Running locally

```bash
bun run start-slim:bun
# or with Node
npm run start-slim:node
```

The server listens on **port 5000**.

### Building and running with Docker

The `slim.Dockerfile` produces a self-contained image with no observability dependencies:

```bash
# Build the image
docker build -f slim.Dockerfile -t liteparse-server-slim .

# Run it (supply Redis connection details via env vars)
docker run -p 5000:5000 liteparse-server-slim
```

The API is then available at **http://localhost:5000**.

---

## API reference

Base URL: `http://localhost:5000`

### `POST /parse` — parse a single file

Parses a single document and returns either structured page data or plain text.

**Form fields:**

| Field    | Type   | Required | Description                                         |
|----------|--------|----------|-----------------------------------------------------|
| `file`   | file   | ✅        | The document to parse                               |
| `config` | string | ❌        | JSON-serialized `LiteParseConfig` options           |

**Query parameters:**

| Parameter | Type    | Default  | Description                                              |
|-----------|---------|----------|----------------------------------------------------------|
| `text`    | boolean | `false`  | If `true`, returns `text/plain`; otherwise `application/json` with a `pages` array |

**Responses:**

- `200 text/plain` — extracted text (when `text=true`)
- `200 application/json` — `{ "pages": [...] }` (when `text=false`)
- `400` — missing `file`
- `429` — rate limit exceeded

---

### `POST /batch/parse` — parse multiple files

Parses multiple documents in a single request.

**Form fields:**

| Field    | Type     | Required | Description                               |
|----------|----------|----------|-------------------------------------------|
| `files`  | file[]   | ✅        | One or more documents to parse            |
| `config` | string   | ❌        | JSON-serialized `LiteParseConfig` options |

**Query parameters:**

| Parameter | Type    | Default  | Description                               |
|-----------|---------|----------|-------------------------------------------|
| `text`    | boolean | `false`  | If `true`, returns extracted text per file |

**Response `200 application/json`:**

```json
{
  "parsed": [
    { "file_name": "doc.pdf", "pages": [...] },
    { "file_name": "doc.pdf", "text": "..." }
  ]
}
```

---

### `POST /screenshots` — screenshot pages of a document

Renders document pages as PNG images and streams them back as newline-delimited JSON (NDJSON).

**Form fields:**

| Field    | Type   | Required | Description                               |
|----------|--------|----------|-------------------------------------------|
| `file`   | file   | ✅        | The document to screenshot                |
| `config` | string | ❌        | JSON-serialized `LiteParseConfig` options |

**Query parameters:**

| Parameter | Type   | Default | Description                                                        |
|-----------|--------|---------|--------------------------------------------------------------------|
| `pages`   | string | all     | Comma-separated 1-based page numbers to screenshot (e.g. `1,2,3`) |

**Response `200 application/x-ndjson`** — one JSON object per line:

```json
{ "index": 0, "mimetype": "image/png", "data": "<base64>", "page_number": 1, "height": 1056, "width": 816 }
```

---

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
./scripts/server-test.py file path/to/document.pdf text
```

#### Batch parse all files in a directory

```bash
./scripts/server-test.py dir path/to/directory/
```

#### Batch parse with plain text output

```bash
./scripts/server-test.py dir path/to/directory/ text
```

#### Screenshot pages of a document

```bash
# Screenshot all pages — images saved to the current directory
./scripts/server-test.py screen path/to/document.pdf

# Screenshot specific pages (comma-separated, 1-based)
./scripts/server-test.py screen path/to/document.pdf pages=1,2,3
```

Screenshots are saved as `page_0.png`, `page_1.png`, etc. in the current working directory.
