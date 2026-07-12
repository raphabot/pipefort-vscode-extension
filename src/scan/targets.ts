import * as vscode from "vscode";

/**
 * Predicate mirroring the CLI's file discovery, used to decide whether an
 * open/save event should trigger a scan:
 *   - any `.github/workflows/*.{yml,yaml}`
 *   - root `.gitlab-ci.{yml,yaml}`
 *   - any `.gitlab-ci/` included file `*.{yml,yaml}`
 */
export function isPipefortTarget(uri: vscode.Uri): boolean {
  if (uri.scheme !== "file") {
    return false;
  }
  const path = uri.path;
  if (!/\.ya?ml$/i.test(path)) {
    return false;
  }
  // GitHub Actions workflows
  if (/\/\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)) {
    return true;
  }
  // Included GitLab CI files
  if (/\/\.gitlab-ci\/.+\.ya?ml$/i.test(path)) {
    return true;
  }
  // Root-level GitLab CI file
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    const rel = path.slice(folder.uri.path.length).replace(/^\/+/, "");
    if (/^\.gitlab-ci\.ya?ml$/i.test(rel)) {
      return true;
    }
  } else if (/\/\.gitlab-ci\.ya?ml$/i.test(path)) {
    return true;
  }
  return false;
}
