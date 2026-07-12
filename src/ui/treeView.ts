import * as vscode from "vscode";
import { PipefortFinding, ToxicCombo, AttackStage } from "../model/types";
import { ResultStore } from "../scan/resultStore";
import { findingRange } from "../model/parser";

const DOCS_BASE = "https://pipefort.com/docs/rules/";
const OUTSIDE = "(outside workspace)";

type Node =
  | { kind: "comboRoot"; count: number }
  | { kind: "combo"; combo: ToxicCombo }
  | { kind: "stage"; combo: ToxicCombo; stage: AttackStage }
  | { kind: "breakChain"; combo: ToxicCombo }
  | { kind: "folder"; label: string; uris: string[] }
  | { kind: "file"; uri: vscode.Uri; findings: PipefortFinding[] }
  | { kind: "finding"; uri: vscode.Uri; finding: PipefortFinding };

function severityIcon(severity: string): vscode.ThemeIcon {
  switch (severity) {
    case "HIGH":
      return new vscode.ThemeIcon(
        "error",
        new vscode.ThemeColor("problemsErrorIcon.foreground")
      );
    case "MEDIUM":
      return new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground")
      );
    case "LOW":
      return new vscode.ThemeIcon(
        "info",
        new vscode.ThemeColor("problemsInfoIcon.foreground")
      );
    default:
      return new vscode.ThemeIcon("circle-small");
  }
}

export class PipefortTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    Node | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private view: vscode.TreeView<Node> | undefined;
  private readonly sub: vscode.Disposable;

  constructor(private readonly store: ResultStore) {
    this.sub = store.onDidChange(() => this.refresh());
  }

  register(): vscode.TreeView<Node> {
    this.view = vscode.window.createTreeView("pipefort.findings", {
      treeDataProvider: this,
      showCollapseAll: true,
    });
    this.updateBadge();
    return this.view;
  }

  private refresh(): void {
    this._onDidChangeTreeData.fire();
    this.updateBadge();
  }

  private updateBadge(): void {
    if (!this.view) {
      return;
    }
    const total = this.store.totalFindings();
    this.view.badge =
      total > 0
        ? { value: total, tooltip: `${total} Pipefort finding${total === 1 ? "" : "s"}` }
        : undefined;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "comboRoot": {
        const item = new vscode.TreeItem(
          `⚠ Toxic Combinations (${node.count})`,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.contextValue = "comboRoot";
        return item;
      }
      case "combo": {
        const item = new vscode.TreeItem(
          node.combo.title,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.iconPath = new vscode.ThemeIcon(
          node.combo.severity === "CRITICAL" ? "flame" : "warning",
          new vscode.ThemeColor("problemsErrorIcon.foreground")
        );
        item.description = node.combo.severity;
        item.tooltip = new vscode.MarkdownString(
          `**${node.combo.title}**\n\n${node.combo.impact}`
        );
        item.contextValue = "combo";
        return item;
      }
      case "stage": {
        const item = new vscode.TreeItem(
          `${node.stage.order}. ${node.stage.title}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon("debug-stackframe-dot");
        item.tooltip = new vscode.MarkdownString(node.stage.description);
        if (node.stage.rule_id) {
          item.description = node.stage.rule_id;
        }
        return item;
      }
      case "breakChain": {
        const item = new vscode.TreeItem(
          `Break the chain: ${node.combo.break_chain}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon("shield");
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`${node.combo.break_chain}`);
        if (node.combo.break_chain_rule) {
          md.appendMarkdown(
            `\n\n[${node.combo.break_chain_rule}](${DOCS_BASE}${node.combo.break_chain_rule})`
          );
          md.isTrusted = true;
        }
        item.tooltip = md;
        return item;
      }
      case "folder": {
        const item = new vscode.TreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.iconPath = vscode.ThemeIcon.Folder;
        item.contextValue = "folder";
        return item;
      }
      case "file": {
        const item = new vscode.TreeItem(
          vscode.Uri.file(node.uri.fsPath),
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.label = vscode.workspace.asRelativePath(node.uri, false);
        item.iconPath = vscode.ThemeIcon.File;
        item.description = `${node.findings.length}`;
        item.resourceUri = node.uri;
        item.contextValue = "file";
        return item;
      }
      case "finding": {
        const f = node.finding;
        const item = new vscode.TreeItem(
          f.title,
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = severityIcon(f.severity);
        item.description = f.rule_id;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${f.title}**\n\n${f.description}`);
        if (f.recommendation) {
          md.appendMarkdown(`\n\n_${f.recommendation}_`);
        }
        if (f.rule_id) {
          md.appendMarkdown(`\n\n[${f.rule_id}](${DOCS_BASE}${f.rule_id})`);
          md.isTrusted = true;
        }
        item.tooltip = md;
        const range = findingRange(f);
        item.command = {
          command: "vscode.open",
          title: "Open Finding",
          arguments: [
            node.uri,
            { selection: range } as vscode.TextDocumentShowOptions,
          ],
        };
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return this.rootNodes();
    }
    switch (node.kind) {
      case "comboRoot":
        return this.store
          .getCombos()
          .map((combo) => ({ kind: "combo", combo }) as Node);
      case "combo": {
        const stages: Node[] = node.combo.stages.map((stage) => ({
          kind: "stage",
          combo: node.combo,
          stage,
        }));
        if (node.combo.break_chain) {
          stages.push({ kind: "breakChain", combo: node.combo });
        }
        return stages;
      }
      case "folder":
        return node.uris.map((key) => {
          const uri = vscode.Uri.parse(key);
          return {
            kind: "file",
            uri,
            findings: [...this.store.getFindings(uri)],
          } as Node;
        });
      case "file":
        return node.findings
          .slice()
          .sort((a, b) => a.line - b.line || a.column - b.column)
          .map((finding) => ({ kind: "finding", uri: node.uri, finding }) as Node);
      default:
        return [];
    }
  }

  private rootNodes(): Node[] {
    const nodes: Node[] = [];
    const combos = this.store.getCombos();
    if (combos.length > 0) {
      nodes.push({ kind: "comboRoot", count: combos.length });
    }

    const byUri = this.store.getFindingsByUri();
    const keys = [...byUri.keys()]
      .filter((k) => (byUri.get(k)?.length ?? 0) > 0)
      .sort();

    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length > 1) {
      // Partition by workspace folder.
      const groups = new Map<string, string[]>();
      for (const key of keys) {
        const uri = vscode.Uri.parse(key);
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        const label = folder ? folder.name : OUTSIDE;
        const list = groups.get(label) ?? [];
        list.push(key);
        groups.set(label, list);
      }
      for (const [label, uris] of groups) {
        nodes.push({ kind: "folder", label, uris });
      }
    } else {
      for (const key of keys) {
        const uri = vscode.Uri.parse(key);
        nodes.push({
          kind: "file",
          uri,
          findings: [...this.store.getFindings(uri)],
        });
      }
    }
    return nodes;
  }

  dispose(): void {
    this.sub.dispose();
    this.view?.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
