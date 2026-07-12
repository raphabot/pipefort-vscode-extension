# Pipefort for VS Code

Scan your CI/CD pipeline definitions for **OWASP CI/CD Top 10**, **SLSA**, and
supply-chain security issues — right inside your editor. Powered by the
[pipefort](https://github.com/raphabot/pipefort) CLI.

Works in VS Code and any Open VSX editor (Cursor, Windsurf, VSCodium, Theia).

## Features

- **Inline diagnostics** — findings appear as squiggles and in the Problems
  panel, with severity-mapped icons and links to the rule docs at
  [pipefort.com/docs/rules](https://pipefort.com/docs/rules).
- **Toxic combinations** — Pipefort's signature correlated attack chains are
  surfaced in a dedicated **Pipefort** view in the Activity Bar, broken down
  into stages with a "break the chain" recommendation.
- **GitHub Actions and GitLab CI** — scans `.github/workflows/*.yml`,
  `.gitlab-ci.yml`, and included `.gitlab-ci/**` files.
- **Auto-managed CLI** — the extension downloads a checksum-verified pipefort
  binary from GitHub Releases and keeps it up to date. Point it at your own
  binary with `pipefort.binaryPath` if you prefer.
- **Quick fixes** — "Fix all auto-fixable issues in file" and per-finding
  "Suppress with an inline `# pipefort: ignore[...]` comment".
- **Online pin audits** — optional typosquat / vulnerable-action detection when
  a GitHub token is available (env var or your VS Code GitHub sign-in).

## Getting started

1. Open a repository that contains CI/CD pipeline files.
2. The extension activates automatically and runs a workspace scan.
3. Review findings in the Problems panel and the Pipefort view.

Run **Pipefort: Scan Workspace** from the Command Palette any time.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pipefort.binaryPath` | `""` | Path to a pipefort binary (overrides the managed download). |
| `pipefort.cliVersion` | `latest` | `latest` or a specific tag (e.g. `v1.2.3`). |
| `pipefort.onlineAudits` | `auto` | `auto` / `on` / `off` — online pin audits (need a GitHub token). |
| `pipefort.ruleset` | `all` | `all`, `owasp`, `slsa`, or a specific SLSA level. |
| `pipefort.persona` | `regular` | `regular`, `pedantic`, or `auditor`. |
| `pipefort.minConfidence` | `LOW` | Minimum confidence to report. |
| `pipefort.scanOnOpen` | `true` | Scan pipeline files when opened. |
| `pipefort.scanOnSave` | `true` | Scan pipeline files when saved. |
| `pipefort.scanOnStartup` | `true` | Full workspace scan on activation. |
| `pipefort.extraArgs` | `[]` | Extra CLI arguments. |

## How online audits stay fast

Save/open scans always run `--offline` for instant feedback. Online pin audits
(which call the GitHub API) run on startup and manual workspace scans, plus a
cooldown-gated per-file refresh after saves — so editing never hammers the API.

## Privacy

Your GitHub token is only ever passed to the CLI via its environment, never on
the command line, and is scrubbed from the extension's output channel.

## License

MIT
