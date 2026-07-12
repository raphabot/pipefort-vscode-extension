import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Integration tests run inside a real VS Code instance over the gh-workspace
 * fixture. They require a pipefort binary, provided via the
 * PIPEFORT_TEST_BINARY env var (CI builds one from ../pipefort). When unset the
 * suite skips so local `npm test` without a binary still passes.
 */
const BINARY = process.env.PIPEFORT_TEST_BINARY;

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 30000,
  intervalMs = 250
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

describe("Pipefort extension", function () {
  before(async function () {
    if (!BINARY) {
      this.skip();
    }
    const ext = vscode.extensions.getExtension("pipefort.pipefort");
    assert.ok(ext, "extension should be installed");
    await ext!.activate();
    await vscode.workspace
      .getConfiguration("pipefort")
      .update(
        "binaryPath",
        BINARY,
        vscode.ConfigurationTarget.Workspace
      );
  });

  it("activates", () => {
    const ext = vscode.extensions.getExtension("pipefort.pipefort");
    assert.strictEqual(ext?.isActive, true);
  });

  it("publishes diagnostics for the workflow fixture", async () => {
    await vscode.commands.executeCommand("pipefort.scanWorkspace");

    const folder = vscode.workspace.workspaceFolders![0].uri;
    const ciUri = vscode.Uri.file(
      path.join(folder.fsPath, ".github", "workflows", "ci.yml")
    );

    await waitFor(() => vscode.languages.getDiagnostics(ciUri).length > 0);

    const diags = vscode.languages.getDiagnostics(ciUri);
    assert.ok(diags.length > 0, "expected diagnostics in ci.yml");
    assert.ok(
      diags.some((d) => d.source === "pipefort"),
      "diagnostics should be sourced from pipefort"
    );
    assert.ok(
      diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error),
      "expected at least one HIGH (Error) finding"
    );
  });

  it("produces a SYSTEM hint for invalid YAML", async () => {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const brokenUri = vscode.Uri.file(
      path.join(folder.fsPath, ".github", "workflows", "broken.yml")
    );
    await vscode.commands.executeCommand("pipefort.scanWorkspace");
    await waitFor(
      () => vscode.languages.getDiagnostics(brokenUri).length > 0,
      30000
    );
    const diags = vscode.languages.getDiagnostics(brokenUri);
    assert.ok(
      diags.some((d) => d.severity === vscode.DiagnosticSeverity.Hint),
      "expected a Hint-level SYSTEM finding for broken.yml"
    );
  });
});
