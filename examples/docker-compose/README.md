# Running with Docker Compose

Guide on how to run the fully instrumented, rate-limited and cached server with Docker Compose.

## Environment variables

Create a `.env` file in the project root. The following variables are required:

| Variable                  | Description                                                                                                                | Example                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `REDIS_URI`               | URI of the Redis instance used for rate limiting                                                                           | `redis://localhost:6379` |
| `REDIS_PASSWORD`          | Password for Redis                                                                                                         | `s3cr3t`                 |
| `GRAFANA_USER`            | Grafana admin username                                                                                                     | `admin`                  |
| `GRAFANA_PASS`            | Grafana admin password                                                                                                     | `admin`                  |
| `OTEL_COLLECTOR_ENDPOINT` | Base URL of the OpenTelemetry Collector (no path suffix). The server appends `/v1/traces` and `/v1/metrics` automatically. | `http://localhost:4318`  |

> **Note:** When running the server locally (outside Docker), set `OTEL_COLLECTOR_ENDPOINT=http://localhost:4318` and `REDIS_URI=redis://localhost:6379`. When running via Docker Compose, set them to `http://otel-collector:4318` and `redis://redis:6379` respectively, so the server can reach the collector and Redis instance over the internal Docker network (see [Running with Docker](#running-with-docker)).

---

## Running the server

### 0. Copy all the files in this directory to the main folder

```bash
cp compose.yaml ../../
cp Dockerfile ../../
cp otel-collector.yaml ../../
cp prometheus.yaml ../../
cp -r grafana ../../
```

Move to the main folder now to run all the other commands in this guide:

```bash
cd ../..
```

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the supporting services

```bash
docker compose up -d
```

### 3. Start the API server

```bash
node --import ./src/instrumentation.ts src/index.ts
```

The server listens on **port 5707**.

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

The API server will be available at **http://localhost:5707**, and all supporting service UIs remain on their usual ports (Jaeger: 16686, Prometheus: 9090, Grafana: 3000).

### Stopping the stack

```bash
docker compose down
```

---

## Supporting services

All services are defined in `compose.yaml` and can be started together with `docker compose up -d`.

### Redis — rate limiting and caching

| Detail      | Value                  |
| ----------- | ---------------------- |
| Image       | `redis:latest`         |
| Port        | `6379`                 |
| Persistence | append-only file (AOF) |

Redis is used by `rate-limiter-flexible` to enforce a per-IP rate limit of **100 requests per 60 seconds** on every endpoint. The connection is configured via the `REDIS_URI` and `REDIS_PASSWORD` environment variables.

### OpenTelemetry Collector

| Detail | Value                                          |
| ------ | ---------------------------------------------- |
| Image  | `otel/opentelemetry-collector-contrib:latest`  |
| Ports  | `4318` (OTLP/HTTP), `9464` (Prometheus scrape) |
| Config | `otel-collector.yaml`                          |

The server ships traces and metrics to the collector over OTLP/HTTP (`http://localhost:4318`). The collector:

- Forwards **traces** to Jaeger via OTLP/gRPC.
- Exposes **metrics** on port `9464` in Prometheus format for scraping.

### Jaeger — distributed tracing UI

| Detail | Value                             |
| ------ | --------------------------------- |
| Image  | `jaegertracing/all-in-one:latest` |
| UI     | <http://localhost:16686>          |

Traces from every parse/screenshot request are visible in the Jaeger UI. Each trace includes span attributes like `file.name`, `file.size`, `file.mimetype`, `parse.mode`, and `parse.pages_count`.

### Prometheus — metrics storage

| Detail | Value                    |
| ------ | ------------------------ |
| Image  | `prom/prometheus:latest` |
| Port   | `9090`                   |
| Config | `prometheus.yaml`        |
| UI     | <http://localhost:9090>  |

Prometheus scrapes the OTel Collector every 5 seconds. Available metrics include HTTP request counts, request durations, rate-limited request counts, parse durations, page counts, file sizes, and error totals.

### Grafana — dashboards

| Detail      | Value                                    |
| ----------- | ---------------------------------------- |
| Image       | `grafana/grafana:latest`                 |
| Port        | `3000`                                   |
| Credentials | `GRAFANA_USER` / `GRAFANA_PASS` env vars |
| UI          | <http://localhost:3000>                  |

Grafana is pre-provisioned with Prometheus as its default datasource (`grafana/provisioning/datasources/datasource.yml`). Dashboards can be added manually or via additional provisioning files.

---

## Caching

All three endpoints cache their results in Redis, keyed on a **SHA-256 hash of the uploaded file content(s)** combined with the `config` options and the `text` flag. Identical requests are served from the cache without re-invoking the parser.

| Endpoint            | Redis key prefix | TTL      |
| ------------------- | ---------------- | -------- |
| `POST /parse`       | `parse:`         | 1 hour   |
| `POST /screenshots` | `screenshot:`    | 24 hours |

Cache hits increment the corresponding OpenTelemetry counter metric (`liteparse.parse.cache_hits`, `liteparse.screenshot.cache_hits`) and set a `cache.hit` span attribute (`"true"` / `"false"`) on the active trace span — both visible in Grafana and Jaeger respectively.

The cache shares the same Redis instance used for rate limiting and is configured via the same `REDIS_URI` and `REDIS_PASSWORD` environment variables.
