/**
 * Pure mapping from Node's platform/arch to pipefort release asset names.
 * Verified against ../pipefort/.goreleaser.yaml:
 *   name_template: pipefort_{Version}_{Os}_{Arch}   (Version has no leading "v")
 *   formats: tar.gz, with zip override for windows
 *   goos: linux|darwin|windows, goarch: amd64|arm64, ignore windows/arm64
 */

export type Os = "linux" | "darwin" | "windows";
export type Arch = "amd64" | "arm64";

export function osFor(platform: NodeJS.Platform): Os | undefined {
  switch (platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "darwin";
    case "win32":
      return "windows";
    default:
      return undefined;
  }
}

export function archFor(arch: string): Arch | undefined {
  switch (arch) {
    case "x64":
      return "amd64";
    case "arm64":
      return "arm64";
    default:
      return undefined;
  }
}

export function isSupported(os: Os, arch: Arch): boolean {
  // goreleaser ignores windows/arm64.
  return !(os === "windows" && arch === "arm64");
}

/** Strip a leading "v" from a tag to get goreleaser's {{.Version}}. */
export function versionFromTag(tag: string): string {
  return tag.replace(/^v/, "");
}

export function archiveExt(os: Os): "zip" | "tar.gz" {
  return os === "windows" ? "zip" : "tar.gz";
}

export function binaryName(os: Os): string {
  return os === "windows" ? "pipefort.exe" : "pipefort";
}

/** Asset filename for a given tag (e.g. "v1.2.3") on an os/arch. */
export function assetName(tag: string, os: Os, arch: Arch): string {
  const ver = versionFromTag(tag);
  return `pipefort_${ver}_${os}_${arch}.${archiveExt(os)}`;
}

export interface PlatformTarget {
  os: Os;
  arch: Arch;
  assetName: (tag: string) => string;
  binaryName: string;
}

export class UnsupportedPlatformError extends Error {}

/** Resolve the current platform target, throwing on unsupported combos. */
export function currentTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): PlatformTarget {
  const os = osFor(platform);
  const a = archFor(arch);
  if (!os || !a) {
    throw new UnsupportedPlatformError(
      `Unsupported platform/arch: ${platform}/${arch}`
    );
  }
  if (!isSupported(os, a)) {
    throw new UnsupportedPlatformError(
      `pipefort has no release build for ${os}/${a}.`
    );
  }
  return {
    os,
    arch: a,
    assetName: (tag: string) => assetName(tag, os, a),
    binaryName: binaryName(os),
  };
}
