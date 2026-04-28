import express from "express";
import multer from "multer";
import { batchParse, parse } from "./utils";
import type { LiteParseConfig, ParsedPage } from "@llamaindex/liteparse";
import { PrefixedLogger } from "./logger";

const port = 5000;
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

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
  const fl = req.file;
  if (!fl) {
    logger.error("No `file` provided");
    res
      .status(400)
      .send({ detail: "You need to provide a file in the `file` field" });
    return;
  }
  const { text } = req.query;
  const config = req.body.config as Partial<LiteParseConfig> | undefined;
  const useText =
    text && !Array.isArray(text)
      ? text.toString().toLowerCase() === "true"
      : false;
  logger.debug(
    `text = ${useText ? "true" : "false"}; config = ${config ? "set" : "unset"}`,
  );
  if (useText) {
    const result = (await parse({
      file: fl,
      text: useText,
      config: config,
    })) as string;
    res.header("Content-Type", "text/plain").status(200).send(result);
    logger.info("Completed request successfully");
    return;
  } else {
    const result = (await parse({
      file: fl,
      config: config,
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
  const config = req.body.config as Partial<LiteParseConfig> | undefined;
  const useText =
    text && !Array.isArray(text)
      ? text.toString().toLowerCase() === "true"
      : false;
  logger.debug(
    `text = ${useText ? "true" : "false"}; config = ${config ? "set" : "unset"}`,
  );
  if (useText) {
    const result = await batchParse({
      files: fls,
      text: useText,
      config: config,
    });
    logger.info("Completed request successfully");
    return res
      .header("Content-Type", "application/json")
      .status(200)
      .send({ parsed: result });
  } else {
    const result = await batchParse({
      files: fls,
      config: config,
    });
    logger.info("Completed request successfully");
    return res
      .header("Content-Type", "application/json")
      .status(200)
      .send({ parsed: result });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
