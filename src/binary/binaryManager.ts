import * as vscode from "vscode";
import * as fs from "fs";
import { readSettings } from "../settings";
import { log } from "../log";

/**
 * Resolves the pipefort executable.
 *
 * M1 scope: honor an explicit `pipefort.binaryPath` setting, otherwise fall
 * back to `pipefort` on the system PATH. Auto-download from GitHub Releases,
 * checksum verification, caching, and update handling arrive in M3.
 */
export class BinaryManager {
  private cached: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Clear memoized resolution (e.g. after a settings change). */
  reset(): void {
    this.cached = undefined;
  }

  async resolve(): Promise<string> {
    if (this.cached) {
      return this.cached;
    }
    const { binaryPath } = readSettings();
    if (binaryPath) {
      if (!fs.existsSync(binaryPath)) {
        throw new BinaryResolutionError(
          `pipefort.binaryPath points to a file that does not exist: ${binaryPath}`
        );
      }
      try {
        fs.accessSync(binaryPath, fs.constants.X_OK);
      } catch {
        throw new BinaryResolutionError(
          `pipefort.binaryPath is not executable: ${binaryPath}`
        );
      }
      log(`Using pipefort from setting: ${binaryPath}`);
      this.cached = binaryPath;
      return binaryPath;
    }

    // M1 fallback: rely on PATH. M3 replaces this with managed download.
    log("No pipefort.binaryPath set; falling back to 'pipefort' on PATH.");
    this.cached = "pipefort";
    return "pipefort";
  }

  /** M3: download/update the managed CLI. Placeholder for now. */
  async update(): Promise<void> {
    void this.context;
    throw new BinaryResolutionError(
      "Managed CLI download is not available yet. Set 'pipefort.binaryPath' to a pipefort binary."
    );
  }
}

export class BinaryResolutionError extends Error {}
