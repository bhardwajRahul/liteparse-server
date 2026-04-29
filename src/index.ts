import express from "express";
import multer from "multer";
import { trace } from "@opentelemetry/api";
import { batchParse, parse, screenshot, SCREENSHOT_MIMETYPE } from "./utils";
import type { LiteParseConfig, ParsedPage } from "@llamaindex/liteparse";
import { PrefixedLogger } from "./logger";
import { getRLFactory } from "./rate-limit";
import {
  httpRequestsTotal,
  httpDurationMs,
  httpRateLimitedTotal,
} from "./telemetry";

const port = 5000;
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Record HTTP request duration and total count on every response.
app.use((req, res, next) => {
  const startTime = performance.now();
  res.on("finish", () => {
    const duration = performance.now() - startTime;
    const attrs = {
      "http.method": req.method,
      "http.route": req.route?.path ?? req.path,
      "http.status_code": res.statusCode,
    };
    httpDurationMs.record(duration, attrs);
    httpRequestsTotal.add(1, attrs);
  });
  next();
});

/*
This endpoint looks for the following fields in form data:
- 'file': containing file data
- 'config': serialized config for LiteParse
Moreover, it takes an optional `text` query parameter that
defines whether the response will be `text/plain` (containing only
parsed text) or `application/json` (the full parsed pages object)
*/
app.post("/parse", upload.single("file"), async (req, res) => {
  const logger = new PrefixedLogger("[POST /parse]");
  logger.info("Received request");
  const limiter = await getRLFactory().getLimiter();
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  try {
    await limiter.consume(ip);
  } catch (e) {
    httpRateLimitedTotal.add(1, { "http.route": "/parse" });
    logger.error(`Request has been rate limited due to ${e}`);
    res.status(429).send({ detail: "Too many requests" });
    return;
  }
  const fl = req.file;
  if (!fl) {
    logger.error("No `file` provided");
    res
      .status(400)
      .send({ detail: "You need to provide a file in the `file` field" });
    return;
  }
  const { text } = req.query;
  const config = req.body.config as string | undefined;
  let loadedConfig: Partial<LiteParseConfig> | undefined = undefined;
  if (config) {
    loadedConfig = JSON.parse(config);
  }
  const useText =
    text && !Array.isArray(text)
      ? text.toString().toLowerCase() === "true"
      : false;
  logger.debug(
    `text = ${useText ? "true" : "false"}; config = ${loadedConfig ? "set" : "unset"}`,
  );

  // Enrich the auto-instrumented HTTP span with file metadata.
  trace.getActiveSpan()?.setAttributes({
    "file.name": fl.originalname,
    "file.size": fl.buffer.length,
    "file.mimetype": fl.mimetype,
    "parse.mode": useText ? "text" : "pages",
  });

  if (useText) {
    const result = (await parse({
      file: fl,
      text: useText,
      config: loadedConfig,
    })) as string;
    res.header("Content-Type", "text/plain").status(200).send(result);
    logger.info("Completed request successfully");
    return;
  } else {
    const result = (await parse({
      file: fl,
      config: loadedConfig,
    })) as ParsedPage[];
    res
      .header("Content-Type", "application/json")
      .status(200)
      .send({ pages: result });
    logger.info("Completed request successfully");
    return;
  }
});

/*
This endpoint looks for the following fields in form data:
- 'files': containing data for multiple files
- 'config': serialized config for LiteParse
Moreover, it takes an optional `text` query parameter that
defines whether the response will contain parsed text or parsed pages objects.
*/
app.post("/batch/parse", upload.array("files"), async (req, res) => {
  const logger = new PrefixedLogger("[POST /batch/parse]");
  logger.info("Received request");
  const limiter = await getRLFactory().getLimiter();
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  try {
    await limiter.consume(ip);
  } catch (e) {
    httpRateLimitedTotal.add(1, { "http.route": "/batch/parse" });
    logger.error(`Request has been rate limited due to ${e}`);
    res.status(429).send({ detail: "Too many requests" });
    return;
  }
  if (!req.files) {
    logger.error("No `files` provided");
    res.status(400).send({
      detail: "You need to provide one or more files in the `files` field",
    });
    return;
  }
  let fls: Express.Multer.File[];
  if (!Array.isArray(req.files)) {
    if (!req.files["files"]) {
      logger.error(
        "Could not find any `files` field in the current formData setup",
      );
      res.status(400).send({
        detail:
          "Could not find any `files` field in the current formData setup",
      });
      return;
    }
    fls = req.files["files"];
  } else {
    fls = req.files;
  }
  const { text } = req.query;
  const config = req.body.config as string | undefined;
  let loadedConfig: Partial<LiteParseConfig> | undefined = undefined;
  if (config) {
    loadedConfig = JSON.parse(config);
  }
  const useText =
    text && !Array.isArray(text)
      ? text.toString().toLowerCase() === "true"
      : false;
  logger.debug(
    `text = ${useText ? "true" : "false"}; config = ${loadedConfig ? "set" : "unset"}`,
  );

  // Enrich the auto-instrumented HTTP span with batch metadata.
  trace.getActiveSpan()?.setAttributes({
    "batch.size": fls.length,
    "parse.mode": useText ? "text" : "pages",
  });

  if (useText) {
    const result = await batchParse({
      files: fls,
      text: useText,
      config: loadedConfig,
    });
    logger.info("Completed request successfully");
    return res
      .header("Content-Type", "application/json")
      .status(200)
      .send({ parsed: result });
  } else {
    const result = await batchParse({
      files: fls,
      config: loadedConfig,
    });
    logger.info("Completed request successfully");
    return res
      .header("Content-Type", "application/json")
      .status(200)
      .send({ parsed: result });
  }
});

/*
This endpoint looks for the following fields in form data:
- 'file': containing file data
- 'config': serialized config for LiteParse
Moreover, it takes an optional `pages` query parameter that
defines the pages to screenshot, and has to be a string containing
comma-separated numeric values (e.g.: '1,2,3,7,9')
*/
app.post("/screenshots", upload.single("file"), async (req, res) => {
  const logger = new PrefixedLogger("[POST /screenshots]");
  logger.info("Received request");
  const limiter = await getRLFactory().getLimiter();
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  try {
    await limiter.consume(ip);
  } catch (e) {
    httpRateLimitedTotal.add(1, { "http.route": "/batch/parse" });
    logger.error(`Request has been rate limited due to ${e}`);
    res.status(429).send({ detail: "Too many requests" });
    return;
  }
  const fl = req.file;
  if (!fl) {
    logger.error("No `file` provided");
    res
      .status(400)
      .send({ detail: "You need to provide a file in the `file` field" });
    return;
  }
  const { pages } = req.query;
  let loadedPages: string = "";
  if (!pages) {
    loadedPages = "";
  } else if (Array.isArray(pages)) {
    logger.warn("Multiple `pages` parameter values were set, joining them...");
    loadedPages = pages.map((p) => p.toString()).join(",");
  } else if (!Array.isArray(pages)) {
    loadedPages = pages.toString();
  }
  let toScreenshot: number[] | undefined;
  try {
    toScreenshot =
      loadedPages != ""
        ? loadedPages.split(",").map((p) => parseInt(p))
        : undefined;
  } catch (e) {
    logger.error(`An error occurred while parsing page parameter: ${e}`);
    res.status(400).send({
      detail: "`pages` should be a comma-separated string of numeric values",
    });
    return;
  }
  const config = req.body.config as string | undefined;
  let loadedConfig: Partial<LiteParseConfig> | undefined = undefined;
  if (config) {
    loadedConfig = JSON.parse(config);
  }
  const result = await screenshot({
    file: fl,
    config: loadedConfig,
    pageNumbers: toScreenshot,
  });
  res.setHeader("Content-Type", "application/x-ndjson");
  for (let i = 0; i < result.length; i++) {
    const { imageBuffer, pageNum, height, width } = result[i]!;
    const payload = {
      index: i,
      mimetype: SCREENSHOT_MIMETYPE,
      data: imageBuffer.toString("base64"),
      page_number: pageNum,
      height,
      width,
    };
    res.write(JSON.stringify(payload) + "\n");
  }

  res.end();
  logger.info(`Successfully sent ${result.length} screenshots as a response`);
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
