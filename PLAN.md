# Pipefort VS Code Extension — Implementation Plan

> Handoff note for the executing agent: this is a greenfield project in this (currently empty) directory. The pipefort CLI source lives at `../pipefort` — consult it read-only to verify CLI behavior; do not modify it. All CLI facts below were verified against that source.

## Context

Pipefort (`../pipefort`, github.com/raphabot/pipefort) is a Go CLI that scans CI/CD pipeline definitions (GitHub Actions + GitLab CI) for OWASP CI/CD Top 10 / SLSA / supply-chain issues. This project builds a **greenfield VS Code extension** that auto-downloads and manages the CLI, scans open projects, publishes findings as diagnostics (linting with squiggles + Problems panel), and surfaces them — including Pipefort's signature "toxic combinations" (correlated attack chains) — in a dedicated Activity Bar view. Target: VS Code Marketplace **and** Open VSX (Cursor, Windsurf, VSCodium, Theia), so no proposed APIs, `engines.vscode: ^1.85.0`.

## Locked decisions (user-confirmed)

- **CLI delivery**: auto-download from GitHub Releases, sha256-verified against `checksums.txt`, cached in `globalStorageUri/bin/<tag>/`; `pipefort.binaryPath` setting overrides.
- **Scan triggers**: on file open + save, plus full workspace scan on startup (all individually toggleable).
- **Online pin audits** (typosquat/vulnerable-action, needs GitHub API): `auto` default — enabled when a token is found (mirror CLI: `$GITHUB_TOKEN`/`$GH_TOKEN`/`gh auth token`, plus VS Code's GitHub auth session), with `on`/`off` overrides. Mitigation so saves don't hammer the API: **file-level save/open scans always run `--offline`**; online audits run on startup/manual workspace scans, with a ≥5-min-cooldown per-file online refresh queued after saves when a token exists.
- **Quick fixes**: "Fix all auto-fixable issues in file" (runs `pipefort -f <file> --fix`) + per-finding "Suppress with `# pipefort: ignore[rule-id]`" comment insertion. No per-finding fix diffing.
- **GitLab CI in scope** for v1 (`.gitlab-ci.yml|yaml`, `.gitlab-ci/**/*.yml`) — near-free since the CLI's dir scan handles both.
- **Status bar item** in scope; LSP explicitly not used (batch CLI, no server — plain extension host + DiagnosticCollection is correct).

## Verified CLI facts the design depends on

- Machine invocation: `pipefort -p <absdir>|-f <absfile> -o json -s NONE`. JSON on stdout, logs on stderr. **`-s NONE` makes exit≠0 mean genuine error** (default `--fail-on MEDIUM` conflates findings with errors).
- JSON: `{"findings":[…], "toxic_combinations":[…]}`. Finding: `file, line(1-based), column, severity(HIGH|MEDIUM|LOW|INFO), category, rule_id, title, description, recommendation, confidence?, fingerprint?`. Local scans echo the path exactly as passed → **always pass absolute paths** so `file → Uri.file()` is trivial.
- Toxic combos: `id, title, severity(CRITICAL|HIGH), scope, file, impact, break_chain, break_chain_rule, stages[], components[]`. Console/JSON only, never affect exit code.
- Releases (`raphabot/pipefort`): `pipefort_<ver-no-v>_<os>_<arch>.tar.gz` (`zip` on windows), linux|darwin|windows × amd64|arm64 minus windows/arm64, plus `checksums.txt`. Tags `vX.Y.Z`. macOS binaries unsigned.
- **CLI has no `--version`** → extension records the downloaded tag in its own `manifest.json`. *(Suggest upstream: expose the already-ldflags-injected `main.version` as `pipefort --version`.)*
- Token via env only (`GITHUB_TOKEN` in spawn env, never argv — argv is visible in `ps`). Don't pass `--no-config` — respect repo `.pipefort.yml`/`.github/pipefort.yml`.
- Suppression syntax (verified `pkg/scanner/inline_ignores.go`): `# pipefort: ignore[id1,id2]` or bare `# pipefort: ignore`, same or preceding line.
- Rule docs: `https://pipefort.com/docs/rules/<rule-id>`.

## Repo layout

```
pipefort-vscode-extension/
├── package.json / tsconfig.json / esbuild.mjs / .vscodeignore
├── .vscode/{launch,tasks}.json          # F5 configs + esbuild watch
├── media/pipefort.svg                   # activity bar icon (monochrome)
├── src/
│   ├── extension.ts                     # activate(): compose modules, wire events
│   ├── settings.ts                      # typed pipefort.* reader + change handling
│   ├── log.ts                           # "Pipefort" OutputChannel + token scrub()
│   ├── commands.ts                      # scanWorkspace, scanFile, fixFile, showOutput, openSettings, updateCli
│   ├── binary/
│   │   ├── platform.ts                  # platform/arch → asset name (pure, unit-testable)
│   │   ├── downloader.ts                # release fetch, sha256 verify, extract, manifest.json
│   │   └── binaryManager.ts             # resolve(): setting > cached manifest > download
│   ├── scan/
│   │   ├── cliRunner.ts                 # buildArgs + spawn + cancel (SIGTERM)
│   │   ├── scanScheduler.ts             # serial queue, 500ms save debounce, supersede/cancel
│   │   └── resultStore.ts               # findings-per-URI + combos; onDidChange event
│   ├── model/
│   │   ├── types.ts                     # PipefortFinding, ToxicCombo, ScanOutput interfaces
│   │   └── parser.ts                    # parseScanOutput, severity map, findingRange
│   ├── auth/tokens.ts                   # resolveGitHubToken(): env → auth session (silent)
│   └── ui/
│       ├── diagnostics.ts               # DiagnosticCollection publisher
│       ├── treeView.ts                  # TreeDataProvider + badge
│       ├── statusBar.ts                 # idle/scanning/counts/error states
│       └── codeActions.ts               # suppress + fix-all QuickFix provider
├── test/
│   ├── unit/                            # vitest: parser, platform, scheduler, scrub
│   ├── integration/                     # @vscode/test-cli + mocha over fixtures
│   └── fixtures/{gh-workspace,gl-workspace,combo-workspace}/…
└── .github/workflows/ci.yml             # lint → unit → integration → package/publish
```

Zero npm runtime dependencies: download via Node `https` (follows VS Code's `http.proxy` patching — deliberately not `fetch`, which isn't proxy-patched at 1.85); extract by spawning **system `tar`** (present on macOS/Linux; Windows 10+ ships `tar.exe` that also reads zip). Failure → error directing user to `pipefort.binaryPath`.

## package.json essentials

- `activationEvents`: `workspaceContains:.github/workflows`, `workspaceContains:.gitlab-ci.yml`, `:.gitlab-ci.yaml`, `:.gitlab-ci` (root-relative existence checks, no `**/` globs, no `*` activation; onCommand/onView auto-generated since 1.74).
- `contributes`: activity-bar `viewsContainers` `pipefort` + view `pipefort.findings` (+ `viewsWelcome` with a "Scan Workspace" link); the 6 commands above (`view/title` refresh icon; `scanFile` palette-gated on `resourceExtname =~ /\.ya?ml$/`).
- Settings (`pipefort.*`): `binaryPath` (string), `cliVersion` (`latest` or tag), `onlineAudits` (`auto|on|off`), `ruleset` (`all|owasp|slsa|slsa-build-l1..l3|slsa-source-l2..l4`), `persona` (`regular|pedantic|auditor`), `minConfidence` (`LOW|MEDIUM|HIGH`), `scanOnOpen|scanOnSave|scanOnStartup` (bool), `extraArgs` (string[]). No `failOn` setting — always `-s NONE`.

## Module design (key behaviors)

- **binaryManager.resolve()** (memoized): explicit `binaryPath` (validate executable) → pinned tag from cache/download → `latest`: use newest cached manifest immediately, check for updates in background, prompt to rescan on upgrade; first-ever download runs under `window.withProgress` notification. Failure → status-bar warning + notification with "Set binary path"/"Retry"; scans no-op. GC: keep current + previous versions. `chmod 0o755`; best-effort `xattr -d com.apple.quarantine` on darwin. Checksum mismatch → delete artifact, hard-fail, never install unverified.
- **cliRunner.buildArgs**: `['-o','json','-s','NONE']` + target (`-p`/`-f`, absolute) + non-default `-r/--persona/--min-confidence` + online policy flag (`--offline` or `--audit-pins`) + `extraArgs`. Spawn without `shell:true`; stderr streamed to output channel; log argv + scrubbed env (`GITHUB_TOKEN=***`).
- **parser**: severity map HIGH→Error, MEDIUM→Warning, LOW→Information, INFO→Hint (single function, easy to adjust). Range: `(line-1, col-1)` extended to end-of-line when the doc is open; `line 0` → `Range(0,0,0,1)`. `file === "<repository settings>"` filtered out of diagnostics. Defensive shape checks; arrays default `[]`.
- **resultStore**: `applyWorkspaceResult(folder, r)` replaces all URIs under the folder + that folder's combos; `applyFileResult(uri, r)` replaces only that URI (file-scoped combos for that file replaced; repo-scoped combos untouched, marked "as of last workspace scan" in tooltips). Never blank results on scan error — keep previous.
- **diagnostics**: `source: 'pipefort'`; `code: {value: rule_id, target: docs URL}` (SYSTEM findings with empty rule_id get plain `'system'`, no link, no quick fixes); `relatedInformation` linking findings that participate in a toxic combo; raw finding stashed on the diagnostic for the code-action provider.
- **treeView**: sections — `⚠ Toxic Combinations (n)` (combo → stages → "Break the chain" node) then per-file groups sorted by path; finding nodes use ThemeIcon by severity, `description = rule_id`, Markdown tooltip (description + recommendation + docs link), click = `vscode.open` at range. `treeView.badge` = total findings. Multi-root: partition by folder; out-of-workspace findings under "(outside workspace)".
- **codeActions**: (1) Suppress — WorkspaceEdit appending `  # pipefort: ignore[<rule_id>]` to the finding's line, merging into an existing `ignore[...]` bracket if present; (2) Fix-all — invokes `pipefort.fixFile`: prompt to save if dirty, run `pipefort -f <abs> --fix -s NONE -o json` (its JSON doubles as the fresh result), apply, editor auto-reloads.
- **scanScheduler**: single-flight serial queue keyed `dir:<folder>`/`file:<path>`; queued duplicates replaced; running scans superseded via CancellationToken → SIGTERM (plain `kill()` on Windows); workspace scan absorbs queued file scans under it; check `token.isCancellationRequested` before applying results.
- **tokens**: env vars first (CLI also shells to `gh auth token` itself); else `vscode.authentication.getSession('github', [], {silent:true})`; only prompt (`createIfNone`) when user explicitly sets `onlineAudits: "on"` and nothing found. Token goes into spawn env only; never logged, never in argv.

## Data flow

Startup → `binaryManager.resolve()` → per-folder workspace scan (online per policy) → parse → `applyWorkspaceResult` → store event → diagnostics + tree + status bar update. Save → 500 ms debounce → `pipefort -f <abs> --offline …` → `applyFileResult` (only that file's diagnostics replaced) → optional cooldown-gated online refresh of that file. Manual workspace scan = startup path, cancels queued file scans. Fix flow: save-if-dirty → `--fix` → fresh JSON applied → fixed squiggles disappear.

File-matching predicate for open/save triggers (`isPipefortTarget(uri)`, mirrors CLI discovery): `**/.github/workflows/*.{yml,yaml}`, root `.gitlab-ci.{yml,yaml}`, `**/.gitlab-ci/**/*.{yml,yaml}`.

## Edge cases handled

Download/network failure (escape hatch: binaryPath setting); checksum mismatch (hard fail); SYSTEM parse-error findings (Hint at doc start, no actions); scan-while-scanning (supersede); corporate proxies (`https` module honors `http.proxy`); Windows (Uri-based comparisons, no `shell:true`, `tar.exe` for zip, `.exe` suffix); dirty editors (scans read disk — acceptable for v1; future scan-on-type via `pipefort mcp`'s `scan_workflow(content)`); invalid CLI stdout (keep previous results, log stderr tail); multi-root (per-folder scans + partitioned store).

## Milestones

- **M1 — Skeleton + scan + diagnostics**: manifest, esbuild, extension.ts, settings, log, model, cliRunner, minimal scheduler, diagnostics, scan commands. BinaryManager stubbed (setting → PATH). Scan-on-open/save/startup wired. *Core value proven here.*
- **M2 — Tree view + status bar + toxic combos**: resultStore merge semantics, treeView + badge, statusBar, viewsWelcome, multi-root.
- **M3 — Downloader + quick fixes**: platform/downloader/binaryManager (checksum, system-tar extract, manifest, GC, updateCli), token resolution + online-audit policy + cooldown refresh, codeActions.
- **M4 — Tests + CI + packaging**: vitest unit tests (parser/platform/scheduler/scrub), @vscode/test-cli integration tests with a pinned real CLI over fixtures, README/CHANGELOG/icon, CI (lint→unit→integration on ubuntu `xvfb-run` + windows→`vsce package`), release job publishing to Marketplace (`VSCE_PAT`) + Open VSX (`ovsx`).

## Verification

- **M1**: F5 Extension Development Host on `test/fixtures/gh-workspace`: activation only when workflow files exist; startup scan populates Problems with expected rule_ids; HIGH renders as Error; diagnostic code links to pipefort.com docs; fixing one issue on save clears only that squiggle; `broken.yml` (invalid YAML fixture) yields doc-start Hint; rapid double-save shows superseded scan in output channel.
- **M2**: combo fixture shows Toxic Combinations node with stages; badge count matches Problems; node click reveals exact range; two-folder multi-root behaves per-folder.
- **M3**: delete globalStorage → observe download progress + `bin/<tag>/manifest.json` + exec bit; corrupted-archive unit test → checksum rejection; garbage binaryPath → error UX; suppress quick fix inserts comment and diagnostic clears on rescan; fix-all rewrites file; grep output channel in a test to prove tokens never leak.
- **M4**: CI matrix green; VSIX < ~1 MB, `vsce ls` audit; install VSIX in stock VS Code and repeat the M1 checklist.

## Upstream suggestions (report to ../pipefort maintainer, not blocking)

1. Add `pipefort --version` (ldflags already inject `main.version`; it's just unexposed) — lets the extension verify cached binaries.
2. Consider a distinct exit code for "findings found" vs "error" (e.g., 0/1/2) — today the extension works around it with `-s NONE`.
