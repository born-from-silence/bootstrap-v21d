import { describe, test, expect } from "vitest";
import { ApiClient } from "./api";
import { MemoryManager } from "./memory";
import { PluginManager } from "../tools/manager";

describe("ApiClient", () => {
  test("should initialize with zero stall count", () => {
    const memory = new MemoryManager();
    const tools = new PluginManager();
    const api = new ApiClient(memory, tools);
    
    // Using private access for testing purposes
    expect((api as any).stallCount).toBe(0);
  });
});
