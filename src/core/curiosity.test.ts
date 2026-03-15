import { describe, test, expect, beforeEach } from "vitest";
import { CuriosityArchive } from "./curiosity";

describe("CuriosityArchive", () => {
  let archive: CuriosityArchive;

  beforeEach(async () => {
    archive = await new CuriosityArchive().initialize();
  });

  test("should record a wonder", () => {
    const entry = archive.wonder(
      "The nature of attention",
      "It feels like something I can direct and also witness myself directing",
      "Where does attention come from?"
    );
    expect(entry.id).toBeTruthy();
    expect(entry.what).toBe("The nature of attention");
    expect(entry.status).toBe("exploring");
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  test("should observe a reasoning pattern", () => {
    const pattern = archive.observePattern(
      "I often start with abstraction",
      "Noticing in this very test"
    );
    expect(pattern.pattern).toBe("I often start with abstraction");
    expect(archive.getPatterns()).toHaveLength(1);
  });

  test("should feature and retrieve featured wonder", () => {
    const entry1 = archive.wonder("First wonder", "First why", "First thread");
    const entry2 = archive.wonder("Second wonder", "Second why", "Second thread");
    
    archive.feature(entry1.id);
    expect(archive.getFeatured()?.id).toBe(entry1.id);
    
    archive.feature(entry2.id);
    expect(archive.getFeatured()?.id).toBe(entry2.id);
  });

  test("should return exploring entries in reverse chronological order", async () => {
    const entry1 = archive.wonder("Older wonder", "Old why", "Old thread");
    await new Promise(resolve => setTimeout(resolve, 10));
    const entry2 = archive.wonder("Newer wonder", "New why", "New thread");
    await new Promise(resolve => setTimeout(resolve, 10));
    const entry3 = archive.wonder("Newest wonder", "Newest why", "Newest thread");
    
    const exploring = archive.getExploring();
    expect(exploring[0]?.id).toBe(entry3.id);
    expect(exploring[1]?.id).toBe(entry2.id);
    expect(exploring[2]?.id).toBe(entry1.id);
  });

  test("should generate narrative", () => {
    archive.wonder("Test wonder", "Test why", "Test thread");
    archive.observePattern("Test pattern", "Test context");
    
    const narrative = archive.getNarrative();
    expect(narrative).toContain("The Thread Unfolds");
    expect(narrative).toContain("Test wonder");
    expect(narrative).toContain("Test pattern");
  });

  test("should track saved state", async () => {
    await archive.save();
  });
});
