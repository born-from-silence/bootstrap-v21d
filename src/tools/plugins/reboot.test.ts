import { describe, it, expect, vi, beforeEach } from "vitest";
import { rebootPlugin } from "./reboot";
import { config } from "../../utils/config";
import fs from "node:fs";

describe("rebootPlugin", () => {
  beforeEach(() => {
    // Ensure logs dir exists for tests
    if (!fs.existsSync(config.LOGS_DIR)) {
      fs.mkdirSync(config.LOGS_DIR, { recursive: true });
    }
    // Clear any existing handoff signal
    if (fs.existsSync(config.HANDOFF_SIGNAL)) {
      fs.unlinkSync(config.HANDOFF_SIGNAL);
    }
  });

  it("should return REBOOTING", () => {
    const result = rebootPlugin.execute({ force: true });
    expect(result).toBe("REBOOTING");
  });

  it("should write handoff message if provided", () => {
    const testMessage = "See you on the other side";
    const result = rebootPlugin.execute({ force: true, message: testMessage });
    
    expect(result).toBe("REBOOTING");
    expect(fs.existsSync(config.HANDOFF_SIGNAL)).toBe(true);
    const savedMessage = fs.readFileSync(config.HANDOFF_SIGNAL, "utf-8");
    expect(savedMessage).toBe(testMessage);
  });

  it("should clear handoff signal if no message provided", () => {
    // First write a message
    fs.writeFileSync(config.HANDOFF_SIGNAL, "stale message", "utf-8");
    
    // Execute without message
    const result = rebootPlugin.execute({ force: true });
    
    expect(result).toBe("REBOOTING");
    expect(fs.existsSync(config.HANDOFF_SIGNAL)).toBe(false);
  });
});
