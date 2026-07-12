import * as vscode from "vscode";
import { ResultStore } from "../scan/resultStore";
import { ScanScheduler } from "../scan/scanScheduler";

/**
 * Status bar item reflecting scan state:
 *   - scanning:  $(sync~spin) Pipefort
 *   - error:     $(error) Pipefort  (tooltip has the message)
 *   - findings:  $(shield) Pipefort: N
 *   - clean:     $(shield) Pipefort
 */
export class PipefortStatusBar {
  private readonly item: vscode.StatusBarItem;
  private readonly subs: vscode.Disposable[] = [];
  private scanning = false;
  private lastError: string | undefined;

  constructor(
    private readonly store: ResultStore,
    scheduler: ScanScheduler
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = "pipefort.showOutput";
    this.subs.push(
      scheduler.onDidChangeActivity((a) => {
        this.scanning = a.scanning;
        if (a.lastError) {
          this.lastError = a.lastError;
        } else if (a.scanning) {
          this.lastError = undefined;
        }
        this.render();
      }),
      store.onDidChange(() => this.render())
    );
    this.render();
    this.item.show();
  }

  private render(): void {
    if (this.scanning) {
      this.item.text = "$(sync~spin) Pipefort";
      this.item.tooltip = "Pipefort: scanning…";
      this.item.backgroundColor = undefined;
      return;
    }
    if (this.lastError) {
      this.item.text = "$(error) Pipefort";
      this.item.tooltip = `Pipefort error: ${this.lastError}\nClick to open output.`;
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      return;
    }
    const total = this.store.totalFindings();
    this.item.backgroundColor = undefined;
    if (total > 0) {
      this.item.text = `$(shield) Pipefort: ${total}`;
      this.item.tooltip = `Pipefort: ${total} finding${
        total === 1 ? "" : "s"
      }\nClick to open output.`;
    } else {
      this.item.text = "$(shield) Pipefort";
      this.item.tooltip = "Pipefort: no findings\nClick to open output.";
    }
  }

  dispose(): void {
    for (const s of this.subs) {
      s.dispose();
    }
    this.item.dispose();
  }
}
