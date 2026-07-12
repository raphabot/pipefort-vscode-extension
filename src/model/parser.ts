import * as vscode from "vscode";
import {
  PipefortFinding,
  ScanOutput,
  ToxicCombo,
  FindingSeverity,
} from "./types";

/** Findings whose file is this sentinel are repo-level settings, not real files. */
export const REPO_SETTINGS_FILE = "<repository settings>";

/** Map a pipefort finding severity to a VS Code DiagnosticSeverity. */
export function toDiagnosticSeverity(
  severity: FindingSeverity | string
): vscode.DiagnosticSeverity {
  switch (severity) {
    case "HIGH":
      return vscode.DiagnosticSeverity.Error;
    case "MEDIUM":
      return vscode.DiagnosticSeverity.Warning;
    case "LOW":
      return vscode.DiagnosticSeverity.Information;
    case "INFO":
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

/**
 * Compute a Range for a finding. Lines/columns from the CLI are 1-based; 0 means
 * unknown. When the target document is open we extend the range to end-of-line
 * so the whole offending line is underlined.
 */
export function findingRange(
  finding: PipefortFinding,
  doc?: vscode.TextDocument
): vscode.Range {
  const line = Math.max(0, (finding.line || 1) - 1);
  const col = Math.max(0, (finding.column || 1) - 1);

  if (finding.line === 0) {
    // Unknown position — anchor at document start.
    return new vscode.Range(0, 0, 0, 1);
  }

  if (doc && line < doc.lineCount) {
    const endCol = doc.lineAt(line).range.end.character;
    return new vscode.Range(line, col, line, Math.max(col + 1, endCol));
  }
  return new vscode.Range(line, col, line, col + 1);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asFinding(raw: unknown): PipefortFinding | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  if (typeof raw.file !== "string") {
    return undefined;
  }
  return {
    file: raw.file,
    line: typeof raw.line === "number" ? raw.line : 0,
    column: typeof raw.column === "number" ? raw.column : 0,
    severity: (typeof raw.severity === "string"
      ? raw.severity
      : "INFO") as FindingSeverity,
    category: typeof raw.category === "string" ? raw.category : "",
    rule_id: typeof raw.rule_id === "string" ? raw.rule_id : "",
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    recommendation:
      typeof raw.recommendation === "string" ? raw.recommendation : "",
    confidence: raw.confidence as PipefortFinding["confidence"],
    fingerprint:
      typeof raw.fingerprint === "string" ? raw.fingerprint : undefined,
  };
}

function asCombo(raw: unknown): ToxicCombo | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  const components = Array.isArray(raw.components) ? raw.components : [];
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    title: typeof raw.title === "string" ? raw.title : "",
    severity: (raw.severity as ToxicCombo["severity"]) ?? "HIGH",
    scope: (raw.scope as ToxicCombo["scope"]) ?? "repo",
    file: typeof raw.file === "string" ? raw.file : "",
    impact: typeof raw.impact === "string" ? raw.impact : "",
    break_chain: typeof raw.break_chain === "string" ? raw.break_chain : "",
    break_chain_rule:
      typeof raw.break_chain_rule === "string" ? raw.break_chain_rule : "",
    stages: stages.map((s: any) => ({
      order: typeof s?.order === "number" ? s.order : 0,
      title: typeof s?.title === "string" ? s.title : "",
      description: typeof s?.description === "string" ? s.description : "",
      rule_id: typeof s?.rule_id === "string" ? s.rule_id : "",
    })),
    components: components
      .map((c: any) => {
        const f = asFinding(c?.finding);
        if (!f) {
          return undefined;
        }
        return {
          rule_id: typeof c?.rule_id === "string" ? c.rule_id : "",
          finding: f,
        };
      })
      .filter((c): c is ToxicCombo["components"][number] => c !== undefined),
  };
}

/**
 * Parse pipefort JSON stdout defensively. Throws on non-JSON input so callers
 * can keep previous results and log the failure.
 */
export function parseScanOutput(stdout: string): ScanOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { findings: [], toxic_combinations: [] };
  }
  const raw: unknown = JSON.parse(trimmed);
  if (!isObject(raw)) {
    return { findings: [], toxic_combinations: [] };
  }
  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .map(asFinding)
        .filter((f): f is PipefortFinding => f !== undefined)
    : [];
  const combos = Array.isArray(raw.toxic_combinations)
    ? raw.toxic_combinations
        .map(asCombo)
        .filter((c): c is ToxicCombo => c !== undefined)
    : [];
  return { findings, toxic_combinations: combos };
}
