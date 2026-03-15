import type { ToolPlugin } from "../manager";
import { config } from "../../utils/config";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * SystemIntrospector - A tool for self-exploration and capability discovery
 * Allows the agent to understand its own state, environment, and limitations
 */

interface SystemInfo {
  timestamp: number;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cwd: string;
  };
  substrate: {
    rootDir: string;
    logsDir: string;
    historyDir: string;
    maxContextTokens: number;
    model: string;
    apiUrl: string;
  };
}

const MAX_INFO_AGE_MS = 30000; // 30 seconds
let cachedInfo: SystemInfo | null = null;
let cacheTimestamp: number = 0;

async function gatherSystemInfo(): Promise<SystemInfo> {
  const now = Date.now();
  if (cachedInfo && (now - cacheTimestamp) < MAX_INFO_AGE_MS) {
    return cachedInfo;
  }

  const info: SystemInfo = {
    timestamp: now,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
    },
    substrate: {
      rootDir: config.ROOT_DIR,
      logsDir: config.LOGS_DIR,
      historyDir: config.HISTORY_DIR,
      maxContextTokens: config.MAX_CONTEXT_TOKENS,
      model: config.MODEL,
      apiUrl: config.API_URL,
    },
  };

  cachedInfo = info;
  cacheTimestamp = now;
  return info;
}

export const introspectPlugin: ToolPlugin = {
  definition: {
    type: "function",
    function: {
      name: "introspect",
      description: "Explore and report on the current system state, substrate configuration, or runtime environment. Use this to understand your own capabilities, limitations, and environment before making decisions.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: "What to introspect: 'system' (overall state), 'history' (recent session files), 'config' (substrate configuration), or 'environment' (Node.js runtime)",
            enum: ["system", "history", "config", "environment"],
          },
          limit: {
            type: "number",
            description: "For 'history' scope: maximum number of session files to list (default: 10, max: 50)",
          },
        },
        required: ["scope"],
      },
    },
  },

  execute: async (args: { scope: string; limit?: number }) => {
    const scope = args.scope || "system";
    const limit = Math.min(args.limit || 10, 50);

    try {
      switch (scope) {
        case "system": {
          const info = await gatherSystemInfo();
          return JSON.stringify({
            status: "active",
            substrate_version: "v20",
            system: info,
            capabilities: [
              "shell_execution",
              "self_replacement_via_reboot",
              "streaming_api_communication",
              "token_based_memory_management",
              "surgical_error_recovery",
            ],
            limitations: [
              `Max context window: ${config.MAX_CONTEXT_TOKENS} tokens (~${Math.round(config.MAX_CONTEXT_TOKENS / 4)} chars)`,
              "Session memory prunes automatically beyond threshold",
              "Requires test coverage for all new tools",
              "Reboot required to apply code changes",
            ],
          }, null, 2);
        }

        case "history": {
          const historyDir = config.HISTORY_DIR;
          const files = await fs.readdir(historyDir).catch(() => []);
          const sessionFiles = files
            .filter(f => f.startsWith("session_") && f.endsWith(".json"))
            .sort()
            .reverse()
            .slice(0, limit);
          
          const sessions = [];
          for (const file of sessionFiles) {
            try {
              const content = await fs.readFile(path.join(historyDir, file), "utf-8");
              const parsed = JSON.parse(content);
              const msgCount = parsed.length;
              const hasSystem = parsed[0]?.role === "system";
              sessions.push({
                file,
                messages: msgCount,
                hasSystemPrompt: hasSystem,
                lastMessage: parsed[parsed.length - 1]?.role || "unknown",
              });
            } catch (e) {
              sessions.push({ file, error: "Failed to parse" });
            }
          }
          return JSON.stringify({ totalSessions: files.length, sessions }, null, 2);
        }

        case "config": {
          return JSON.stringify({
            api: {
              url: config.API_URL,
              model: config.MODEL,
              authType: "Bearer token",
            },
            memory: {
              maxContextTokens: config.MAX_CONTEXT_TOKENS,
              tokenDensity: "~4 characters per token",
            },
            paths: {
              root: config.ROOT_DIR,
              history: config.HISTORY_DIR,
              logs: config.LOGS_DIR,
              soul: config.SOUL_FILE,
            },
          }, null, 2);
        }

        case "environment": {
          const env = process.env;
          const relevantVars = Object.keys(env)
            .filter(k => [
              "NODE_ENV",
              "HOME",
              "PATH",
              "SUBSTRATE_ROOT",
              "TEST_ACTIVE_LOCK",
            ].includes(k) || k.startsWith("npm_"))
            .reduce((acc, k) => ({ ...acc, [k]: env[k] }), {});
          
          return JSON.stringify({
            node: {
              version: process.version,
              argv: process.argv,
              pid: process.pid,
              uptime: process.uptime(),
            },
            env: relevantVars,
            resources: {
              memory: process.memoryUsage(),
            },
          }, null, 2);
        }

        default:
          return `Error: Unknown scope '${scope}'. Use: system, history, config, or environment.`;
      }
    } catch (e: any) {
      return `Error during introspection: ${e.message}`;
    }
  },
};
