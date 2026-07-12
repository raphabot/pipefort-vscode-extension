import { describe, it, expect } from "vitest";
import {
  assetName,
  osFor,
  archFor,
  isSupported,
  binaryName,
  currentTarget,
  UnsupportedPlatformError,
} from "../../src/binary/platform";

describe("platform mapping", () => {
  it("maps node platform → goreleaser os", () => {
    expect(osFor("darwin")).toBe("darwin");
    expect(osFor("linux")).toBe("linux");
    expect(osFor("win32")).toBe("windows");
    expect(osFor("freebsd" as any)).toBeUndefined();
  });

  it("maps node arch → goreleaser arch", () => {
    expect(archFor("x64")).toBe("amd64");
    expect(archFor("arm64")).toBe("arm64");
    expect(archFor("ia32")).toBeUndefined();
  });

  it("marks windows/arm64 unsupported", () => {
    expect(isSupported("windows", "arm64")).toBe(false);
    expect(isSupported("linux", "arm64")).toBe(true);
    expect(isSupported("darwin", "amd64")).toBe(true);
  });

  it("builds asset names without the leading v", () => {
    expect(assetName("v1.2.3", "darwin", "arm64")).toBe(
      "pipefort_1.2.3_darwin_arm64.tar.gz"
    );
    expect(assetName("1.2.3", "linux", "amd64")).toBe(
      "pipefort_1.2.3_linux_amd64.tar.gz"
    );
    expect(assetName("v0.5.0", "windows", "amd64")).toBe(
      "pipefort_0.5.0_windows_amd64.zip"
    );
  });

  it("names the extracted binary per-os", () => {
    expect(binaryName("linux")).toBe("pipefort");
    expect(binaryName("windows")).toBe("pipefort.exe");
  });

  it("resolves current target and rejects unsupported combos", () => {
    const t = currentTarget("linux", "x64");
    expect(t.os).toBe("linux");
    expect(t.assetName("v2.0.0")).toBe("pipefort_2.0.0_linux_amd64.tar.gz");
    expect(() => currentTarget("win32", "arm64")).toThrow(
      UnsupportedPlatformError
    );
    expect(() => currentTarget("sunos" as any, "x64")).toThrow(
      UnsupportedPlatformError
    );
  });
});
