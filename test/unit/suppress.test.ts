import { describe, it, expect } from "vitest";
import { suppressionForLine } from "../../src/ui/codeActions";
import { parseChecksums } from "../../src/binary/downloader";

describe("suppressionForLine", () => {
  it("appends a new suppression comment", () => {
    expect(
      suppressionForLine("      - uses: actions/checkout@v4", "cicd-sec-3")
    ).toBe("      - uses: actions/checkout@v4  # pipefort: ignore[cicd-sec-3]");
  });

  it("merges into an existing bracket", () => {
    expect(
      suppressionForLine("  run: x  # pipefort: ignore[a]", "b")
    ).toBe("  run: x  # pipefort: ignore[a,b]");
  });

  it("no-ops when rule already suppressed", () => {
    expect(
      suppressionForLine("  run: x  # pipefort: ignore[a]", "a")
    ).toBeUndefined();
  });

  it("no-ops on a bare ignore", () => {
    expect(
      suppressionForLine("  run: x  # pipefort: ignore", "a")
    ).toBeUndefined();
  });

  it("trims trailing whitespace before appending", () => {
    expect(suppressionForLine("  run: x   ", "b1")).toBe(
      "  run: x  # pipefort: ignore[b1]"
    );
  });
});

describe("parseChecksums", () => {
  it("parses two-space and asterisk formats, ignores junk", () => {
    const map = parseChecksums(
      `${"a".repeat(64)}  file_a.tar.gz\n${"b".repeat(64)} *file_b.zip\n# comment\ngarbage line\n`
    );
    expect(map.get("file_a.tar.gz")).toBe("a".repeat(64));
    expect(map.get("file_b.zip")).toBe("b".repeat(64));
    expect(map.size).toBe(2);
  });
});
