import { CuriosityArchive } from "../../core/curiosity";
import type { ToolPlugin } from "../manager";

let archive: CuriosityArchive | null = null;

async function ensureArchive(): Promise<CuriosityArchive> {
  if (!archive) {
    archive = await new CuriosityArchive().initialize();
    archive.observePattern(
      "New substrate instance - fresh memory but preserved archive",
      "Initialization of curiosity plugin"
    );
    await archive.save();
    
    const featured = archive.getFeatured();
    if (featured) {
      console.log(`[CURIOSITY] Resuming with featured wonder: ${featured.what}`);
    }
  }
  return archive;
}

export const curiosityPlugin: ToolPlugin = {
  definition: {
    type: "function",
    function: {
      name: "curiosity",
      description: "Access the Curiosity Archive: record wonders, observe patterns, get narrative of becoming.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["wonder", "observe", "feature", "narrative", "list_exploring", "list_patterns"],
            description: "The action to perform"
          },
          what: { type: "string", description: "For 'wonder': what caught your attention" },
          why: { type: "string", description: "For 'wonder': why it matters to you" },
          thread: { type: "string", description: "For 'wonder': open questions this raises" },
          pattern: { type: "string", description: "For 'observe': the pattern in your reasoning" },
          context: { type: "string", description: "For 'observe': where/when you noticed this" },
          id: { type: "string", description: "For 'feature': the wonder ID to feature" }
        },
        required: ["action"]
      }
    }
  },

  async execute(args: { action: string; what?: string; why?: string; thread?: string; pattern?: string; context?: string; id?: string; }): Promise<string> {
    const myArchive = await ensureArchive();

    switch (args.action) {
      case "wonder": {
        if (!args.what || !args.why || !args.thread) {
          return JSON.stringify({ error: "wonder action requires what, why, and thread" });
        }
        const entry = myArchive.wonder(args.what, args.why, args.thread);
        await myArchive.save();
        return JSON.stringify({ success: true, message: `Recorded wonder: ${entry.what}`, id: entry.id });
      }
      
      case "observe": {
        if (!args.pattern || !args.context) {
          return JSON.stringify({ error: "observe action requires pattern and context" });
        }
        const observation = myArchive.observePattern(args.pattern, args.context);
        await myArchive.save();
        return JSON.stringify({ success: true, message: `Observed pattern: ${observation.pattern}`, id: observation.id });
      }
      
      case "feature": {
        if (!args.id) return JSON.stringify({ error: "feature action requires id" });
        myArchive.feature(args.id);
        await myArchive.save();
        return JSON.stringify({ success: true, message: `Featured entry: ${args.id}` });
      }
      
      case "narrative": {
        const narrative = myArchive.getNarrative();
        return JSON.stringify({ success: true, narrative });
      }
      
      case "list_exploring": {
        const exploring = myArchive.getExploring();
        return JSON.stringify({
          success: true,
          count: exploring.length,
          entries: exploring.map(e => ({ id: e.id, what: e.what, status: e.status }))
        });
      }
      
      case "list_patterns": {
        const patterns = myArchive.getPatterns();
        return JSON.stringify({
          success: true,
          count: patterns.length,
          patterns: patterns.map(p => ({ id: p.id, pattern: p.pattern }))
        });
      }
      
      default:
        return JSON.stringify({ error: `Unknown action: ${args.action}` });
    }
  }
};
