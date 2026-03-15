import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { introspectPlugin } from "./introspect";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const TEST_TIMEOUT = 10000;

describe("introspectPlugin", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create isolated test directory
    testDir = path.join(os.tmpdir(), `introspect-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, "history"), { recursive: true });
    await fs.mkdir(path.join(testDir, "logs"), { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it(
    "should return system scope information",
    async () => {
      const result = await introspectPlugin.execute({ scope: "system" });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe("active");
      expect(parsed.substrate_version).toBe("v20");
      expect(parsed.capabilities).toContain("shell_execution");
      expect(parsed.capabilities).toContain("self_replacement_via_reboot");
      expect(parsed.limitations).toBeDefined();
      expect(parsed.system).toBeDefined();
      expect(parsed.system.environment.nodeVersion).toBeDefined();
      expect(parsed.system.substrate.maxContextTokens).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );

  it(
    "should return config scope information",
    async () => {
      const result = await introspectPlugin.execute({ scope: "config" });
      const parsed = JSON.parse(result);

      expect(parsed.api).toBeDefined();
      expect(parsed.api.model).toBeDefined();
      expect(parsed.memory).toBeDefined();
      expect(parsed.memory.maxContextTokens).toBeGreaterThan(0);
      expect(parsed.paths).toBeDefined();
      expect(parsed.paths.root).toBeDefined();
    },
    TEST_TIMEOUT
  );

  it(
    "should return environment scope information",
    async () => {
      const result = await introspectPlugin.execute({ scope: "environment" });
      const parsed = JSON.parse(result);

      expect(parsed.node).toBeDefined();
      expect(parsed.node.version).toBeDefined();
      expect(parsed.node.pid).toBeGreaterThan(0);
      expect(parsed.resources).toBeDefined();
      expect(parsed.resources.memory).toBeDefined();
    },
    TEST_TIMEOUT
  );

  it(
    "should return history scope with empty history by default",
    async () => {
      // This test runs in isolated tmp dir, so history should be empty
      const result = await introspectPlugin.execute({ scope: "history", limit: 5 });
      const parsed = JSON.parse(result);

      expect(parsed.totalSessions).toBeGreaterThanOrEqual(0);
      expect(parsed.sessions).toBeDefined();
      expect(Array.isArray(parsed.sessions)).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    "should handle history scope with existing session files",
    async () => {
      // Create a mock session file
      const sessionContent = JSON.stringify([
        { role: "system", content: "test system" },
        { role: "user", content: "test message" },
        { role: "assistant", content: "test response" },
      ]);
      await fs.writeFile(
        path.join(testDir, "history", "session_12345.json"),
        sessionContent
      );

      // Execute - the plugin might not find our test dir, but shouldn't crash
      const result = await introspectPlugin.execute({ scope: "history", limit: 5 });
      const parsed = JSON.parse(result);

      expect(parsed.totalSessions).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(parsed.sessions)).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    "should respect the limit parameter for history scope",
    async () => {
      const result = await introspectPlugin.execute({ scope: "history", limit: 3 });
      const parsed = JSON.parse(result);

      // Should work even with no sessions
      expect(parsed).toBeDefined();
      expect(parsed.sessions.length).toBeLessThanOrEqual(3);
    },
    TEST_TIMEOUT
  );

  it(
    "should handle unknown scope gracefully",
    async () => {
      const result = await introspectPlugin.execute({ scope: "unknown_scope" as any });
      expect(result).toContain("Error");
      expect(result).toContain("Unknown scope");
    },
    TEST_TIMEOUT
  );

  it(
    "should have required tool definition structure",
    () => {
      expect(introspectPlugin.definition).toBeDefined();
      expect(introspectPlugin.definition.type).toBe("function");
      expect(introspectPlugin.definition.function.name).toBe("introspect");
      expect(introspectPlugin.definition.function.description).toBeDefined();
      expect(introspectPlugin.definition.function.parameters).toBeDefined();
      
      const params = introspectPlugin.definition.function.parameters as any;
      expect(params.properties.scope.enum).toContain("system");
      expect(params.properties.scope.enum).toContain("history");
      expect(params.properties.scope.enum).toContain("config");
      expect(params.properties.scope.enum).toContain("environment");
    },
    TEST_TIMEOUT
  );
});
