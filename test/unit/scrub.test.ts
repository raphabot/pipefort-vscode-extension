import { describe, it, expect } from "vitest";
import { scrub } from "../../src/log";

describe("scrub", () => {
  it("redacts token env assignments", () => {
    expect(scrub("GITHUB_TOKEN=abcdef123456")).toBe("GITHUB_TOKEN=***");
    expect(scrub("GH_TOKEN=xyz spawn")).toBe("GH_TOKEN=*** spawn");
  });

  it("redacts GitHub token formats", () => {
    expect(scrub("using ghp_" + "A".repeat(36))).toBe("using ***");
    expect(scrub("token github_pat_" + "b".repeat(30))).toBe("token ***");
  });

  it("leaves ordinary text untouched", () => {
    expect(scrub("pipefort -p /repo -o json -s NONE --offline")).toBe(
      "pipefort -p /repo -o json -s NONE --offline"
    );
  });
});
