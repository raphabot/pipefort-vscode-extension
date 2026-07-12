import * as vscode from "vscode";

export type OnlineAudits = "auto" | "on" | "off";
export type Ruleset =
  | "all"
  | "owasp"
  | "slsa"
  | "slsa-build-l1"
  | "slsa-build-l2"
  | "slsa-build-l3"
  | "slsa-source-l2"
  | "slsa-source-l3"
  | "slsa-source-l4";
export type Persona = "regular" | "pedantic" | "auditor";
export type MinConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface PipefortSettings {
  binaryPath: string;
  cliVersion: string;
  onlineAudits: OnlineAudits;
  ruleset: Ruleset;
  persona: Persona;
  minConfidence: MinConfidence;
  scanOnOpen: boolean;
  scanOnSave: boolean;
  scanOnStartup: boolean;
  extraArgs: string[];
}

export const CONFIG_SECTION = "pipefort";

export function readSettings(): PipefortSettings {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    binaryPath: c.get<string>("binaryPath", "").trim(),
    cliVersion: c.get<string>("cliVersion", "latest").trim() || "latest",
    onlineAudits: c.get<OnlineAudits>("onlineAudits", "auto"),
    ruleset: c.get<Ruleset>("ruleset", "all"),
    persona: c.get<Persona>("persona", "regular"),
    minConfidence: c.get<MinConfidence>("minConfidence", "LOW"),
    scanOnOpen: c.get<boolean>("scanOnOpen", true),
    scanOnSave: c.get<boolean>("scanOnSave", true),
    scanOnStartup: c.get<boolean>("scanOnStartup", true),
    extraArgs: c.get<string[]>("extraArgs", []),
  };
}

/** Register a listener fired when any `pipefort.*` setting changes. */
export function onSettingsChanged(
  handler: (e: vscode.ConfigurationChangeEvent) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      handler(e);
    }
  });
}

export function openSettings(): void {
  void vscode.commands.executeCommand(
    "workbench.action.openSettings",
    `@ext:pipefort.pipefort`
  );
}
