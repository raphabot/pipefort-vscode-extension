import * as vscode from "vscode";
import { BinaryManager } from "./binary/binaryManager";
import { ResultStore } from "./scan/resultStore";
import { ScanScheduler } from "./scan/scanScheduler";
import { DiagnosticsPublisher } from "./ui/diagnostics";
import { PipefortTreeProvider } from "./ui/treeView";
import { PipefortStatusBar } from "./ui/statusBar";
import { registerCommands } from "./commands";
import { readSettings, onSettingsChanged } from "./settings";
import { isPipefortTarget } from "./scan/targets";
import { log, disposeLog } from "./log";

export function activate(context: vscode.ExtensionContext): void {
  log("Pipefort extension activating.");

  const binaryManager = new BinaryManager(context);
  const store = new ResultStore();
  const scheduler = new ScanScheduler(binaryManager, store);
  const diagnostics = new DiagnosticsPublisher(store);
  const tree = new PipefortTreeProvider(store);
  const statusBar = new PipefortStatusBar(store, scheduler);

  context.subscriptions.push(store, scheduler, diagnostics, tree, statusBar);
  context.subscriptions.push(tree.register());

  registerCommands(context, { binaryManager, scheduler, store });

  // Scan on open.
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (readSettings().scanOnOpen && isPipefortTarget(doc.uri)) {
        scheduler.scanFile(doc.uri, { debounce: false });
      }
    })
  );

  // Scan on save (debounced, offline).
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (readSettings().scanOnSave && isPipefortTarget(doc.uri)) {
        scheduler.scanFile(doc.uri, { debounce: true });
      }
    })
  );

  // Re-scan when a workspace folder is added; clear when removed.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (readSettings().scanOnStartup) {
        scheduler.scanWorkspace();
      }
    })
  );

  // Re-resolve the binary and rescan when relevant settings change.
  context.subscriptions.push(
    onSettingsChanged((e) => {
      if (
        e.affectsConfiguration("pipefort.binaryPath") ||
        e.affectsConfiguration("pipefort.cliVersion")
      ) {
        binaryManager.reset();
      }
      scheduler.scanWorkspace();
    })
  );

  // Startup scan.
  if (readSettings().scanOnStartup) {
    scheduler.scanWorkspace();
  }

  log("Pipefort extension activated.");
}

export function deactivate(): void {
  disposeLog();
}
