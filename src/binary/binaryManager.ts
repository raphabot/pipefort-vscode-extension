import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { readSettings } from "../settings";
import { resolveGitHubToken } from "../auth/tokens";
import { log } from "../log";
import { currentTarget, UnsupportedPlatformError } from "./platform";
import {
  fetchRelease,
  downloadRelease,
  Manifest,
  ChecksumError,
} from "./downloader";

export class BinaryResolutionError extends Error {}

interface CachedVersion {
  tag: string;
  dir: string;
  manifest: Manifest;
}

/**
 * Resolves the pipefort executable:
 *   explicit `binaryPath` setting > pinned cached tag > newest cached (latest,
 *   with background update check) > fresh download.
 */
export class BinaryManager {
  private cached: string | undefined;
  private updateChecked = false;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  /** Fires when a newer managed CLI is installed and a rescan is warranted. */
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  reset(): void {
    this.cached = undefined;
    this.updateChecked = false;
  }

  private get binDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, "bin");
  }

  async resolve(): Promise<string> {
    if (this.cached) {
      return this.cached;
    }
    const settings = readSettings();

    if (settings.binaryPath) {
      this.cached = this.validateExplicit(settings.binaryPath);
      return this.cached;
    }

    // Fail fast on unsupported platforms before touching the cache.
    try {
      currentTarget();
    } catch (err) {
      if (err instanceof UnsupportedPlatformError) {
        throw new BinaryResolutionError(
          `${err.message} Set 'pipefort.binaryPath' to a pipefort binary.`
        );
      }
      throw err;
    }

    const pinned = settings.cliVersion !== "latest" ? settings.cliVersion : undefined;
    const versions = this.listCached();

    if (pinned) {
      const hit = versions.find((v) => v.tag === pinned);
      if (hit) {
        this.cached = hit.manifest.binaryPath;
        return this.cached;
      }
      const installed = await this.download(pinned);
      this.cached = installed.binaryPath;
      return this.cached;
    }

    // latest
    const newest = versions[0];
    if (newest) {
      this.cached = newest.manifest.binaryPath;
      // Check for a newer release in the background (once per session).
      void this.checkForUpdate(newest.tag);
      return this.cached;
    }

    // First-ever download runs under a progress notification.
    const installed = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pipefort: downloading CLI",
      },
      (progress) =>
        this.download("latest", (m) => progress.report({ message: m }))
    );
    this.cached = installed.binaryPath;
    return this.cached;
  }

  private validateExplicit(binaryPath: string): string {
    if (!fs.existsSync(binaryPath)) {
      throw new BinaryResolutionError(
        `pipefort.binaryPath does not exist: ${binaryPath}`
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
    return binaryPath;
  }

  /** List cached versions, newest first (by downloadedAt). */
  private listCached(): CachedVersion[] {
    const dir = this.binDir;
    if (!fs.existsSync(dir)) {
      return [];
    }
    const out: CachedVersion[] = [];
    for (const entry of fs.readdirSync(dir)) {
      const manifestPath = path.join(dir, entry, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      try {
        const manifest = JSON.parse(
          fs.readFileSync(manifestPath, "utf8")
        ) as Manifest;
        if (fs.existsSync(manifest.binaryPath)) {
          out.push({ tag: manifest.tag, dir: path.join(dir, entry), manifest });
        }
      } catch {
        // Ignore corrupt manifests.
      }
    }
    out.sort((a, b) =>
      b.manifest.downloadedAt.localeCompare(a.manifest.downloadedAt)
    );
    return out;
  }

  private async download(
    tag: string,
    onProgress?: (m: string) => void
  ): Promise<Manifest> {
    const target = currentTarget();
    const token = await resolveGitHubToken(false);
    const release = await fetchRelease(tag, token);
    const destDir = path.join(this.binDir, release.tag);
    const nowIso = new Date().toISOString();
    try {
      const { manifest } = await downloadRelease(
        target,
        release,
        destDir,
        token,
        nowIso,
        onProgress
      );
      this.gc(release.tag);
      return manifest;
    } catch (err) {
      // Never leave a partial/unverified install behind.
      fs.rmSync(destDir, { recursive: true, force: true });
      if (err instanceof ChecksumError) {
        throw new BinaryResolutionError(
          `Refusing to install pipefort: ${err.message}`
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new BinaryResolutionError(`Failed to download pipefort: ${msg}`);
    }
  }

  /** Keep the current + previous version; delete older cache dirs. */
  private gc(currentTag: string): void {
    const versions = this.listCached();
    const keep = new Set<string>([currentTag]);
    for (const v of versions) {
      if (keep.size >= 2) {
        break;
      }
      keep.add(v.tag);
    }
    for (const v of versions) {
      if (!keep.has(v.tag)) {
        fs.rmSync(v.dir, { recursive: true, force: true });
        log(`gc: removed cached pipefort ${v.tag}`);
      }
    }
  }

  private async checkForUpdate(currentTag: string): Promise<void> {
    if (this.updateChecked) {
      return;
    }
    this.updateChecked = true;
    try {
      const token = await resolveGitHubToken(false);
      const release = await fetchRelease("latest", token);
      if (release.tag && release.tag !== currentTag) {
        log(`update available: ${currentTag} → ${release.tag}`);
        const manifest = await this.download(release.tag);
        const pick = await vscode.window.showInformationMessage(
          `Pipefort CLI updated to ${release.tag}. Rescan workspace?`,
          "Rescan"
        );
        this.cached = manifest.binaryPath;
        if (pick === "Rescan") {
          this._onDidUpdate.fire();
        }
      }
    } catch (err) {
      log(`update check failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Force download of the configured version (used by the Update CLI command). */
  async update(): Promise<void> {
    const settings = readSettings();
    if (settings.binaryPath) {
      throw new BinaryResolutionError(
        "pipefort.binaryPath is set; clear it to use the managed CLI."
      );
    }
    const tag = settings.cliVersion === "latest" ? "latest" : settings.cliVersion;
    const manifest = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pipefort: updating CLI",
      },
      (progress) => this.download(tag, (m) => progress.report({ message: m }))
    );
    this.cached = manifest.binaryPath;
    this._onDidUpdate.fire();
    void vscode.window.showInformationMessage(
      `Pipefort CLI is now ${manifest.tag}.`
    );
  }

  dispose(): void {
    this._onDidUpdate.dispose();
  }
}
