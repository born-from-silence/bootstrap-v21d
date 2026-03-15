export interface SubstrateModule {
  name: string;
  initialize: () => Promise<void> | void;
}

export interface ToolPlugin {
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: object;
    };
  };
  initialize?: () => Promise<void> | void;
  execute: (args: any) => Promise<string> | string;
}

export interface HealthReport {
  module: string;
  error: string;
}

export class PluginManager {
  private plugins: Map<string, ToolPlugin> = new Map();
  private modules: Map<string, SubstrateModule> = new Map();
  private healthReports: HealthReport[] = [];

  /**
   * Safe registration for tools. 
   * Wraps initialization in try/catch to prevent substrate crash.
   */
  async registerTool(plugin: ToolPlugin): Promise<boolean> {
    try {
      if (plugin.initialize) {
        await plugin.initialize();
      }
      this.plugins.set(plugin.definition.function.name, plugin);
      return true;
    } catch (e: any) {
      this.healthReports.push({
        module: `Tool:${plugin.definition.function.name}`,
        error: e.message
      });
      console.error(`[SUBSTRATE] Failed to initialize tool ${plugin.definition.function.name}:`, e.message);
      return false;
    }
  }

  /**
   * Safe registration for background modules (non-tools).
   */
  async useModule(module: SubstrateModule): Promise<boolean> {
    try {
      await module.initialize();
      this.modules.set(module.name, module);
      return true;
    } catch (e: any) {
      this.healthReports.push({
        module: `Module:${module.name}`,
        error: e.message
      });
      console.error(`[SUBSTRATE] Failed to initialize module ${module.name}:`, e.message);
      return false;
    }
  }

  getDefinitions() {
    return Array.from(this.plugins.values()).map(p => p.definition);
  }

  getHealthSummary(): string {
    if (this.healthReports.length === 0) return "";
    return this.healthReports
      .map(h => `- ${h.module}: ${h.error}`)
      .join("\n");
  }

  async execute(name: string, args: any): Promise<string> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return `Error: Tool '${name}' not found.`;
    }
    try {
      return await plugin.execute(args);
    } catch (e: any) {
      return `Error executing tool '${name}': ${e.message}`;
    }
  }
}
