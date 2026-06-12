import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEml, parsedEmlToEmailMessage } from "../core/eml.js";
import { extractConserviceStatement, formatConserviceStatement } from "../skills/conservice/extract.js";

async function main(): Promise<void> {
  const fixturePath = path.resolve(process.cwd(), "fixtures/conservice-sample.eml");
  const raw = await readFile(fixturePath, "utf8");
  const parsed = parseEml(raw);
  const message = parsedEmlToEmailMessage(parsed);

  console.log("Fixture email:");
  console.log(`  From: ${message.from}`);
  console.log(`  Subject: ${message.subject}`);

  const extracted = extractConserviceStatement(message);
  if (!extracted) {
    console.error("Failed to extract Conservice statement from fixture");
    process.exit(1);
  }

  console.log("\nExtracted:");
  console.log(JSON.stringify(extracted, null, 2));
  console.log("\nNotification preview:");
  console.log(formatConserviceStatement(extracted));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
