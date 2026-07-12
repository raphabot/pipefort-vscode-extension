# Changelog

All notable changes to the Pipefort extension are documented here.

## [0.1.0] - Unreleased

Initial release.

- Auto-managed pipefort CLI: checksum-verified download from GitHub Releases,
  cached per version with background update checks, or bring your own via
  `pipefort.binaryPath`.
- Scan on open, save, and startup for GitHub Actions and GitLab CI files.
- Findings published as diagnostics (squiggles + Problems panel) with
  severity-mapped icons and links to the rule documentation.
- Dedicated Pipefort Activity Bar view: toxic combinations (with attack stages
  and break-the-chain guidance) and per-file findings, plus a findings badge.
- Status bar item reflecting scan state and finding counts.
- Quick fixes: "Fix all auto-fixable issues in file" and per-finding inline
  suppression comments.
- Optional online pin audits with cooldown-gated per-file refresh so saves
  never hammer the GitHub API.
