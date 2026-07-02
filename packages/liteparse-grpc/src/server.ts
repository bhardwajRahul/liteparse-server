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

const IMAGE_MIMETYPE = "image/png";

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
      try {
        const lit = new LiteParse(toImplLiteParseConfig(call.request.config));
        const result = await lit.parse(call.request.file);
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
        callback(err as grpc.ServiceError);
      }
    })();
  },
  isComplex: (call, callback) => {
    (async () => {
      try {
        const lit = new LiteParse(toImplLiteParseConfig(call.request.config));
        const result = await lit.isComplex(call.request.file);
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
        callback(err as grpc.ServiceError);
      }
    })();
  },
  screenshot: (call, callback) => {
    (async () => {
      try {
        const lit = new LiteParse(toImplLiteParseConfig(call.request.config));
        const result = await lit.screenshot(call.request.file);
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
        callback(err as grpc.ServiceError);
      }
    })();
  },
};

const server = new grpc.Server();
server.addService(ParserServiceService, parseService);
server.bindAsync(
  "127.0.0.1:50051",
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`gRPC server listening on ${port}`);
  },
);
