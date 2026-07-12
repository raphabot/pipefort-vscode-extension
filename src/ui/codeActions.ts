import * as vscode from "vscode";
import { FINDING_KEY, PipefortDiagnostic } from "./diagnostics";

const IGNORE_RE = /#\s*pipefort:\s*ignore(?:\[([^\]]*)\])?/i;

/**
 * Compute the replacement text for a line to add a `# pipefort: ignore[rule]`
 * suppression, merging into an existing bracket. Returns undefined when the
 * line already suppresses the rule (or suppresses everything with bare ignore).
 */
export function suppressionForLine(
  lineText: string,
  ruleId: string
): string | undefined {
  const m = lineText.match(IGNORE_RE);
  if (m) {
    if (m[1] === undefined) {
      // Bare `# pipefort: ignore` already suppresses everything.
      return undefined;
    }
    const ids = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.includes(ruleId)) {
      return undefined;
    }
    ids.push(ruleId);
    const rebuilt = lineText.replace(IGNORE_RE, `# pipefort: ignore[${ids.join(",")}]`);
    return rebuilt;
  }
  const trimmedEnd = lineText.replace(/\s+$/, "");
  return `${trimmedEnd}  # pipefort: ignore[${ruleId}]`;
}

export class PipefortCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const diags = context.diagnostics.filter(
      (d) => d.source === "pipefort"
    ) as PipefortDiagnostic[];
    if (diags.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const diag of diags) {
      const ruleId = ruleIdOf(diag);
      if (!ruleId) {
        continue; // SYSTEM findings (empty rule_id) get no quick fix.
      }
      const line = diag.range.start.line;
      if (line >= document.lineCount) {
        continue;
      }
      const lineText = document.lineAt(line).text;
      const replacement = suppressionForLine(lineText, ruleId);
      if (replacement === undefined) {
        continue;
      }
      const action = new vscode.CodeAction(
        `Suppress ${ruleId} with inline comment`,
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = [diag];
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, document.lineAt(line).range, replacement);
      action.edit = edit;
      actions.push(action);
    }

    // A single fix-all action for the file.
    const fixAll = new vscode.CodeAction(
      "Fix all auto-fixable issues in file",
      vscode.CodeActionKind.QuickFix
    );
    fixAll.command = {
      command: "pipefort.fixFile",
      title: "Fix all auto-fixable issues in file",
      arguments: [document.uri],
    };
    fixAll.diagnostics = diags;
    actions.push(fixAll);

    return actions;
  }
}

function ruleIdOf(diag: PipefortDiagnostic): string | undefined {
  const stashed = diag[FINDING_KEY]?.rule_id;
  if (stashed) {
    return stashed;
  }
  if (
    diag.code &&
    typeof diag.code === "object" &&
    "value" in diag.code &&
    typeof diag.code.value === "string" &&
    diag.code.value !== "system"
  ) {
    return diag.code.value;
  }
  return undefined;
}
