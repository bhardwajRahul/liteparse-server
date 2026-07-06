#!/usr/bin/env node

import {
  ImageMode,
  type LiteParseConfig,
  OutputFormat,
  ParserServiceClient,
} from "./protogen/parser";
import * as grpc from "@grpc/grpc-js";
import fs from "fs/promises";
import path from "path";

async function getBufAndConfig(
  file: string,
  configFile: string | undefined,
  parseOptions: { json?: boolean; markdown?: boolean },
) {
  const buf = await fs.readFile(file);
  const outputFormat = parseOptions.json
    ? OutputFormat.OUTPUT_FORMAT_JSON
    : parseOptions.markdown
      ? OutputFormat.OUTPUT_FORMAT_MARKDOWN
      : OutputFormat.OUTPUT_FORMAT_TEXT;
  let conf: LiteParseConfig = {
    ocrLanguage: "en",
    ocrEnabled: true,
    ocrServerUrl: undefined,
    ocrFailureFatal: false,
    ocrHedgeDelaysMs: [],
    ocrServerHeaders: [],
    maxPages: 500,
    dpi: 150,
    outputFormat,
    preserveVerySmallText: true,
    quiet: true,
    numWorkers: 4,
    imageMode: ImageMode.IMAGE_MODE_OFF,
    extractLinks: true,
    emitWordBoxes: false,
  };
  if (configFile) {
    const content = await fs.readFile(file, { encoding: "utf-8" });
    conf = JSON.parse(content);
  }
  return { buf, conf };
}

async function runClient(
  action: "parse" | "is-complex" | "screenshot",
  file: string,
  configFile: string | undefined,
  parseOptions: { json?: boolean; markdown?: boolean },
  screenshotOptions: { destDir?: string },
  port: number | undefined,
) {
  const client = new ParserServiceClient(
    `127.0.0.1:${port ?? 50051}`,
    grpc.credentials.createInsecure(),
  );

  switch (action) {
    case "parse": {
      const { buf, conf } = await getBufAndConfig(
        file,
        configFile,
        parseOptions,
      );
      client.parse({ config: conf, file: buf }, (err, response) => {
        if (err) {
          console.error(`An error occurred: ${err.message}`);
          return;
        }
        if (parseOptions.json) {
          console.log(JSON.stringify(response.pages, undefined, 2));
        } else {
          console.log(response.text);
        }
      });
      return;
    }
    case "is-complex": {
      const { buf, conf } = await getBufAndConfig(
        file,
        configFile,
        parseOptions,
      );
      client.isComplex({ config: conf, file: buf }, (err, response) => {
        if (err) {
          console.error(`An error occurred: ${err.message}`);
          return;
        }
        console.log(JSON.stringify(response.complexity, undefined, 2));
      });
      return;
    }
    case "screenshot": {
      const { buf, conf } = await getBufAndConfig(
        file,
        configFile,
        parseOptions,
      );
      client.screenshot({ config: conf, file: buf }, (err, response) => {
        if (err) {
          console.error(`An error occurred: ${err.message}`);
          return;
        }
        const destDir = screenshotOptions.destDir ?? "imgs/";
        fs.mkdir(destDir, { recursive: true }).then().catch(console.error);
        for (const s of response.screenshots) {
          const p = path.join(destDir, `page_${s.pageNumber}.png`);
          fs.writeFile(p, new Uint8Array(s.imageBytes))
            .then()
            .catch(console.error);
        }
      });
    }
  }
}

async function main() {
  const args = process.argv;
  const command = args[2];
  if (!command) {
    console.error("You need to provide a command");
    process.exit(1);
  }
  if (command == "--help") {
    console.log(`liteparse-client [COMMAND] [OPTIONS]

Commands:
  parse: Parse a file, optionally providing the path to a config file and whether to output JSON or plain text/markdown.
  is-complex: Estimate the complexity of a file and the need for OCR when parsing it
  screenshot: Screenshot the pages of a PDF file and save them as PNG images to a folder.

Shared options:
  FILE: File to parse/screenshot/estimate the complexity of. Positional argument, required.
  --config-file, -c <CONFIG_FILE>: JSON file where the LiteParse configuration is stored. Optional.
  --port, -p <PORT>: port which the gRPC server is bound to.

parse command options:
  --json, -j: Whether or not to output the parse result as a JSON array. Optional, defaults to false.
  --markdown, -m: Whether or not to render the parse text as markdown. Optional, defaults to false.

screenshot command options:
  --dest-dir, -d: Directory where to save the screenshots to. Optional, defaults to 'imgs/'.

Run liteparse-client --help to show this help message again.
`);
    return;
  }
  if (!["parse", "is-complex", "screenshot"].includes(command)) {
    console.error(`Unrecognized command: ${command}`);
    process.exit(1);
  }
  const file = args[3];
  if (!file) {
    console.error("You need to provide a file path");
    process.exit(1);
  }
  let configFile: string | undefined = undefined;
  let port: number | undefined = undefined;
  const parseOptions: { json?: boolean; markdown?: boolean } = {};
  const screenshotOptions: { destDir?: string } = {};
  let i = 4;
  for (const arg of args.slice(4)) {
    if (arg == "--config-file" || arg == "-c") {
      const cand = args[i + 1];
      if (!cand) {
        console.error(
          "invalid use of --config-file. It must be followed by a file path",
        );
        process.exit(1);
      }
      configFile = cand;
    } else if (arg == "--port" || arg == "-p") {
      const cand = args[i + 1];
      if (!cand) {
        console.error(
          "invalid use of --config-file. It must be followed by a file path",
        );
        process.exit(1);
      }
      port = parseInt(cand);
    } else if (arg == "--json" || arg == "-j") {
      parseOptions.json = true;
    } else if (arg == "--markdown" || arg == "-m") {
      parseOptions.markdown = true;
    } else if (arg == "--dest-dir" || arg == "-d") {
      const cand = args[i + 1];
      if (!cand) {
        console.error(
          "invalid use of --dest-dir/-d. It must be followed by a directory path",
        );
        process.exit(1);
      }
      screenshotOptions.destDir = cand;
    }
    i++;
  }

  await runClient(
    command as "is-complex" | "parse" | "screenshot",
    file,
    configFile,
    parseOptions,
    screenshotOptions,
    port,
  );
}

main().catch(console.error);
