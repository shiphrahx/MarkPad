---
name: release
description: Cut a MarkPad release - bump the version, tag it, and check the installers, checksums and attestations landed. Use when asked to release, ship, tag or publish a new version of MarkPad.
---

# Releasing MarkPad

The version lives in `package.json`. Tauri reads it from there. `Cargo.toml`
keeps a copy because Cargo can't point elsewhere, and
`tests/packaging/version.test.ts` fails if the two drift.

## Steps

1. Start from an up-to-date `main` with a clean tree. Make a branch
   `release/vX.Y.Z`.
2. Bump `version` in `package.json` and in `src-tauri/Cargo.toml`.
3. Refresh the lockfile entry: `cd src-tauri && cargo update -p markpad`.
4. Run everything in CLAUDE.md's Commands section. All green, or stop.
5. One commit: `build: bump the version to X.Y.Z`. Push, open a PR, wait for
   CI, merge.
6. Tag the merge commit on `main` and push the tag:
   `git tag vX.Y.Z && git push origin vX.Y.Z`. Ask before pushing a tag:
   it publishes a release.
7. Watch `.github/workflows/release.yml`: `gh run watch`. It refuses to run if
   the tag and `package.json` disagree.
8. Check the release has, for every platform, the installer, its `.sha256`,
   and an attestation:
   `gh release view vX.Y.Z --json assets --jq '.assets[].name'` and
   `gh attestation verify <file> --repo shiphrahx/MarkPad` on one download.

## If it goes wrong

- Tag and version disagree: bump properly and move the tag. Don't edit the
  workflow to get round it.
- One platform failed: re-run that job, or `workflow_dispatch` the release
  workflow with the tag. Uploads use `--clobber`, so re-running is safe.
- Installer over 8 MB: the change is wrong, not the budget.
