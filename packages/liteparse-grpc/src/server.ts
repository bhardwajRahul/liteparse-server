#!/usr/bin/env node

import LiteParse from "@llamaindex/liteparse";
import type { LiteParseConfig as ImplLiteParseConfig } from "@llamaindex/liteparse";
import type { OutputFormat as ImplOutputFormat } from "@llamaindex/liteparse";
import type { ImageMode as ImplImageMode } from "@llamaindex/liteparse";
import {
  type ParserServiceServer,
  LiteParseConfig,
  OutputFormat,
  ImageMode,
  ParserServiceService,
} from "./protogen/parser";
import * as grpc from "@grpc/grpc-js";
import pino from "pino";

const IMAGE_MIMETYPE = "image/png";

const isDev = process.env.NODE_ENV !== "production";
const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
      }
    : {}),
});

function toImplOutputFormat(outputFormat: OutputFormat): ImplOutputFormat {
  switch (outputFormat) {
    case OutputFormat.OUTPUT_FORMAT_JSON:
      return "json";
    case OutputFormat.OUTPUT_FORMAT_MARKDOWN:
      return "markdown";
    case OutputFormat.OUTPUT_FORMAT_TEXT:
      return "text";
    default:
      return "json";
  }
}

function toImplImageMode(imageMode: ImageMode): ImplImageMode {
  switch (imageMode) {
    case ImageMode.IMAGE_MODE_EMBED:
      return "embed";
    case ImageMode.IMAGE_MODE_PLACEHOLDER:
      return "placeholder";
    default:
      return "off";
  }
}

function toImplLiteParseConfig(
  conf: LiteParseConfig | undefined,
): ImplLiteParseConfig | undefined {
  if (conf) {
    return {
      extractLinks: conf.extractLinks,
      ocrEnabled: conf.ocrEnabled,
      ocrLanguage: conf.ocrLanguage,
      ocrServerHeaders: Object.fromEntries(
        conf.ocrServerHeaders.map((h) => [h.name, h.value]),
      ),
      ocrServerUrl: conf.ocrServerUrl,
      outputFormat: toImplOutputFormat(conf.outputFormat),
      password: conf.password,
      quiet: conf.quiet,
      dpi: conf.dpi,
      preserveVerySmallText: conf.preserveVerySmallText,
      targetPages: conf.targetPages,
      maxPages: conf.maxPages,
      tessdataPath: conf.tessdataPath,
      numWorkers: conf.numWorkers,
      imageMode: toImplImageMode(conf.imageMode),
      ocrFailureFatal: conf.ocrFailureFatal,
      ocrHedgeDelaysMs: conf.ocrHedgeDelaysMs,
      emitWordBoxes: conf.emitWordBoxes,
    };
  }
  return undefined;
}

const parseService: ParserServiceServer = {
  parse: (call, callback) => {
    (async () => {
      const log = logger.child({ rpc: "parse", peer: call.getPeer() });
      const start = Date.now();
      log.info({ fileBytes: call.request.file?.length ?? 0 }, "parse start");
      try {
        const lit = new LiteParse(toImplLiteParseConfig(call.request.config));
        const result = await lit.parse(call.request.file);
        log.info(
          {
            durationMs: Date.now() - start,
            pages: result.pages.length,
            textLength: result.text?.length ?? 0,
          },
          "parse ok",
        );
        callback(null, {
          text: result.text,
          pages: result.pages.map((p) => {
            return {
              pageNumber: p.pageNum,
              pageHeight: p.height,
              pageWidth: p.width,
              textItems: p.textItems.map((t) => {
                return {
                  text: t.text,
                  width: t.width,
                  height: t.height,
                  x: t.x,
                  y: t.y,
                };
              }),
            };
          }),
        });
      } catch (err) {
        log.error({ durationMs: Date.now() - start, err }, "parse failed");
        callback(err as grpc.ServiceError);
      }
    })();
  },
  isComplex: (call, callback) => {
    (async () => {
      const log = logger.child({ rpc: "isComplex", peer: call.getPeer() });
      const start = Date.now();
      log.info(
        { fileBytes: call.request.file?.length ?? 0 },
        "isComplex start",
      );
      try {
        const lit = new LiteParse(toImplLiteParseConfig(call.request.config));
        const result = await lit.isComplex(call.request.file);
        log.info(
          { durationMs: Date.now() - start, pages: result.length },
          "isComplex ok",
        );
        callback(null, {
          complexity: result.map((c) => {
            return {
              isGarbled: c.isGarbled,
              hasSubstantialImages: c.hasSubstantialImages,
              uncovertedVectorArea: c.uncoveredVectorArea,
              pageArea: c.pageArea,
              pageNumber: c.pageArea,
              fullPageImage: c.fullPageImage,
              textLength: c.textLength,
              textCoverage: c.textCoverage,
              largestImageCoverage: c.largestImageCoverage,
              imageBlockCount: c.imageBlockCount,
              needsOcr: c.needsOcr,
              reasons: c.reasons,
              imageCoverage: c.imageCoverage,
            };
          }),
        });
      } catch (err) {
        log.error({ durationMs: Date.now() - start, err }, "isComplex failed");
        callback(err as grpc.ServiceError);
      }
    })();
  },
  screenshot: (call, callback) => {
    (async () => {
      const log = logger.child({ rpc: "screenshot", peer: call.getPeer() });
      const start = Date.now();
      log.info(
        { fileBytes: call.request.file?.length ?? 0 },
        "screenshot start",
      );
      try {
        const lit = new LiteParse(toImplLiteParseConfig(call.request.config));
        const result = await lit.screenshot(call.request.file);
        log.info(
          { durationMs: Date.now() - start, pages: result.length },
          "screenshot ok",
        );
        callback(null, {
          screenshots: result.map((s) => {
            return {
              height: s.height,
              width: s.height,
              pageNumber: s.pageNum,
              imageBytes: s.imageBuffer,
              mimeType: IMAGE_MIMETYPE,
            };
          }),
        });
      } catch (err) {
        log.error({ durationMs: Date.now() - start, err }, "screenshot failed");
        callback(err as grpc.ServiceError);
      }
    })();
  },
};

const bindAddr = process.env.GRPC_BIND_ADDR ?? "127.0.0.1:50051";
const server = new grpc.Server();
server.addService(ParserServiceService, parseService);
server.bindAsync(
  bindAddr,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      logger.error({ err, bindAddr }, "failed to bind gRPC server");
      return;
    }
    logger.info({ port, bindAddr }, "gRPC server listening");
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.tryShutdown((err) => {
      if (err) logger.error({ err }, "shutdown error");
      process.exit(err ? 1 : 0);
    });
  });
}
