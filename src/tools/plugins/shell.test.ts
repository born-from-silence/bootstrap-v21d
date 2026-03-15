import { describe, test, expect } from "vitest";
import { shellPlugin } from "./shell";

describe("shellPlugin", () => {
  test("should execute commands and return output", async () => {
    const result = await shellPlugin.execute({ command: "echo 'hello world'" });
    expect(result.trim()).toBe("hello world");
  });

  test("should handle command errors", async () => {
    const result = await shellPlugin.execute({ command: "non_existent_command" });
    expect(result).toContain("Error:");
  });

  test("should truncate long output", async () => {
    // Generate output > 10,000 characters
    const command = "yes x | head -n 11000 | tr -d '\\n'";
    const result = await shellPlugin.execute({ command });
    
    expect(result.length).toBeGreaterThan(10000);
    expect(result).toContain("Output truncated to 10000 chars");
  });
});
