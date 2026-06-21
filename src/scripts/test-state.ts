import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main(): Promise<void> {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sag-state-"));
  process.env.PROCESSED_MESSAGE_ID_LIMIT = "3";
  process.chdir(tempDir);

  try {
    const state = await import("../core/state.js");
    for (let index = 1; index <= 5; index += 1) {
      await state.markProcessed(`message-${index}`);
    }

    const count = await state.getProcessedMessageCount();
    const oldestPruned = await state.hasProcessed("message-1");
    const newestRetained = await state.hasProcessed("message-5");

    if (state.PROCESSED_MESSAGE_ID_LIMIT !== 3) {
      throw new Error(`Expected cap 3, got ${state.PROCESSED_MESSAGE_ID_LIMIT}`);
    }
    if (count !== 3) {
      throw new Error(`Expected 3 processed messages, got ${count}`);
    }
    if (oldestPruned) {
      throw new Error("Expected message-1 to be pruned");
    }
    if (!newestRetained) {
      throw new Error("Expected message-5 to be retained");
    }

    console.log("State smoke test passed: processed message IDs are capped to the most recent entries.");
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
