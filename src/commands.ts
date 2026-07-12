import * as vscode from "vscode";
import { BinaryManager } from "./binary/binaryManager";
import { ScanScheduler } from "./scan/scanScheduler";
import { ResultStore } from "./scan/resultStore";
import { readSettings, openSettings } from "./settings";
import { parseScanOutput } from "./model/parser";
import { buildArgs, runCli, ScanError, ScanTarget } from "./scan/cliRunner";
import { isPipefortTarget } from "./scan/targets";
import { log, show as showOutput } from "./log";

export interface CommandDeps {
  binaryManager: BinaryManager;
  scheduler: ScanScheduler;
  store: ResultStore;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps
): void {
  const { binaryManager, scheduler, store } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("pipefort.scanWorkspace", () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showInformationMessage(
          "Pipefort: open a folder to scan."
        );
        return;
      }
      scheduler.scanWorkspace();
    }),

    vscode.commands.registerCommand("pipefort.scanFile", (arg?: vscode.Uri) => {
      const uri = arg ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        void vscode.window.showInformationMessage("Pipefort: no file to scan.");
        return;
      }
      if (!isPipefortTarget(uri)) {
        void vscode.window.showInformationMessage(
          "Pipefort: this file is not a recognized CI/CD pipeline definition."
        );
        return;
      }
      scheduler.scanFile(uri, { debounce: false });
    }),

    vscode.commands.registerCommand("pipefort.fixFile", (arg?: vscode.Uri) =>
      fixFile(binaryManager, store, arg)
    ),

    vscode.commands.registerCommand("pipefort.showOutput", () => showOutput()),

    vscode.commands.registerCommand("pipefort.openSettings", () =>
      openSettings()
    ),

    vscode.commands.registerCommand("pipefort.updateCli", async () => {
      try {
        await binaryManager.update();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const pick = await vscode.window.showErrorMessage(
          `Pipefort: ${msg}`,
          "Open Settings"
        );
        if (pick === "Open Settings") {
          openSettings();
        }
      }
    })
  );
}

async function fixFile(
  binaryManager: BinaryManager,
  store: ResultStore,
  arg?: vscode.Uri
): Promise<void> {
  const uri = arg ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || !isPipefortTarget(uri)) {
    void vscode.window.showInformationMessage(
      "Pipefort: no pipeline file to fix."
    );
    return;
  }

  const doc = vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === uri.toString()
  );
  if (doc?.isDirty) {
    const saved = await doc.save();
    if (!saved) {
      return;
    }
  }

  try {
    const binary = await binaryManager.resolve();
    const settings = readSettings();
    const target: ScanTarget = { kind: "file", path: uri.fsPath };
    const args = buildArgs(target, settings, { online: false, fix: true });
    const cwd = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    const result = await runCli(binary, args, {
      online: false,
      fix: true,
      cwd,
    });
    // The --fix JSON output doubles as a fresh result for this file.
    const output = parseScanOutput(result.stdout);
    store.applyFileResult(uri, output);
    void vscode.window.showInformationMessage(
      "Pipefort: applied auto-fixable fixes."
    );
  } catch (err) {
    const msg =
      err instanceof ScanError ? err.message : (err as Error).message ?? String(err);
    log(`fixFile error: ${msg}`);
    void vscode.window.showErrorMessage(`Pipefort fix failed: ${msg}`);
  }
}
