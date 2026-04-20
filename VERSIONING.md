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

## Post-Baseline Governance

- First public baseline push may be direct to `main`.
- After baseline lands, enable branch protection and PR-only merges for all subsequent changes.
