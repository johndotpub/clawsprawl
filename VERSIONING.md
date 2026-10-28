# Versioning Policy

This project uses Semantic Versioning (`MAJOR.MINOR.PATCH`).

## Rules

- `MAJOR`: breaking API, protocol, or operator-workflow changes.
- `MINOR`: new backward-compatible features or phase milestones.
- `PATCH`: backward-compatible fixes, docs fixes, or security fixes.

## Public Baseline

This repository is published with a clean-room baseline release:

- `0.42.0`: first public baseline release with live SSR dashboard, strict QA gates, docs/screenshots, and least-privilege default auth scope.
- `0.42.1`: post-release hardening patch with CI/security stabilization and documentation IA cleanup.
- `0.42.69`: comprehensive hardening release addressing 91 findings (2 critical, 8 high, 29 medium, 52 low) from full QA/security review.
- `0.43.0`: protocol v4 upgrade, comprehensive event handling (31 event types), OpenTelemetry-focused observability, security hardening, and DRY/code-quality pass.
- `0.44.0`: Astro 7 / Vite 8 dependency sweep, full-tree security audit enforcement, and OpenClaw v2026.6/7 protocol-robustness catch-up (agent-kind cap, configurable maxProtocol for v5, structured MISSING_SCOPE, v4 event buckets).

> **Note:** `0.43.0` and `0.44.0` were written into this changelog and this list but were never tagged or released. `0.67.0` is the first tagged release since `0.42.69`.

- `0.67.0`: first tagged release since `0.42.69`. Restores the production and full-tree dependency audit gates to zero, retires the nine-PR Dependabot backlog in one merge, ships the OpenClaw 2026.9 catch-up, and reconciles the version history above.

## Release Workflow

1. Update docs and tests.
2. Update `CHANGELOG.md` with release notes.
3. Bump `package.json` version.
4. Run QA sweep:

```sh
npm run qa:strict
npm run test:e2e
```

5. Commit with clear release-focused message.
6. Tag: `git tag v<version>`.
7. Publish: push to GitHub and use `publish-gpr.yml` workflow for `@johndotpub/clawsprawl` on GitHub Packages.

## A Version Is A Tag, Not A Heading

A version exists when it is **tagged and released**. A `## [x.y.z]` heading in `CHANGELOG.md` is an intention, not a release.

This rule is written down because the two drifted here: `0.43.0` and `0.44.0` were given full CHANGELOG sections and baseline entries but were never tagged, while `0.42.76` was tagged and released but numbered *below* both — leaving the history wrong in both directions until `0.67.0` reconciled it.

Consequences:

- **Never write a `## [x.y.z]` heading for a version you are not shipping.** If work spans multiple merges, document it under the version it will ship in.
- **If a version is abandoned before tagging, mark it.** Add `> **Not released.**` directly under its heading, or fold the notes into the version that actually shipped.
- **`validate-tag-version.mjs` only checks tag ↔ `package.json`** at publish time. It cannot detect a CHANGELOG section for a version that never shipped. That check is human.
- **Use the actual publish date**, not the date the CHANGELOG entry was written. They diverge whenever a release is blocked after its notes land.

## Post-Baseline Governance

- First public baseline push may be direct to `main`.
- After baseline lands, enable branch protection and PR-only merges for all subsequent changes.
