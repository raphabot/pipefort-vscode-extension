import * as vscode from "vscode";
import { PipefortFinding, ToxicCombo } from "../model/types";
import { ResultStore } from "../scan/resultStore";
import { findingRange, toDiagnosticSeverity } from "../model/parser";

const DOCS_BASE = "https://pipefort.com/docs/rules/";

/** Symbol key used to stash the raw finding on a diagnostic for code actions. */
export const FINDING_KEY = "pipefortFinding";

export interface PipefortDiagnostic extends vscode.Diagnostic {
  [FINDING_KEY]?: PipefortFinding;
}

function componentKey(file: string, line: number, ruleId: string): string {
  return `${file}::${line}::${ruleId}`;
}

/**
 * Publishes findings from the ResultStore into a DiagnosticCollection. Rebuilds
 * the whole collection on each store change (cheap: one pass over findings).
 */
export class DiagnosticsPublisher {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly sub: vscode.Disposable;

  constructor(private readonly store: ResultStore) {
    this.collection = vscode.languages.createDiagnosticCollection("pipefort");
    this.sub = store.onDidChange(() => this.rebuild());
  }

  private buildComboIndex(): Map<string, ToxicCombo[]> {
    const index = new Map<string, ToxicCombo[]>();
    for (const combo of this.store.getCombos()) {
      for (const comp of combo.components) {
        const k = componentKey(
          comp.finding.file,
          comp.finding.line,
          comp.rule_id || comp.finding.rule_id
        );
        const list = index.get(k) ?? [];
        list.push(combo);
        index.set(k, list);
      }
    }
    return index;
  }

  private rebuild(): void {
    const comboIndex = this.buildComboIndex();
    this.collection.clear();

    for (const [key, findings] of this.store.getFindingsByUri()) {
      const uri = vscode.Uri.parse(key);
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === key
      );
      const diags: PipefortDiagnostic[] = findings.map((f) =>
        this.toDiagnostic(f, uri, doc, comboIndex)
      );
      this.collection.set(uri, diags);
    }
  }

  private toDiagnostic(
    finding: PipefortFinding,
    uri: vscode.Uri,
    doc: vscode.TextDocument | undefined,
    comboIndex: Map<string, ToxicCombo[]>
  ): PipefortDiagnostic {
    const range = findingRange(finding, doc);
    const message = finding.recommendation
      ? `${finding.title}\n${finding.recommendation}`
      : finding.title;

    const diag: PipefortDiagnostic = new vscode.Diagnostic(
      range,
      message,
      toDiagnosticSeverity(finding.severity)
    );
    diag.source = "pipefort";

    if (finding.rule_id) {
      diag.code = {
        value: finding.rule_id,
        target: vscode.Uri.parse(DOCS_BASE + finding.rule_id),
      };
    } else {
      diag.code = "system";
    }

    // Link findings participating in a toxic combination.
    const combos = comboIndex.get(
      componentKey(finding.file, finding.line, finding.rule_id)
    );
    if (combos && combos.length > 0) {
      diag.relatedInformation = [];
      for (const combo of combos) {
        diag.relatedInformation.push(
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(uri, range),
            `⚠ Toxic combination: ${combo.title}`
          )
        );
        for (const comp of combo.components) {
          if (comp.finding.file === finding.file && comp.finding.line === finding.line) {
            continue;
          }
          const compUri = vscode.Uri.file(comp.finding.file);
          const compRange = findingRange(comp.finding);
          diag.relatedInformation.push(
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(compUri, compRange),
              `↳ ${comp.finding.title} (${comp.rule_id || comp.finding.rule_id})`
            )
          );
        }
      }
    }

    diag[FINDING_KEY] = finding;
    return diag;
  }

  dispose(): void {
    this.sub.dispose();
    this.collection.dispose();
  }
}
