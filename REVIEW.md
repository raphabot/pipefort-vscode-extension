# Review policy

This is the policy every PR is reviewed against, whether the reviewer is a
human, `/code-review`, or the Claude GitHub Action.

## Severity
- **Blocker**: running an unverified binary, `shell: true` or string-built
  commands, a token in argv or logs, network calls on save/open scans, or
  anything that could execute workspace content.
- **Major**: blanking or corrupting diagnostics on error, race conditions in
  the scan scheduler (a stale result applied after a newer one), a missing unit
  test for changed behavior, Windows path or kill handling that breaks.
- **Minor**: maintainability issues that will plausibly cause a bug later.
- **Nit**: at most 3. Skip anything eslint or tsc already enforces.

## Always check
1. PLAN.md invariants (see CLAUDE.md) still hold.
2. Cancellation: results are applied only if `token.isCancellationRequested` is false.
3. Multi-root workspaces and out-of-workspace files.
4. Workflows: actions pinned to a commit SHA, minimal `permissions:`, and
   publish secrets used only in the tag-triggered job.

## Out of scope
`dist/`, `*.vsix`, `package-lock.json`, and `test/fixtures/` content (unless it
is the point of the PR).
