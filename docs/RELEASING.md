# GitHub release process

Push an existing `vX.Y.Z` version tag to run the Release workflow, or select **Actions → Release → Run workflow** and enter an existing tag. Manual runs also offer an explicit prerelease checkbox; tag pushes create ordinary release drafts.

Both repositories use Node 22 and Python 3.12. The workflow verifies the tag checkout, runs fixture-free regression and release-tooling tests, builds runtime assets, and validates the tag/version, package version when present, release download URL, embedded/external manifests, ZIP integrity, and declared runtime files.

Release notes come from exactly the matching `## X.Y.Z` section of `CHANGELOG.md`, ending at the next level-two heading. Nested headings are preserved. Missing, empty, or duplicate sections fail the build. The release heading omits the changelog's “prepared” suffix. GitHub-generated PR summaries are not used.

The workflow creates a draft titled `vX.Y.Z` with the ZIP, manifest, and `SHA256SUMS.txt`. Review its notes and assets on GitHub, then publish. For paired system/importer updates, prepare both drafts and publish the companion importer before the system when the system notes require that importer.

The existing draft or published release is never automatically overwritten: `gh release create` fails if that release already exists. Inspect it before deciding whether to delete an incomplete draft and rerun. Published versions should receive a new version/tag rather than replacement assets.

Local preparation uses the normal release builder followed by:

```text
python tools/prepare_release.py --output dist --manifest system.json --repository pirsqed/fvtt-crows-system --tag vX.Y.Z
```

Use `system.json` for the system or `module.json` for the importer. The system builder needs `--output dist/fvtt-crows-system.zip`, then copy `system.json` into `dist`; the importer builder writes into `dist` and needs `--repository pirsqed/fvtt-crows-pdf-importer --tag vX.Y.Z`.
