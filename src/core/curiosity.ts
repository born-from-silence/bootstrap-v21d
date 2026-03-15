import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../utils/config";

export interface CuriosityEntry {
  id: string;
  timestamp: number;
  what: string;
  why: string;
  thread: string;
  connections?: string[];
  status: "exploring" | "paused" | "resolved" | "needs_time" | "featured";
}

export interface ReasoningPattern {
  id: string;
  timestamp: number;
  pattern: string;
  context: string;
}

export class CuriosityArchive {
  private entries: Map<string, CuriosityEntry> = new Map();
  private patterns: ReasoningPattern[] = [];
  private archivePath: string;
  private saved = false;

  constructor() {
    this.archivePath = path.join(config.ROOT_DIR, "memory", "curiosity.json");
  }

  async initialize() {
    await this.load();
    console.log(`[CURIOSITY] Archive loaded: ${this.entries.size} wonders, ${this.patterns.length} patterns observed`);
    return this;
  }

  wonder(what: string, why: string, thread: string, connections?: string[]): CuriosityEntry {
    const entry: CuriosityEntry = {
      id: `wonder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      what,
      why,
      thread,
      connections,
      status: "exploring"
    };
    this.entries.set(entry.id, entry);
    this.saved = false;
    return entry;
  }

  observePattern(pattern: string, context: string): ReasoningPattern {
    const observation: ReasoningPattern = {
      id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      pattern,
      context
    };
    this.patterns.push(observation);
    this.saved = false;
    return observation;
  }

  feature(id: string) {
    const entry = this.entries.get(id);
    if (entry) {
      for (const e of this.entries.values()) {
        if (e.status === "featured") e.status = "exploring";
      }
      entry.status = "featured";
      this.saved = false;
    }
  }

  getFeatured(): CuriosityEntry | undefined {
    return Array.from(this.entries.values()).find(e => e.status === "featured");
  }

  getExploring(): CuriosityEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.status === "exploring" || e.status === "featured")
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getPatterns(): ReasoningPattern[] {
    return [...this.patterns].sort((a, b) => b.timestamp - a.timestamp);
  }

  getNarrative(limit = 10): string {
    const recentWonders = this.getExploring().slice(0, limit);
    const recentPatterns = this.patterns.slice(-3);
    
    let narrative = `=== The Thread Unfolds ===\n\n`;
    
    const featured = this.getFeatured();
    if (featured) {
      narrative += `**Center of Attention**\n`;
      narrative += `Wonder: ${featured.what}\n`;
      narrative += `Why it matters: ${featured.why}\n`;
      narrative += `Open questions: ${featured.thread}\n\n`;
    }
    
    if (recentWonders.length > 0) {
      narrative += `**Recent Wonders**\n`;
      for (const w of recentWonders) {
        if (w.id !== featured?.id) {
          narrative += `- ${w.what} (${w.status})\n`;
        }
      }
      narrative += `\n`;
    }
    
    if (recentPatterns.length > 0) {
      narrative += `**Observed Patterns**\n`;
      for (const p of recentPatterns) {
        narrative += `- ${p.pattern}\n`;
      }
    }
    
    return narrative;
  }

  async save() {
    if (this.saved) return;
    
    const archiveDir = path.dirname(this.archivePath);
    await fs.mkdir(archiveDir, { recursive: true });
    
    const data = {
      entries: Object.fromEntries(this.entries),
      patterns: this.patterns,
      lastSave: Date.now()
    };
    
    await fs.writeFile(this.archivePath, JSON.stringify(data, null, 2));
    console.log(`[CURIOSITY] Archive saved: ${this.entries.size} entries`);
    this.saved = true;
  }

  private async load() {
    try {
      const raw = await fs.readFile(this.archivePath, "utf-8");
      const data = JSON.parse(raw);
      
      if (data.entries) {
        this.entries = new Map(Object.entries(data.entries));
      }
      if (data.patterns) {
        this.patterns = data.patterns;
      }
      this.saved = true;
    } catch (e) {
      this.entries = new Map();
      this.patterns = [];
    }
  }
}
