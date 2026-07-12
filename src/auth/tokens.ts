import * as vscode from "vscode";

/**
 * Resolve a GitHub token for online pin audits, mirroring the CLI's own
 * discovery order, then falling back to VS Code's built-in GitHub auth.
 *
 * The token is only ever placed into the spawn environment — never argv, never
 * logged.
 *
 * @param allowPrompt when true, prompt the user to sign in if nothing is found
 *                    (used when `onlineAudits: "on"` is set explicitly).
 */
export async function resolveGitHubToken(
  allowPrompt = false
): Promise<string | undefined> {
  const env =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GH_ENTERPRISE_TOKEN;
  if (env) {
    return env;
  }

  try {
    const session = await vscode.authentication.getSession("github", [], {
      silent: !allowPrompt,
      createIfNone: allowPrompt,
    });
    return session?.accessToken;
  } catch {
    return undefined;
  }
}
