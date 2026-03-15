import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../utils/config";

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export class MemoryManager {
  private messages: Message[] = [];
  private sessionFile: string;
  private currentTokens: number = 0;
  private dirtyCount: number = 0;
  private readonly SAVE_INTERVAL = 1;

  constructor() {
    const timestamp = Date.now();
    this.sessionFile = path.join(config.HISTORY_DIR, `session_${timestamp}.json`);
  }

  getMessages(): Message[] {
    return this.messages;
  }

  async addMessage(msg: Message) {
    this.messages.push(msg);
    this.currentTokens += this.estimateTokens(JSON.stringify(msg));
    this.dirtyCount++;

    if (this.currentTokens > config.MAX_CONTEXT_TOKENS) {
      await this.save(); // Pruning required
      this.dirtyCount = 0;
    } else if (this.dirtyCount >= this.SAVE_INTERVAL) {
      await this.save();
      this.dirtyCount = 0;
    }
  }

  /**
   * Surgical Memory Rewind: Removes the last assistant message and everything after it.
   */
  async rewind() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg && msg.role === "assistant") {
        console.log(`[MEMORY] Rewinding: Removing corrupted assistant message at index ${i}`);
        this.messages.splice(i);
        break;
      }
    }
    // Re-calculate token count after rewind
    this.currentTokens = this.messages.reduce((sum, m) => sum + this.estimateTokens(JSON.stringify(m)), 0);
    await this.save();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async save() {
    if (this.messages.length === 0) return;

    const systemMessage = this.messages[0]!;
    let currentTokens = this.estimateTokens(JSON.stringify(systemMessage));
    const historyToKeep: Message[] = [];

    // Accumulate from end until limit
    for (let i = this.messages.length - 1; i > 0; i--) {
      const msg = this.messages[i];
      if (!msg) continue;
      const msgTokens = this.estimateTokens(JSON.stringify(msg));
      if (currentTokens + msgTokens > config.MAX_CONTEXT_TOKENS) break;
      historyToKeep.unshift(msg);
      currentTokens += msgTokens;
    }

    // C1: Repair pruning boundary to prevent orphaned tool messages
    while (historyToKeep.length > 0 && historyToKeep[0]!.role === "tool") {
      console.log("[MEMORY] Pruning boundary repair: dropping orphaned tool message");
      historyToKeep.shift();
    }

    const pruned = [systemMessage, ...historyToKeep];
    this.messages = pruned; // Update in-memory state
    this.currentTokens = currentTokens; // Update tracked token count
    await fs.writeFile(this.sessionFile, JSON.stringify(pruned, null, 2));
  }

  getSessionFile(): string {
    return this.sessionFile;
  }
}
