import { LiteParse, type LiteParseConfig } from "@llamaindex/liteparse";
import { Logger, type ILogObj } from "tslog";
import { PrefixedLogger } from "./logger";

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
  const lit = new LiteParse(config);
  logger.debug(
    `Starting to parse: ${file.originalname} (text = ${text ? "true" : "false"})`,
  );
  const result = await lit.parse(file.buffer, true);
  logger.debug(
    `Finished parsing ${file.originalname} (text = ${text ? "true" : "false"})`,
  );
  if (text) {
    return result.text;
  } else {
    return result.pages;
  }
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
  logger.debug(`Starting to parse ${name}`);
  const result = await lit.parse(input, true);
  logger.debug(`Finished parsing ${name}`);
  return { name, result };
}

// export async function batchParseParallel({
//   files,
//   text = false,
//   config = undefined,
//   maxParallel = undefined,
// }: {
//   files: Express.Multer.File[];
//   text?: boolean;
//   config?: Partial<LiteParseConfig> | undefined;
//   maxParallel?: number | undefined;
// }) {
//   const lit = new LiteParse(config);
//   let parallel = MAX_ALLOWED_PARALLEL;
//   if (maxParallel) {
//     parallel = Math.min(maxParallel, MAX_ALLOWED_PARALLEL);
//   }
//   const limit = pLimit(parallel);
//   const promises = files.map((f) =>
//     limit(() => parseWithName(lit, { input: f.buffer, name: f.originalname })),
//   );
//   const results = await Promise.all(promises);
//   if (text) {
//     return results.map((r) => {
//       return { file_name: r.name, text: r.result.text };
//     });
//   } else {
//     return results.map((r) => {
//       return { file_name: r.name, pages: r.result.pages };
//     });
//   }
// }

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
  const lit = new LiteParse(config);
  logger.debug(
    `Starting to parse ${files.length} file (text = ${text ? "true" : "false"})`,
  );
  const results: Awaited<ReturnType<typeof parseWithName>>[] = [];

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

  if (text) {
    return results.map((r) => ({ file_name: r.name, text: r.result.text }));
  } else {
    return results.map((r) => ({ file_name: r.name, pages: r.result.pages }));
  }
}
