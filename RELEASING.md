# Releasing

Releases are published by `.github/workflows/release.yml` from an annotated
version tag. Do not publish routine releases directly from a workstation.

## One-time repository setup

1. Make `wibus-wee/cuelens` public and add a repository description and
   topics.
2. Enable private vulnerability reporting in **Settings > Security**.
3. Create a GitHub environment named `npm`. Add required reviewers if releases
   should require manual approval.
4. Confirm that the npm account or organization owning the `@wibus` scope may
   create the public `@wibus/cuelens` package.
5. Protect `main` and require the `Package / Node 22`, `Package / Node 24`, and
   `Playground / Chromium` checks.

If the package does not yet exist on npm, create a short-lived npm granular
access token that can create packages in the `@wibus` scope and add it as the
`NPM_TOKEN` secret on the `npm` environment. After the first successful
publish:

1. Configure npm Trusted Publishing for GitHub Actions with owner `wibus-wee`,
   repository `cuelens`, workflow filename `release.yml`, and
   environment `npm`.
2. Delete the `NPM_TOKEN` environment secret.

Subsequent releases use GitHub OIDC. The workflow requests `id-token: write` and
publishes npm provenance.

## Prepare a release

1. Decide the next semantic version.
2. Move relevant entries in `CHANGELOG.md` from **Unreleased** into a section
   named for that version and the release date.
3. Update `package.json` without creating a tag:

   ```sh
   pnpm version patch --no-git-tag-version
   ```

   Replace `patch` with `minor`, `major`, or an explicit version when needed.

4. Run the complete local checks:

   ```sh
   pnpm install --frozen-lockfile
   pnpm check
   pnpm --dir playground install --frozen-lockfile
   pnpm --dir playground build
   pnpm --dir playground test:e2e
   ```

5. Review the `npm pack --dry-run` file list printed by `pnpm check:package`.
6. Commit and merge the version and changelog update into `main`.

## Publish

For the first release, a maintainer may publish from an authenticated local
workstation. Local npm cannot produce GitHub Actions provenance, so disable it
for this one command:

```sh
npm login
npm whoami
npm publish --access public --provenance=false
```

Then create and push the annotated tag below. The release workflow detects the
existing npm version, skips duplicate publication, and creates the GitHub
Release.

Create and push an annotated tag from the release commit:

```sh
version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json')).version")
git tag -a "v$version" -m "v$version"
git push origin "v$version"
```

The release workflow then:

1. verifies that the tag matches `package.json`;
2. refuses to publish while the GitHub repository is private;
3. runs the complete package checks and npm file audit;
4. skips npm publication if that exact version already exists;
5. publishes a public package with provenance;
6. creates a GitHub Release with generated notes.

## Recovery

npm versions are immutable. Never delete and reuse a version after a failed
release.

If npm publication succeeds but GitHub Release creation fails, rerun the failed
workflow. It detects the existing npm version, skips publication, and retries
the GitHub Release.

If publication fails before npm accepts the package, fix the workflow or npm
configuration and rerun the same tag. If package contents are wrong, increment
the version and publish a corrective release instead of moving an existing tag.
