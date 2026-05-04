import { LiteParse, type LiteParseConfig } from "@llamaindex/liteparse";
import { SpanStatusCode } from "@opentelemetry/api";
import { PrefixedLogger } from "./logger";
import {
  tracer,
  parseDurationMs,
  parseFileSizeBytes,
  parsePagesCount,
  parseFilesTotal,
  parseErrorsTotal,
  batchFilesSubmitted,
  screenErrorsTotal,
  screenDurationMs,
  screenPagesCount,
  screenFilesTotal,
  screenFileSizeBytes,
} from "./telemetry";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

export const SCREENSHOT_MIMETYPE = "image/png";

export async function parse({
  file,
  text = false,
  config = undefined,
}: {
  file: Express.Multer.File;
  text?: boolean;
  config?: Partial<LiteParseConfig> | undefined;
}) {
  const logger = new PrefixedLogger("[parse]");
  const mode = text ? "text" : "pages";

  return tracer.startActiveSpan("parse", async (span) => {
    span.setAttributes({
      "file.name": file.originalname,
      "file.size": file.buffer.length,
      "file.mimetype": file.mimetype,
      "parse.mode": mode,
    });

    parseFileSizeBytes.record(file.buffer.length, { "parse.mode": mode });

    const lit = new LiteParse(config);
    logger.debug(
      `Starting to parse: ${file.originalname} (text = ${text ? "true" : "false"})`,
    );

    const startTime = performance.now();
    try {
      const result = await lit.parse(file.buffer, true);
      const duration = performance.now() - startTime;

      parseDurationMs.record(duration, { "parse.mode": mode });
      parsePagesCount.record(result.pages.length, { "parse.mode": mode });
      parseFilesTotal.add(1, { "parse.mode": mode });

      span.setAttributes({
        "parse.pages_count": result.pages.length,
        "parse.duration_ms": Math.round(duration),
      });

      logger.debug(
        `Finished parsing ${file.originalname} (text = ${text ? "true" : "false"})`,
      );
      span.end();

      if (text) {
        return result.text;
      } else {
        return result.pages;
      }
    } catch (err) {
      parseErrorsTotal.add(1, { "parse.mode": mode });
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      throw err;
    }
  });
}

async function parseWithName(
  lit: LiteParse,
  {
    input,
    name,
  }: {
    input: Buffer;
    name: string;
  },
) {
  const logger = new PrefixedLogger("[batchParse.parseWithName]");

  return tracer.startActiveSpan("parseFile", async (span) => {
    span.setAttributes({ "file.name": name, "file.size": input.length });

    parseFileSizeBytes.record(input.length);

    logger.debug(`Starting to parse ${name}`);
    const startTime = performance.now();
    try {
      const result = await lit.parse(input, true);
      const duration = performance.now() - startTime;

      parseDurationMs.record(duration);
      parsePagesCount.record(result.pages.length);
      parseFilesTotal.add(1);

      span.setAttributes({
        "parse.pages_count": result.pages.length,
        "parse.duration_ms": Math.round(duration),
      });

      logger.debug(`Finished parsing ${name}`);
      span.end();
      return { name, result };
    } catch (err) {
      logger.error(`An error occurred: ${err}`);
      parseErrorsTotal.add(1);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      throw err;
    }
  });
}

export async function batchParse({
  files,
  text = false,
  config = undefined,
}: {
  files: Express.Multer.File[];
  text?: boolean;
  config?: Partial<LiteParseConfig> | undefined;
}) {
  const logger = new PrefixedLogger("[batchParse]");
  const mode = text ? "text" : "pages";

  return tracer.startActiveSpan("batchParse", async (span) => {
    span.setAttributes({ "batch.size": files.length, "parse.mode": mode });

    batchFilesSubmitted.record(files.length, { "parse.mode": mode });

    const lit = new LiteParse(config);
    logger.debug(
      `Starting to parse ${files.length} file (text = ${text ? "true" : "false"})`,
    );

    const results: Awaited<ReturnType<typeof parseWithName>>[] = [];
    try {
      for (const f of files) {
        const result = await parseWithName(lit, {
          input: f.buffer,
          name: f.originalname,
        });
        results.push(result);
      }

      logger.debug(
        `Finished parsing ${files.length} file (text = ${text ? "true" : "false"})`,
      );
      span.end();

      if (text) {
        return results.map((r) => ({ file_name: r.name, text: r.result.text }));
      } else {
        return results.map((r) => ({
          file_name: r.name,
          pages: r.result.pages,
        }));
      }
    } catch (err) {
      logger.error(`An error occurred: ${err}`);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      throw err;
    }
  });
}

export async function screenshot({
  file,
  pageNumbers = undefined,
  config = undefined,
}: {
  file: Express.Multer.File;
  pageNumbers?: number[] | undefined;
  config?: Partial<LiteParseConfig> | undefined;
}) {
  const logger = new PrefixedLogger("[screenshot]");

  return tracer.startActiveSpan("screenshot", async (span) => {
    screenFileSizeBytes.record(file.size);
    span.setAttributes({
      "file.name": file.originalname,
      "file.size": file.buffer.length,
      "file.mimetype": file.mimetype,
      "file.pages_to_screenshot": pageNumbers
        ? pageNumbers.map((n) => n.toString()).join(",")
        : "all",
    });

    const lit = new LiteParse(config);
    logger.debug(`Starting to screenshot: ${file.originalname}`);

    const fileName = path.join(
      os.tmpdir(),
      `${randomUUID().toString()}.${path.extname(file.originalname)}`,
    );
    try {
      await writeFile(fileName, file.buffer);
      const startTime = performance.now();
      const result = await lit.screenshot(fileName, pageNumbers, true);
      const duration = performance.now() - startTime;

      screenDurationMs.record(duration);
      screenPagesCount.record(result.length);
      screenFilesTotal.add(1);

      span.setAttributes({
        "screenshot.pages_count": result.length,
        "screenshot.duration_ms": Math.round(duration),
      });

      logger.debug(
        `Finished screenshotting ${file.originalname} (pages = ${
          pageNumbers ? pageNumbers.map((n) => n.toString()).join(",") : "all"
        })`,
      );
      span.end();
      return result;
    } catch (err) {
      screenErrorsTotal.add(1);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      logger.error(`An error occurred: ${err}`);
      throw err;
    } finally {
      await unlink(fileName);
    }
  });
}
