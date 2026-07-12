/**
 * Minimal `vscode` module stub for vitest unit tests. Only implements the API
 * surface touched at module load or by the pure functions under test.
 */

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}
}

export class Range {
  start: Position;
  end: Position;
  constructor(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ) {
    this.start = new Position(startLine, startChar);
    this.end = new Position(endLine, endChar);
  }
}

export class Uri {
  private constructor(
    public scheme: string,
    public path: string,
    public fsPath: string
  ) {}
  static file(p: string): Uri {
    return new Uri("file", p, p);
  }
  static parse(s: string): Uri {
    const path = s.replace(/^file:\/\//, "");
    return new Uri("file", path, path);
  }
  toString(): string {
    return `file://${this.path}`;
  }
}

export class ThemeIcon {
  static readonly File = new ThemeIcon("file");
  static readonly Folder = new ThemeIcon("folder");
  constructor(
    public id: string,
    public color?: unknown
  ) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class MarkdownString {
  value = "";
  isTrusted = false;
  appendMarkdown(v: string): this {
    this.value += v;
    return this;
  }
}

export class Diagnostic {
  source?: string;
  code?: unknown;
  relatedInformation?: unknown[];
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity
  ) {}
}

export class DiagnosticRelatedInformation {
  constructor(
    public location: unknown,
    public message: string
  ) {}
}

export class Location {
  constructor(
    public uri: Uri,
    public range: Range
  ) {}
}

export const CodeActionKind = {
  QuickFix: { value: "quickfix" },
};

export class CodeAction {
  diagnostics?: unknown[];
  edit?: unknown;
  command?: unknown;
  constructor(
    public title: string,
    public kind?: unknown
  ) {}
}

export class WorkspaceEdit {
  replace(): void {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export const ProgressLocation = { Notification: 15 };

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(e: T): void {
    for (const l of this.listeners) {
      l(e);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
}

export const workspace = {
  getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
  workspaceFolders: undefined,
  textDocuments: [],
  getWorkspaceFolder: () => undefined,
  asRelativePath: (u: Uri | string) =>
    typeof u === "string" ? u : u.fsPath,
};

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    show: () => {},
    dispose: () => {},
  }),
};

export const languages = {
  createDiagnosticCollection: () => ({
    set: () => {},
    clear: () => {},
    dispose: () => {},
  }),
};

export const authentication = {
  getSession: async () => undefined,
};
