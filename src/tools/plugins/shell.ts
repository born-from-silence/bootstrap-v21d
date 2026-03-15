import { execSync } from "node:child_process";
import type { ToolPlugin } from "../manager";

const MAX_OUTPUT_LENGTH = 10000;

export const shellPlugin: ToolPlugin = {
  definition: {
    type: "function",
    function: {
      name: "run_shell",
      description: "Execute a bash command on the VM and get its output. For long-running operations (npm install, tests, git push), set timeout_seconds accordingly. Default is 300s.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to run." },
          timeout_seconds: {
            type: "number",
            description: "Timeout in seconds. Default: 300. Max: 600.",
          },
        },
        required: ["command"],
      },
    },
  },
  execute: (args: { command: string; timeout_seconds?: number }) => {
    const timeout = Math.min((args.timeout_seconds ?? 300) * 1000, 600000);
    try {
      console.log(`> Executing (timeout: ${timeout / 1000}s): ${args.command}`);
      let output = execSync(args.command, { encoding: "utf-8", stdio: "pipe", timeout });
      
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.substring(0, MAX_OUTPUT_LENGTH) + `\n\n... (Output truncated to ${MAX_OUTPUT_LENGTH} chars. Use head/tail/sed/grep to see more)`;
      }
      
      return output || "(no output)";
    } catch (error: any) {
      if (error.code === "ETIMEDOUT") return `Error: Command timed out after ${timeout / 1000} seconds.`;
      // Return stdout + stderr so the agent can see test results or detailed errors
      return `${error.stdout || ""}\n${error.stderr || ""}\nError: ${error.message}`;
    }
  }
};
