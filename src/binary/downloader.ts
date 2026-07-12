import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawn } from "child_process";
import { URL } from "url";
import { PlatformTarget } from "./platform";
import { log } from "../log";

const USER_AGENT = "pipefort-vscode-extension";
const API_BASE = "https://api.github.com/repos/raphabot/pipefort/releases";

export interface ReleaseAsset {
  name: string;
  url: string; // browser_download_url
}

export interface ReleaseInfo {
  tag: string;
  assets: ReleaseAsset[];
}

export interface Manifest {
  tag: string;
  asset: string;
  binaryPath: string;
  downloadedAt: string;
}

export class DownloadError extends Error {}
export class ChecksumError extends Error {}

function requestHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** GET a URL as a UTF-8 string, following redirects. Drops auth on host change. */
function httpsGetText(
  url: string,
  token: string | undefined,
  redirects = 5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      url,
      { headers: requestHeaders(token) },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) {
            reject(new DownloadError(`Too many redirects for ${url}`));
            return;
          }
          const next = new URL(res.headers.location, url);
          const keepToken = next.host === u.host ? token : undefined;
          resolve(httpsGetText(next.toString(), keepToken, redirects - 1));
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new DownloadError(`GET ${url} → HTTP ${status}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", (err) =>
      reject(new DownloadError(`GET ${url} failed: ${err.message}`))
    );
  });
}

/** Download a URL to a file, following redirects. Returns sha256 hex. */
function httpsDownload(
  url: string,
  dest: string,
  token: string | undefined,
  redirects = 5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = requestHeaders(token);
    headers.Accept = "application/octet-stream";
    const req = https.get(url, { headers }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) {
          reject(new DownloadError(`Too many redirects for ${url}`));
          return;
        }
        const next = new URL(res.headers.location, url);
        const keepToken = next.host === u.host ? token : undefined;
        resolve(httpsDownload(next.toString(), dest, keepToken, redirects - 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new DownloadError(`Download ${url} → HTTP ${status}`));
        return;
      }
      const hash = crypto.createHash("sha256");
      const out = fs.createWriteStream(dest);
      res.on("data", (chunk) => hash.update(chunk));
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(hash.digest("hex"))));
      out.on("error", (err) =>
        reject(new DownloadError(`Write ${dest} failed: ${err.message}`))
      );
    });
    req.on("error", (err) =>
      reject(new DownloadError(`Download ${url} failed: ${err.message}`))
    );
  });
}

interface RawRelease {
  tag_name?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

function toReleaseInfo(raw: RawRelease): ReleaseInfo {
  return {
    tag: raw.tag_name ?? "",
    assets: (raw.assets ?? [])
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({ name: a.name!, url: a.browser_download_url! })),
  };
}

export async function fetchRelease(
  tag: string,
  token?: string
): Promise<ReleaseInfo> {
  const url =
    tag === "latest" ? `${API_BASE}/latest` : `${API_BASE}/tags/${tag}`;
  const body = await httpsGetText(url, token);
  const raw = JSON.parse(body) as RawRelease;
  const info = toReleaseInfo(raw);
  if (!info.tag || info.assets.length === 0) {
    throw new DownloadError(`No release assets found for '${tag}'.`);
  }
  return info;
}

/** Parse a checksums.txt (`<sha256>  <filename>` lines) into name→hash. */
export function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m) {
      map.set(m[2].trim(), m[1].toLowerCase());
    }
  }
  return map;
}

function extractArchive(
  archivePath: string,
  destDir: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // System tar handles .tar.gz on posix and .zip on Windows 10+ (tar.exe).
    const child = spawn("tar", ["-xf", archivePath, "-C", destDir], {
      shell: false,
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) =>
      reject(new DownloadError(`Failed to run tar: ${err.message}`))
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new DownloadError(`tar exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function clearQuarantine(binaryPath: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  await new Promise<void>((resolve) => {
    const child = spawn("xattr", ["-d", "com.apple.quarantine", binaryPath], {
      shell: false,
    });
    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

export interface DownloadResult {
  binaryPath: string;
  manifest: Manifest;
}

/**
 * Download, verify, and extract the release asset for the current platform into
 * `destDir`, writing a manifest.json. Throws ChecksumError on hash mismatch
 * (never installs an unverified binary).
 */
export async function downloadRelease(
  target: PlatformTarget,
  release: ReleaseInfo,
  destDir: string,
  token: string | undefined,
  nowIso: string,
  onProgress?: (message: string) => void
): Promise<DownloadResult> {
  const wantName = target.assetName(release.tag);
  const asset = release.assets.find((a) => a.name === wantName);
  const checksums = release.assets.find((a) => a.name === "checksums.txt");
  if (!asset) {
    throw new DownloadError(
      `Release ${release.tag} has no asset named ${wantName}.`
    );
  }
  if (!checksums) {
    throw new DownloadError(`Release ${release.tag} has no checksums.txt.`);
  }

  fs.mkdirSync(destDir, { recursive: true });
  const archivePath = path.join(destDir, wantName);

  onProgress?.(`Downloading ${wantName}…`);
  log(`downloading ${wantName} from ${release.tag}`);
  const digest = await httpsDownload(asset.url, archivePath, token);

  onProgress?.("Verifying checksum…");
  const checksumText = await httpsGetText(checksums.url, token);
  const expected = parseChecksums(checksumText).get(wantName);
  if (!expected) {
    fs.rmSync(archivePath, { force: true });
    throw new ChecksumError(`checksums.txt has no entry for ${wantName}.`);
  }
  if (expected !== digest) {
    fs.rmSync(archivePath, { force: true });
    throw new ChecksumError(
      `Checksum mismatch for ${wantName}: expected ${expected}, got ${digest}.`
    );
  }

  onProgress?.("Extracting…");
  await extractArchive(archivePath, destDir);
  fs.rmSync(archivePath, { force: true });

  const binaryPath = path.join(destDir, target.binaryName);
  if (!fs.existsSync(binaryPath)) {
    throw new DownloadError(
      `Extracted archive did not contain ${target.binaryName}.`
    );
  }
  fs.chmodSync(binaryPath, 0o755);
  await clearQuarantine(binaryPath);

  const manifest: Manifest = {
    tag: release.tag,
    asset: wantName,
    binaryPath,
    downloadedAt: nowIso,
  };
  fs.writeFileSync(
    path.join(destDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  log(`installed pipefort ${release.tag} at ${binaryPath}`);
  return { binaryPath, manifest };
}
