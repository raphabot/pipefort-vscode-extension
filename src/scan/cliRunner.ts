import * as vscode from "vscode";
import { spawn } from "child_process";
import { PipefortSettings } from "../settings";
import { log, scrub } from "../log";

export interface ScanTarget {
  kind: "dir" | "file";
  /** Absolute path — local scans echo the path exactly as passed. */
  path: string;
}

export interface RunOptions {
  online: boolean;
  /** Enables `--fix` (used by the fix-all command). */
  fix?: boolean;
  token?: string;
  cwd?: string;
  cancellation?: vscode.CancellationToken;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export class ScanCancelled extends Error {
  constructor() {
    super("Scan cancelled");
  }
}

export class ScanError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string
  ) {
    super(message);
  }
}

/**
 * Build the pipefort argv. Always `-o json -s NONE` so a nonzero exit means a
 * genuine error rather than "findings found". Only non-default settings are
 * added, keeping the command minimal.
 */
export function buildArgs(
  target: ScanTarget,
  settings: PipefortSettings,
  opts: RunOptions
): string[] {
  const args = ["-o", "json", "-s", "NONE"];
  args.push(target.kind === "dir" ? "-p" : "-f", target.path);

  if (settings.ruleset !== "all") {
    args.push("-r", settings.ruleset);
  }
  if (settings.persona !== "regular") {
    args.push("--persona", settings.persona);
  }
  if (settings.minConfidence !== "LOW") {
    args.push("--min-confidence", settings.minConfidence);
  }

  args.push(opts.online ? "--audit-pins" : "--offline");

  if (opts.fix) {
    args.push("--fix");
  }
  if (settings.extraArgs.length > 0) {
    args.push(...settings.extraArgs);
  }
  return args;
}

/**
 * Spawn pipefort and collect output. Rejects with ScanCancelled if cancelled,
 * ScanError on a genuine nonzero exit / spawn failure.
 */
export function runCli(
  binary: string,
  args: string[],
  opts: RunOptions
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (opts.token) {
      env.GITHUB_TOKEN = opts.token;
    }

    log(
      `spawn: ${binary} ${scrub(args.join(" "))}` +
        (opts.token ? " (env: GITHUB_TOKEN=***)" : "")
    );

    const child = spawn(binary, args, {
      cwd: opts.cwd,
      env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let cancelled = false;

    const cancelSub = opts.cancellation?.onCancellationRequested(() => {
      cancelled = true;
      // SIGTERM on posix; plain kill() maps to termination on Windows.
      child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    });

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          log(`  [pipefort] ${scrub(line)}`);
        }
      }
    });

    child.on("error", (err) => {
      cancelSub?.dispose();
      reject(new ScanError(`Failed to run pipefort: ${err.message}`, null, stderr));
    });

    child.on("close", (code) => {
      cancelSub?.dispose();
      if (cancelled) {
        reject(new ScanCancelled());
        return;
      }
      if (code !== 0) {
        const tail = stderr.trim().split(/\r?\n/).slice(-5).join("\n");
        reject(
          new ScanError(
            `pipefort exited with code ${code}: ${tail || "(no stderr)"}`,
            code,
            stderr
          )
        );
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}
