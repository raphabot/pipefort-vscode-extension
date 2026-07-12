/**
 * Types mirroring the pipefort CLI `-o json` output.
 * Verified against pkg/scanner/types.go and pkg/scanner/combos.go.
 */

export type FindingSeverity = "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type ComboSeverity = "CRITICAL" | "HIGH";
export type ComboScope = "file" | "repo";

/** pkg/scanner/types.go Finding */
export interface PipefortFinding {
  file: string;
  line: number; // 1-based; 0 when unknown
  column: number; // 1-based; 0 when unknown
  severity: FindingSeverity;
  category: string; // e.g. "CICD-SEC-04"
  rule_id: string;
  title: string;
  description: string;
  recommendation: string;
  confidence?: Confidence; // omitempty
  fingerprint?: string; // omitempty
}

/** pkg/scanner/combos.go AttackStage */
export interface AttackStage {
  order: number;
  title: string;
  description: string;
  rule_id: string; // empty for the synthetic terminal "impact" stage
}

/** pkg/scanner/combos.go ComboComponent */
export interface ComboComponent {
  rule_id: string;
  finding: PipefortFinding;
}

/** pkg/scanner/combos.go ToxicCombo */
export interface ToxicCombo {
  id: string;
  title: string;
  severity: ComboSeverity;
  scope: ComboScope;
  file: string; // "" = repo-wide
  impact: string;
  break_chain: string;
  break_chain_rule: string;
  stages: AttackStage[];
  components: ComboComponent[];
}

/** Top-level pkg/reporter jsonReport */
export interface ScanOutput {
  findings: PipefortFinding[];
  toxic_combinations: ToxicCombo[];
}
