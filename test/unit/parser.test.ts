import { describe, it, expect } from "vitest";
import * as vscode from "vscode";
import {
  parseScanOutput,
  toDiagnosticSeverity,
  findingRange,
} from "../../src/model/parser";

const REAL_SAMPLE = JSON.stringify({
  findings: [
    {
      file: "/repo/.github/workflows/ci.yml",
      line: 3,
      column: 5,
      severity: "HIGH",
      category: "CICD-SEC-04",
      rule_id: "cicd-sec-4-ppe-shell-injection",
      title: "Shell injection",
      description: "desc",
      recommendation: "fix it",
    },
    {
      file: "/repo/.github/workflows/broken.yml",
      line: 1,
      column: 1,
      severity: "INFO",
      category: "SYSTEM",
      rule_id: "",
      title: "Parse error",
      description: "",
      recommendation: "",
    },
  ],
  toxic_combinations: [
    {
      id: "combo-1",
      title: "Silent Supply-Chain Tampering",
      severity: "CRITICAL",
      scope: "repo",
      file: "",
      impact: "bad",
      break_chain: "pin it",
      break_chain_rule: "cicd-sec-9-download-without-checksum",
      stages: [
        { order: 1, title: "Entry", description: "d", rule_id: "r1" },
        { order: 2, title: "Impact", description: "d", rule_id: "" },
      ],
      components: [
        {
          rule_id: "r1",
          finding: {
            file: "/repo/.github/workflows/ci.yml",
            line: 3,
            column: 5,
            severity: "HIGH",
            category: "c",
            rule_id: "r1",
            title: "t",
            description: "",
            recommendation: "",
          },
        },
      ],
    },
  ],
});

describe("parseScanOutput", () => {
  it("parses real-shaped output", () => {
    const out = parseScanOutput(REAL_SAMPLE);
    expect(out.findings).toHaveLength(2);
    expect(out.toxic_combinations).toHaveLength(1);
    expect(out.toxic_combinations[0].stages).toHaveLength(2);
    expect(out.toxic_combinations[0].components[0].finding.rule_id).toBe("r1");
  });

  it("returns empty on empty input", () => {
    expect(parseScanOutput("")).toEqual({
      findings: [],
      toxic_combinations: [],
    });
  });

  it("locates JSON after a --fix human line", () => {
    const out = parseScanOutput(
      'Successfully fixed 3 vulnerabilities in-place.\n{"findings":[],"toxic_combinations":[]}'
    );
    expect(out.findings).toHaveLength(0);
  });

  it("throws on non-JSON so callers keep previous results", () => {
    expect(() => parseScanOutput("total garbage")).toThrow();
  });

  it("defaults missing arrays", () => {
    expect(parseScanOutput("{}")).toEqual({
      findings: [],
      toxic_combinations: [],
    });
  });

  it("drops malformed findings without a file", () => {
    const out = parseScanOutput('{"findings":[{"line":1},{"file":"/a.yml"}]}');
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].file).toBe("/a.yml");
  });
});

describe("toDiagnosticSeverity", () => {
  it("maps severities", () => {
    expect(toDiagnosticSeverity("HIGH")).toBe(vscode.DiagnosticSeverity.Error);
    expect(toDiagnosticSeverity("MEDIUM")).toBe(
      vscode.DiagnosticSeverity.Warning
    );
    expect(toDiagnosticSeverity("LOW")).toBe(
      vscode.DiagnosticSeverity.Information
    );
    expect(toDiagnosticSeverity("INFO")).toBe(vscode.DiagnosticSeverity.Hint);
    expect(toDiagnosticSeverity("WHATEVER")).toBe(
      vscode.DiagnosticSeverity.Hint
    );
  });
});

describe("findingRange", () => {
  it("converts 1-based to 0-based", () => {
    const r = findingRange({ line: 3, column: 5 } as any);
    expect(r.start.line).toBe(2);
    expect(r.start.character).toBe(4);
  });

  it("anchors line 0 to document start", () => {
    const r = findingRange({ line: 0, column: 0 } as any);
    expect(r.start.line).toBe(0);
    expect(r.end.character).toBe(1);
  });
});
