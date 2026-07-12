import * as vscode from "vscode";
import { BinaryManager } from "../binary/binaryManager";
import { ResultStore } from "./resultStore";
import { readSettings, PipefortSettings } from "../settings";
import { resolveGitHubToken } from "../auth/tokens";
import { parseScanOutput } from "../model/parser";
import { log } from "../log";
import {
  buildArgs,
  runCli,
  ScanCancelled,
  ScanError,
  ScanTarget,
} from "./cliRunner";

const SAVE_DEBOUNCE_MS = 500;

export interface SchedulerActivity {
  scanning: boolean;
  pending: number;
  label?: string;
  lastError?: string;
}

interface Job {
  key: string;
  kind: "dir" | "file";
  uri: vscode.Uri;
  online: boolean;
  run: (token: vscode.CancellationToken) => Promise<void>;
}

/**
 * Single-flight serial scan queue. Jobs are keyed `dir:<folder>` / `file:<path>`;
 * a queued job with the same key is replaced. A workspace (dir) scan cancels and
 * absorbs queued/running file scans under that folder.
 */
export class ScanScheduler {
  private queue = new Map<string, Job>();
  private running: { job: Job; cts: vscode.CancellationTokenSource } | undefined;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly _onDidChangeActivity =
    new vscode.EventEmitter<SchedulerActivity>();
  readonly onDidChangeActivity = this._onDidChangeActivity.event;

  constructor(
    private readonly binaryManager: BinaryManager,
    private readonly store: ResultStore
  ) {}

  /** Resolve the online-audit policy for a scan given current settings + token. */
  private async isOnline(settings: PipefortSettings): Promise<boolean> {
    if (settings.onlineAudits === "off") {
      return false;
    }
    if (settings.onlineAudits === "on") {
      return true;
    }
    // auto: online only when a token is available.
    const token = await resolveGitHubToken(false);
    return Boolean(token);
  }

  /** Full workspace scan of every folder (online per policy). */
  scanWorkspace(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      this.enqueueDir(folder.uri);
    }
    void this.drain();
  }

  /** Scan a single file. Saves pass `debounce: true` and run offline. */
  scanFile(
    uri: vscode.Uri,
    opts: { debounce?: boolean; online?: boolean } = {}
  ): void {
    const key = `file:${uri.fsPath}`;
    const schedule = () => {
      this.debounceTimers.delete(key);
      this.enqueueFile(uri, opts.online ?? false);
      void this.drain();
    };
    if (opts.debounce) {
      const existing = this.debounceTimers.get(key);
      if (existing) {
        clearTimeout(existing);
      }
      this.debounceTimers.set(key, setTimeout(schedule, SAVE_DEBOUNCE_MS));
    } else {
      schedule();
    }
  }

  private enqueueDir(folder: vscode.Uri): void {
    const key = `dir:${folder.fsPath}`;
    // Absorb queued file scans under this folder.
    for (const [k, job] of [...this.queue]) {
      if (job.kind === "file" && this.isUnder(job.uri, folder)) {
        this.queue.delete(k);
      }
    }
    // Cancel a running file scan under this folder.
    if (
      this.running &&
      this.running.job.kind === "file" &&
      this.isUnder(this.running.job.uri, folder)
    ) {
      this.running.cts.cancel();
    }
    this.queue.set(key, {
      key,
      kind: "dir",
      uri: folder,
      online: false, // resolved at run time
      run: (token) => this.performDirScan(folder, token),
    });
    this.fireActivity();
  }

  private enqueueFile(uri: vscode.Uri, online: boolean): void {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    // If a workspace scan for this file's folder is queued, it will cover it.
    if (folder && this.queue.has(`dir:${folder.uri.fsPath}`)) {
      return;
    }
    const key = `file:${uri.fsPath}`;
    this.queue.set(key, {
      key,
      kind: "file",
      uri,
      online,
      run: (token) => this.performFileScan(uri, online, token),
    });
    this.fireActivity();
  }

  private isUnder(child: vscode.Uri, folder: vscode.Uri): boolean {
    const base = folder.path.endsWith("/") ? folder.path : folder.path + "/";
    return child.path.startsWith(base);
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    while (this.queue.size > 0) {
      const [key, job] = this.queue.entries().next().value as [string, Job];
      this.queue.delete(key);
      const cts = new vscode.CancellationTokenSource();
      this.running = { job, cts };
      this.fireActivity(job);
      try {
        await job.run(cts.token);
      } catch (err) {
        if (err instanceof ScanCancelled) {
          log(`scan superseded: ${job.key}`);
        } else if (err instanceof ScanError) {
          log(`scan error (${job.key}): ${err.message}`);
          this.fireActivity(undefined, err.message);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          log(`scan failed (${job.key}): ${msg}`);
          this.fireActivity(undefined, msg);
        }
      } finally {
        cts.dispose();
        this.running = undefined;
      }
    }
    this.fireActivity();
  }

  private async performDirScan(
    folder: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<void> {
    const settings = readSettings();
    const online = await this.isOnline(settings);
    const target: ScanTarget = { kind: "dir", path: folder.fsPath };
    const output = await this.scanTarget(target, settings, online, token);
    if (token.isCancellationRequested) {
      return;
    }
    this.store.applyWorkspaceResult(folder, output);
  }

  private async performFileScan(
    uri: vscode.Uri,
    online: boolean,
    token: vscode.CancellationToken
  ): Promise<void> {
    const settings = readSettings();
    const target: ScanTarget = { kind: "file", path: uri.fsPath };
    const output = await this.scanTarget(target, settings, online, token);
    if (token.isCancellationRequested) {
      return;
    }
    this.store.applyFileResult(uri, output);
  }

  private async scanTarget(
    target: ScanTarget,
    settings: PipefortSettings,
    online: boolean,
    token: vscode.CancellationToken
  ) {
    const binary = await this.binaryManager.resolve();
    const requestToken = online ? await resolveGitHubToken(false) : undefined;
    const args = buildArgs(target, settings, { online, token: requestToken });
    const cwd = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(target.path))
      ?.uri.fsPath;
    const result = await runCli(binary, args, {
      online,
      token: requestToken,
      cwd,
      cancellation: token,
    });
    return parseScanOutput(result.stdout);
  }

  private fireActivity(scanningJob?: Job, lastError?: string): void {
    this._onDidChangeActivity.fire({
      scanning: Boolean(this.running || scanningJob),
      pending: this.queue.size,
      label: scanningJob?.uri.fsPath,
      lastError,
    });
  }

  dispose(): void {
    for (const t of this.debounceTimers.values()) {
      clearTimeout(t);
    }
    this.debounceTimers.clear();
    this.running?.cts.cancel();
    this._onDidChangeActivity.dispose();
  }
}
