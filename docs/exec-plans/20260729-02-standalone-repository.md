# Move interactive-film into a standalone wibus repository

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current while work proceeds. It follows `/Users/wibus/.agents/skills/execplan/references/PLANS.md`; the essential rules are repeated here: the plan must remain self-contained, use exact paths and commands, explain decisions in plain language, and prove behavior rather than merely listing files.

## Purpose / Big Picture

After this work, the interactive film runtime and its architecture documentation live in `/Users/wibus/dev/interactive-film`, an independent Git repository owned by `wibus`. A developer can clone that repository, install its dependencies, run its tests, build publishable JavaScript and TypeScript declarations, and inspect the npm package without having the Lody monorepo. The temporary package and documentation copies previously added to Lody are removed, while Lody's existing application code and pre-existing dirty files remain untouched.

## Progress

- [x] (2026-07-29 03:25Z) Copied the runtime source, tests, README, architecture analysis, and original extraction plan into `/Users/wibus/dev/interactive-film` without deleting the source copy.
- [x] (2026-07-29 03:27Z) Initialized an independent Git repository on branch `main`.
- [x] (2026-07-29 03:30Z) Replaced monorepo-only TypeScript and dependency settings with standalone build, check, format, and pack configuration.
- [x] (2026-07-29 03:31Z) Changed the package owner and scope to `wibus`, including `@wibus/interactive-film`, MIT copyright, and GitHub package metadata.
- [x] (2026-07-29 03:33Z) Installed dependencies and generated the standalone `pnpm-lock.yaml`.
- [x] (2026-07-29 03:36Z) Ran type checking, 12 deterministic tests, production build, formatting, runtime import checks, and package-content inspection successfully.
- [x] (2026-07-29 03:37Z) Removed only the temporary interactive-film additions from Lody and verified its original dirty changes are preserved.
- [x] (2026-07-29 03:38Z) Attempted Cradle workspace registration and recorded the CLI packaging failure; repository operation does not depend on registration.
- [ ] Commit the standalone repository, create private `wibus/interactive-film`, push `main`, and record the remote URL.

## Surprises & Discoveries

- Observation: The original package compiled only because Lody supplied `packages/configs/tsconfig.extend.json`, catalog dependency versions, and package-local links into the monorepo dependency store.
  Evidence: The copied `tsconfig.json` extended `../configs/tsconfig.extend.json`, while `package.json` used `@types/react: catalog:` and exported TypeScript source directly.

- Observation: A reusable source tree is not yet a publishable standalone package.
  Evidence: The original exports pointed at `src/index.ts` and `src/react.tsx`. The standalone package now targets `dist/index.js`, `dist/react.js`, and their declaration files, which must be produced and inspected before the Lody copy is removed.

- Observation: Formatting was also an implicit monorepo dependency.
  Evidence: the first standalone `pnpm check` passed type checking, all 12 tests, and the build, but Prettier rejected 13 copied files until the repository's formatting policy was added as `.prettierrc`.

- Observation: pnpm 10 does not support `pnpm pack --dry-run`.
  Evidence: the command returned `Unknown option: 'dry-run'`. Packing into a `mktemp -d` directory and listing the tarball proved the same file boundary without leaving a package archive behind.

- Observation: Cradle workspace registration is unavailable because the installed Cradle CLI bundle cannot resolve one of its own dependencies.
  Evidence: `/Applications/Cradle.app/Contents/Resources/bin/cradle open ... --import-only` failed before contacting the server with `ERR_MODULE_NOT_FOUND: Cannot find package 'vite' imported from .../Resources/cli/index.js`.

## Decision Log

- Decision: Use `/Users/wibus/dev/interactive-film` as the independent repository path and `main` as its initial branch.
  Rationale: It is a sibling of the Lody checkout rather than a nested repository, so neither repository owns the other's files or Git history.
  Date/Author: 2026-07-29 / Codex

- Decision: Publish under `@wibus/interactive-film` and set repository metadata to `github.com/wibus/interactive-film`.
  Rationale: The user explicitly identified `wibus` as the owner. Keeping the old Lody scope would incorrectly couple the extracted runtime to the source product.
  Date/Author: 2026-07-29 / Codex

- Decision: Build with TypeScript itself instead of introducing a bundler.
  Rationale: The package has a small ESM module graph and no bundled assets. TypeScript can rewrite explicit `.ts` imports to `.js`, emit declarations and source maps, and keep React as an external peer dependency.
  Date/Author: 2026-07-29 / Codex

- Decision: Verify the destination before deleting the source copy.
  Rationale: The move crosses repository boundaries. Keeping both copies until installation, tests, build, and package inspection pass makes recovery a simple retry rather than a reconstruction.
  Date/Author: 2026-07-29 / Codex

- Decision: Create the GitHub repository as private initially.
  Rationale: The user specified `wibus` ownership but did not specify visibility. Private is the conservative default and can be changed later without exposing unfinished package work prematurely.
  Date/Author: 2026-07-29 / Codex

## Outcomes & Retrospective

The runtime is now independently reproducible under the `wibus` package scope. A clean install produced a local lockfile; type checking, 12 deterministic tests, production declaration and JavaScript emission, formatting, and runtime import checks passed. A temporary package archive contained only `dist/`, README, LICENSE, and package metadata. The copied files were then removed from Lody, whose status returned to the three pre-existing dirty entries. GitHub publication remains as the final step.

## Context and Orientation

The runtime is a typed engine for interactive product films. `src/definition.ts` combines numeric tracks, narrative beats, camera shots, and imperative cues into one definition. `src/clock.ts` owns playback time, while `src/cues.ts` defines natural playback, seek, rewind, restart, and loop semantics. `src/camera.ts` contains pure fit geometry and spring physics plus DOM measurement helpers. `src/react.tsx` is an optional adapter and is the only source module that imports React. Tests under `tests/` execute TypeScript source directly with Node's type-stripping mode and a fake animation driver.

The long-form Lody case study and future Creator design live in `docs/architecture/interactive-onboarding-film.md`. Lody is source material for the architecture analysis, not a runtime dependency. The independent repository must not import from or extend configuration in `/Users/wibus/dev/lody/lody`.

## Plan of Work

Keep the copied source and tests unchanged except for package ownership references. Replace the monorepo package manifest with an npm-ready manifest that builds to `dist/`, declares React as a peer, pins standalone development dependencies, and records `wibus` repository metadata. Replace the inherited TypeScript configuration with local Node ESM settings and add a build configuration that emits JavaScript, source maps, and declarations. Add repository-level ignore files and an MIT license.

Run `pnpm install` in the new repository to create its own dependency graph and lockfile. Then run the full `pnpm check`, inspect `dist/`, and run `pnpm pack --dry-run` so the published file list is observable. Only after those checks pass, delete the exact temporary paths `packages/interactive-film`, `docs/architecture/interactive-onboarding-film.md`, and `docs/exec-plans/20260729-01-interactive-film-package.md` from Lody. Remove newly empty documentation directories only when they contain no other files.

Finally, attempt to use Cradle's CLI to import the independent repository as its own workspace and record any environment failure. Commit the standalone files, create `wibus/interactive-film` as a private GitHub repository, and push `main`; the user explicitly selected `wibus` ownership, while private visibility avoids an unintended public release.

## Concrete Steps

Work from `/Users/wibus/dev/interactive-film` unless a command explicitly names the Lody checkout.

    pnpm install
    pnpm check
    package_tmp_dir=$(mktemp -d)
    pnpm pack --pack-destination "$package_tmp_dir"
    tar -tzf "$package_tmp_dir"/*.tgz
    rm -r "$package_tmp_dir"
    git status --short

Inspect Lody from `/Users/wibus/dev/lody/lody`:

    git status --short
    git diff --check

After validation, remove only the three temporary paths named in the Plan of Work, then repeat both status checks. Register the destination using `/Applications/Cradle.app/Contents/Resources/bin/cradle open /Users/wibus/dev/interactive-film --import-only`.

## Validation and Acceptance

`pnpm check` must exit zero, report 12 passing tests with zero failures, emit `dist/index.js`, `dist/index.d.ts`, `dist/react.js`, and `dist/react.d.ts`, and report that all repository files match Prettier style. Packing into a temporary directory must include runtime JavaScript, declarations, source maps, README, and LICENSE while excluding `src/`, `tests/`, `docs/`, and local dependency directories.

Lody acceptance requires `git status --short` to show the user's pre-existing changes to `packages/acp-extension-claude`, `packages/acp-extension-codex`, and `pnpm-lock.yaml`, but no `packages/interactive-film`, `docs/architecture`, or interactive-film ExecPlan. No tracked Lody onboarding source may change.

## Idempotence and Recovery

Dependency installation, checks, builds, and package dry-runs can be repeated. `dist/` is generated and ignored. Until destination verification passes, the Lody copy remains a recovery source. After removal, the independent Git repository is the authoritative copy; because all migrated files are present there before deletion, recovery means copying from the destination rather than using destructive Git commands.

## Artifacts and Notes

The intended standalone package flow is:

    TypeScript source + React peer
      -> pnpm typecheck
      -> deterministic Node tests
      -> tsc build
      -> dist JavaScript + declarations
      -> npm package inspection

The intended repository relation is:

    /Users/wibus/dev/lody/lody          Lody product repository
    /Users/wibus/dev/interactive-film  reusable runtime repository

Neither directory is nested inside the other, and the runtime repository does not refer to Lody files at build or test time.

Verification evidence before the GitHub push:

    pnpm check
    # typecheck passed
    # tests 12, pass 12, fail 0
    # build passed
    # All matched files use Prettier code style!

    node --input-type=module -e "... import('./dist/index.js') ..."
    {"core":true,"react":true}

    pnpm pack --pack-destination <temporary-directory>
    # Tarball contains dist, LICENSE, package.json, and README only.

    git status --short  # in Lody
     M packages/acp-extension-claude
     M packages/acp-extension-codex
     M pnpm-lock.yaml

## Interfaces and Dependencies

The root package export must remain React-independent and expose `defineFilm`, `validateFilm`, `frameAt`, `createFilmClock`, `createCueController`, `solveCameraPose`, and `stepCamera`. The `@wibus/interactive-film/react` entry must expose `FilmProvider`, clock and frame hooks, cue integration, camera integration, and DOM anchor helpers.

React `>=18.3.1` remains a peer dependency. React `18.3.1`, `@types/react` `18.3.28`, TypeScript `5.9.2`, and Prettier `3.6.2` are local development dependencies so a fresh checkout does not rely on a parent workspace. Node `>=22.6.0` is required for the source-level test command's TypeScript stripping support.

Revision note (2026-07-29): Initial standalone migration plan created after copying the previously validated runtime out of Lody. It records the user-selected `wibus` ownership and requires destination verification before source removal.

Revision note (2026-07-29 03:38Z): Recorded independent install, build, tests, format and package inspection; documented the Prettier, pnpm pack, and Cradle CLI discoveries; confirmed removal from Lody; and selected private visibility for the initial GitHub repository.
