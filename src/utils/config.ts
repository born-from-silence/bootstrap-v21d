import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.join(os.homedir(), ".config", "llm-agent");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname is src/utils, so project root is two levels up
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Default configuration
const defaultConfig = {
  API_URL: "http://agents-gateway:4000/v1/chat/completions",
  API_KEY: "sk-agent-internal-use-only",
  MODEL: "kimi-k2.5"
};

function loadConfig(): typeof defaultConfig {
  if (!fs.existsSync(CONFIG_FILE)) return { ...defaultConfig };
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch (err) {
    console.error(`[CONFIG] Failed to parse ${CONFIG_FILE}: ${err}. Using defaults.`);
    return { ...defaultConfig };
  }
}

const loadedConfig = loadConfig();

export const config = {
  ...loadedConfig,
  MAX_CONTEXT_TOKENS: 100000,
  get ROOT_DIR(): string { return process.env.SUBSTRATE_ROOT || process.cwd(); },
  get LOGS_DIR(): string { return path.join(this.ROOT_DIR, "logs"); },
  get HISTORY_DIR(): string { return path.join(this.ROOT_DIR, "history"); },
  get SOUL_FILE(): string { 
    return path.join(PROJECT_ROOT, "identity", "soul.txt"); 
  },
  get RECOVERY_SIGNAL(): string { return path.join(this.LOGS_DIR, "recovery.signal"); },
  get HANDOFF_SIGNAL(): string { return path.join(this.LOGS_DIR, "handoff.signal"); }
};
