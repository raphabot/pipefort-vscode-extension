import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Pipefort");
  }
  return channel;
}

/**
 * Redact anything that looks like a GitHub token or an env assignment of a
 * token variable, so secrets never reach the output channel.
 */
export function scrub(text: string): string {
  return (
    text
      // GITHUB_TOKEN=xxx / GH_TOKEN=xxx style assignments
      .replace(/\b(GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN)=([^\s"']+)/g, "$1=***")
      // GitHub personal-access / app / OAuth token formats
      .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "***")
      .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "***")
  );
}

export function log(message: string): void {
  const stamp = new Date().toISOString();
  getChannel().appendLine(`[${stamp}] ${scrub(message)}`);
}

export function show(preserveFocus = true): void {
  getChannel().show(preserveFocus);
}

export function disposeLog(): void {
  channel?.dispose();
  channel = undefined;
}
