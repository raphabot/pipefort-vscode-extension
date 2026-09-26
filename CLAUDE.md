# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

**pipefort-vscode-extension** surfaces Pipefort CI/CD security findings inside
VS Code. It shells out to the `pipefort` CLI (public repo `raphabot/pipefort`)
and renders its JSON as diagnostics, a tree view, a status bar item and quick
fixes. The design and its locked decisions are in [`PLAN.md`](./PLAN.md). Read
it before changing behavior.

## Commands

- Verify (what CI's first job runs): `npm run lint && npm run compile && npm run test:unit`
- Single unit test: `npx vitest run test/unit/<file>.test.ts`
- Integration tests (a VS Code host; Linux needs `xvfb-run -a`):
  `npm run test:integration`. Set `PIPEFORT_TEST_BINARY` to a built CLI, or
  they skip.
- Build: `npm run build` · Package: `npx vsce package`

## Invariants (from PLAN.md, don't regress)

- **The CLI binary is verified.** Downloads are sha256-checked against
  `checksums.txt`. On a mismatch, delete the artifact and hard-fail. Never run
  an unverified binary.
- **Spawn without a shell.** Pass the argv array, never `shell: true`.
- **Tokens stay out of argv and logs.** A token goes only into the spawn env,
  and logged env values are scrubbed (`GITHUB_TOKEN=***`).
- **Save/open scans run `--offline`.** Online audits are only for workspace or
  manual scans, with a cooldown, so saves don't hammer the GitHub API.
- **Never blank results on a scan error.** Keep the previous results.
- A CLI-facing change (flags, JSON shape) is cross-repo. It lands in
  `raphabot/pipefort` first.

## Conventions

1. Every behavior change ships with a unit test. Integration tests cover
   anything that touches the VS Code API surface.
2. Releases are tag-driven (`v*` → Marketplace + Open VSX). Agents never
   create tags or publish.
3. The review policy is [`REVIEW.md`](./REVIEW.md).
