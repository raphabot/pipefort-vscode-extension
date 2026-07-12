import * as vscode from "vscode";
import { PipefortFinding, ScanOutput, ToxicCombo } from "../model/types";
import { REPO_SETTINGS_FILE } from "../model/parser";

function folderKey(folder: vscode.Uri): string {
  return folder.toString();
}

function isUnder(child: vscode.Uri, folder: vscode.Uri): boolean {
  const base = folder.path.endsWith("/") ? folder.path : folder.path + "/";
  return child.path === folder.path || child.path.startsWith(base);
}

/**
 * Holds findings-per-URI and toxic combinations, with merge semantics:
 *  - a workspace scan replaces everything under a folder + that folder's combos
 *  - a file scan replaces only that file's findings and its file-scoped combos,
 *    leaving repo-scoped combos from the last workspace scan intact.
 *
 * Results are never blanked on scan error — callers simply skip the apply.
 */
export class ResultStore {
  private findingsByUri = new Map<string, PipefortFinding[]>();
  /** Combos grouped by the workspace folder that produced them. */
  private combosByFolder = new Map<string, ToxicCombo[]>();

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private static toUri(file: string): vscode.Uri | undefined {
    if (!file || file === REPO_SETTINGS_FILE) {
      return undefined;
    }
    return vscode.Uri.file(file);
  }

  private groupFindings(findings: PipefortFinding[]): Map<string, PipefortFinding[]> {
    const grouped = new Map<string, PipefortFinding[]>();
    for (const f of findings) {
      const uri = ResultStore.toUri(f.file);
      if (!uri) {
        continue;
      }
      const key = uri.toString();
      const list = grouped.get(key) ?? [];
      list.push(f);
      grouped.set(key, list);
    }
    return grouped;
  }

  applyWorkspaceResult(folder: vscode.Uri, output: ScanOutput): void {
    // Drop existing findings under this folder.
    for (const key of [...this.findingsByUri.keys()]) {
      if (isUnder(vscode.Uri.parse(key), folder)) {
        this.findingsByUri.delete(key);
      }
    }
    for (const [key, list] of this.groupFindings(output.findings)) {
      this.findingsByUri.set(key, list);
    }
    this.combosByFolder.set(folderKey(folder), output.toxic_combinations);
    this._onDidChange.fire();
  }

  applyFileResult(uri: vscode.Uri, output: ScanOutput): void {
    const key = uri.toString();
    const own = output.findings.filter((f) => {
      const u = ResultStore.toUri(f.file);
      return u?.toString() === key;
    });
    if (own.length > 0) {
      this.findingsByUri.set(key, own);
    } else {
      this.findingsByUri.delete(key);
    }

    // Replace file-scoped combos for this file; keep repo-scoped ones.
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      const fk = folderKey(folder.uri);
      const existing = this.combosByFolder.get(fk) ?? [];
      const kept = existing.filter(
        (c) => !(c.scope === "file" && c.file === uri.fsPath)
      );
      const fresh = output.toxic_combinations.filter(
        (c) => c.scope === "file" && c.file === uri.fsPath
      );
      this.combosByFolder.set(fk, [...kept, ...fresh]);
    }
    this._onDidChange.fire();
  }

  /** Clear everything (e.g. on binary reset). */
  clear(): void {
    this.findingsByUri.clear();
    this.combosByFolder.clear();
    this._onDidChange.fire();
  }

  getFindingsByUri(): ReadonlyMap<string, PipefortFinding[]> {
    return this.findingsByUri;
  }

  getFindings(uri: vscode.Uri): readonly PipefortFinding[] {
    return this.findingsByUri.get(uri.toString()) ?? [];
  }

  getCombos(): ToxicCombo[] {
    return [...this.combosByFolder.values()].flat();
  }

  getCombosByFolder(): ReadonlyMap<string, ToxicCombo[]> {
    return this.combosByFolder;
  }

  totalFindings(): number {
    let n = 0;
    for (const list of this.findingsByUri.values()) {
      n += list.length;
    }
    return n;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
