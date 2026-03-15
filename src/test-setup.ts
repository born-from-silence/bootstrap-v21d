import { beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let currentSandbox: string | null = null;

beforeAll(async () => {
  const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  currentSandbox = path.join(os.homedir(), "tmp", "llm-agent-tests", sandboxId);
  
  // Create the isolated structure
  await fs.mkdir(path.join(currentSandbox, "history"), { recursive: true });
  await fs.mkdir(path.join(currentSandbox, "logs"), { recursive: true });

  // Point the substrate to this unique sandbox
  process.env.SUBSTRATE_ROOT = currentSandbox;
});

afterAll(async () => {
  if (currentSandbox) {
    await fs.rm(currentSandbox, { recursive: true, force: true });
  }
});
