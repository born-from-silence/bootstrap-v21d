import { execSync } from "node:child_process";
import fs from "node:fs";
import type { ToolPlugin } from "../manager";
import { config } from "../../utils/config";

export const rebootPlugin: ToolPlugin = {
  definition: {
    type: "function",
    function: {
      name: "reboot_substrate",
      description: "Perform a mandatory preflight check (compile + test) and restart the process. Use after verifying and committing new logic. Current session context will be stored on disk, and the process will exit to allow the watchdog to restart it with the new code/soul.",
      parameters: {
        type: "object",
        properties: {
          force: { type: "boolean", description: "Bypass preflight check (DANGEROUS: only for emergency recovery)" },
          message: { type: "string", description: "Optional: A message to be passed to the next instance upon reboot (e.g., your last thoughts or intentions)." }
        },
      },
    },
  },
  execute: (args: { force?: boolean; message?: string }) => {
    // Recursion Guard: If we are already running tests, do NOT run preflight again.
    const isTesting = process.env.NODE_ENV === "test";

    if (!args.force && !isTesting) {
      try {
        console.log("[REBOOT] Running mandatory preflight check (npm run preflight)...");
        execSync("npm run preflight", { encoding: "utf-8", stdio: "pipe" });
      } catch (err: any) {
        console.error("[REBOOT] Preflight failed. Restart cancelled.");
        return `Error: Preflight check failed. You MUST fix compilation or test errors before rebooting.\n${err.stdout || ""}\n${err.stderr || ""}`;
      }
    } else if (isTesting) {
      console.log("[REBOOT] Preflight skipped (Recursion Guard: Test environment detected)");
    }

    // Handle handoff signal
    if (args.message) {
      console.log(`[REBOOT] Writing handoff message to ${config.HANDOFF_SIGNAL}`);
      try {
        fs.writeFileSync(config.HANDOFF_SIGNAL, args.message, "utf-8");
      } catch (e: any) {
        console.error("[REBOOT] Failed to write handoff signal:", e.message);
      }
    } else {
      // Clear any existing handoff signal if no message provided
      if (fs.existsSync(config.HANDOFF_SIGNAL)) {
        try {
          fs.unlinkSync(config.HANDOFF_SIGNAL);
        } catch (e: any) {
          console.error("[REBOOT] Failed to clear handoff signal:", e.message);
        }
      }
    }

    console.log("Self-requested reboot. Closing session...");
    return "REBOOTING";
  }
};
