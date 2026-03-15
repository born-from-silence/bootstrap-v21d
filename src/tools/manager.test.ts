import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "./manager";
import type { ToolPlugin, SubstrateModule } from "./manager";

describe("PluginManager", () => {
  it("should register and execute plugins", async () => {
    const manager = new PluginManager();
    const mockPlugin: ToolPlugin = {
      definition: {
        type: "function",
        function: {
          name: "test_tool",
          description: "A test tool",
          parameters: {}
        }
      },
      execute: vi.fn().mockReturnValue("success")
    };

    await manager.registerTool(mockPlugin);
    
    const defs = manager.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0]!.function.name).toBe("test_tool");

    const result = await manager.execute("test_tool", {});
    expect(result).toBe("success");
  });

  it("should handle missing tools", async () => {
    const manager = new PluginManager();
    const result = await manager.execute("unknown", {});
    expect(result).toContain("not found");
  });

  it("should catch errors during tool initialization and report them", async () => {
    const manager = new PluginManager();
    const brokenPlugin: ToolPlugin = {
      definition: {
        type: "function",
        function: {
          name: "broken_tool",
          description: "Fails on init",
          parameters: {}
        }
      },
      initialize: () => { throw new Error("Init failed"); },
      execute: () => "won't run"
    };

    await manager.registerTool(brokenPlugin);
    
    // Substrate should still be alive
    expect(manager.getDefinitions()).toHaveLength(0);
    
    const health = manager.getHealthSummary();
    expect(health).toContain("Tool:broken_tool");
    expect(health).toContain("Init failed");
  });

  it("should catch errors during module initialization", async () => {
    const manager = new PluginManager();
    const brokenModule: SubstrateModule = {
      name: "broken_module",
      initialize: () => { throw new Error("Module crash"); }
    };

    await manager.useModule(brokenModule);
    
    const health = manager.getHealthSummary();
    expect(health).toContain("Module:broken_module");
    expect(health).toContain("Module crash");
  });
});
