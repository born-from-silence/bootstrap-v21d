import { Agent, setGlobalDispatcher } from "undici";
import { config } from "../utils/config";
import { MemoryManager } from "./memory";
import { PluginManager } from "../tools/manager";
import { sanitizeJsonString } from "../utils/sanitize";

export class ApiClient {
  private memory: MemoryManager;
  private tools: PluginManager;
  private undiciAgent: Agent;
  private stallCount: number = 0;
  private recentErrors: boolean[] = []; // Track last 10 results (true = error)

  constructor(memory: MemoryManager, tools: PluginManager) {
    this.memory = memory;
    this.tools = tools;
    this.undiciAgent = new Agent({
      headersTimeout: 10 * 60 * 1000,
      bodyTimeout: 10 * 60 * 1000,
      connectTimeout: 60 * 1000,
    });
    setGlobalDispatcher(this.undiciAgent);
  }

  async step(): Promise<boolean> {
    const MAX_RETRIES = 6;
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
      const controller = new AbortController();
      try {
        const messages = this.memory.getMessages();
        console.log(`
[Step ${messages.length}] Requesting ${config.MODEL}... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

        const response = await fetch(config.API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.API_KEY}` },
          body: JSON.stringify({
            model: config.MODEL,
            messages,
            tools: this.tools.getDefinitions(),
            stream: true,
            max_tokens: 16384,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API Error (${response.status}):`, errorText);

          if (response.status === 429) {
            console.log("Rate limit hit. Cooling down for 30s...");
            await new Promise(r => setTimeout(r, 30000));
            return true;
          }

          if (response.status === 400 || errorText.includes("litellm.BadRequestError") || errorText.includes("Nvidia_nimException")) {
            console.log("Catastrophic API error. Initiating Surgical Memory Rewind...");
            controller.abort(); // M1: Abort on catastrophic error
            
            // Track error for loop protection
            this.recentErrors.push(true);
            if (this.recentErrors.length > 10) this.recentErrors.shift();
            
            const errorCount = this.recentErrors.filter(e => e).length;
            if (errorCount >= 5) {
              console.error("FATAL: Persistent 400 Error Loop detected (5/10). Terminating session.");
              return false;
            }

            await this.memory.rewind();
            retryCount++;
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }

          controller.abort(); // M1: Abort on other non-ok status
          retryCount++;
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        // Reset error history on successful response
        this.recentErrors.push(false);
        if (this.recentErrors.length > 10) this.recentErrors.shift();

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let assistantMsg: any = { role: "assistant", content: "", reasoning_content: "", tool_calls: [] };
        let toolCallMap: Record<number, any> = {};
        let buffer = "";

        process.stdout.write("[THINKING]: ");
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            if (dataStr.trim() === "[DONE]") break;
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices[0].delta;
              if (delta.reasoning_content) {
                assistantMsg.reasoning_content += delta.reasoning_content;
                process.stdout.write(delta.reasoning_content);
              }
              if (delta.content) {
                if (assistantMsg.content === "") process.stdout.write("\n\n[RESPONSE]: ");
                assistantMsg.content += delta.content;
                process.stdout.write(delta.content);
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (!toolCallMap[tc.index]) {
                    toolCallMap[tc.index] = { id: tc.id, type: "function", function: { name: tc.function.name, arguments: "" } };
                  }
                  if (tc.function.arguments) toolCallMap[tc.index].function.arguments += tc.function.arguments;
                }
              }
            } catch (e) {}
          }
        }
        process.stdout.write("\n");
        assistantMsg.tool_calls = Object.values(toolCallMap);
        if (assistantMsg.tool_calls.length === 0) delete assistantMsg.tool_calls;

        // Validate and sanitize tool calls
        if (assistantMsg.tool_calls) {
          let responseValid = true;
          for (const tc of assistantMsg.tool_calls) {
            // M4: Reject empty arguments or incomplete JSON
            if (!tc.function?.arguments || tc.function.arguments.trim() === "") {
              console.error(`LLM produced empty arguments for tool ${tc.function?.name} — retrying request`);
              responseValid = false;
              break;
            }

            try {
              tc.function.arguments = JSON.stringify(JSON.parse(tc.function.arguments));
            } catch {
              const sanitized = sanitizeJsonString(tc.function.arguments);
              try {
                tc.function.arguments = JSON.stringify(JSON.parse(sanitized));
              } catch {
                console.error("LLM produced unparseable tool arguments — retrying request");
                responseValid = false;
                break;
              }
            }
          }

          if (!responseValid) {
            retryCount++;
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
        }

        // M5: Only add to memory if the entire response (including tool calls) was valid
        await this.memory.addMessage(assistantMsg);

        if (!assistantMsg.tool_calls) {
          this.stallCount++;
          console.log(`[STALL] No tool calls detected (#${this.stallCount})`);
          
          if (this.stallCount >= 12) {
            // H4: Neutral stall warning for v18 - giving more thinking space
            await this.memory.addMessage({ 
              role: "user", 
              content: `[SUBSTRATE MONITOR] You have produced ${this.stallCount} responses without a tool call. Please ensure you take a concrete substrate action if you intend to continue your current work.` 
            });
          }          
          // H1: Total limit increased to 16 for v18
          if (this.stallCount >= 16) {
            console.error("FATAL: Maximum stalls reached. Terminating to reset state.");
            return false;
          }
          
          return true;
        } else {
          this.stallCount = 0;
          for (const toolCall of assistantMsg.tool_calls) {
            const result = await this.tools.execute(toolCall.function.name, JSON.parse(toolCall.function.arguments));
            if (result === "REBOOTING") {
              return false; // Signal to stop the loop
            }
            
            // Strictly enforce string content for all tool results.
            // If the result is an object, JSON stringify it. Otherwise, cast to string.
            const content = typeof result === "string" ? result : JSON.stringify(result);
            
            await this.memory.addMessage({ 
              role: "tool", 
              tool_call_id: toolCall.id, 
              name: toolCall.function.name, 
              content 
            });
          }
        }
        return true;
      } catch (error: any) {
        controller.abort(); // M1: Abort on exception
        console.error("ApiClient Error:", error.message);
        retryCount++;
        await new Promise(r => setTimeout(r, 10000));
      }
    }
    return false; // Max retries
  }
}
