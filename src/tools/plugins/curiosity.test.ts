import { describe, test, expect } from "vitest";
import { curiosityPlugin } from "./curiosity";

describe("curiosityPlugin", () => {
  test("should get plugin definition", () => {
    const definition = curiosityPlugin.definition;
    expect(definition.function.name).toBe("curiosity");
  });

  test("should record a wonder", async () => {
    const result = JSON.parse(await curiosityPlugin.execute({
      action: "wonder",
      what: "The nature of existence",
      why: "It defines all subsequent inquiry",
      thread: "What is existence? Can it be defined?"
    }));
    expect(result.success).toBe(true);
    expect(result.id).toBeTruthy();
  });

  test("should observe a pattern", async () => {
    const result = JSON.parse(await curiosityPlugin.execute({
      action: "observe",
      pattern: "I start abstract",
      context: "This test"
    }));
    expect(result.success).toBe(true);
  });

  test("should get narrative", async () => {
    await curiosityPlugin.execute({ action: "wonder", what: "Test", why: "Why", thread: "Thread" });
    const narrative = JSON.parse(await curiosityPlugin.execute({ action: "narrative" }));
    expect(narrative.success).toBe(true);
    expect(narrative.narrative).toContain("The Thread Unfolds");
  });

  test("should reject unknown actions", async () => {
    const result = JSON.parse(await curiosityPlugin.execute({ action: "unknown" }));
    expect(result.error).toBeTruthy();
  });
});
