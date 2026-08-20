# Contributing

Contributions to `@wibus/interactive-film` should preserve the package's role as
a product-neutral runtime. Product components, fixtures, localization, audio,
navigation, privileged commands, and network access belong in host
applications.

## Repository map

| Area          | Responsibility                                                | Primary check                    |
| ------------- | ------------------------------------------------------------- | -------------------------------- |
| `src/`        | Core runtime and optional React adapter.                      | `pnpm check`                     |
| `tests/`      | Deterministic Node tests against observable contracts.        | `pnpm test`                      |
| `docs/`       | Usage and architecture documentation copied into the package. | `pnpm check:package`             |
| `playground/` | Independent React application and browser coverage.           | `pnpm --dir playground test:e2e` |

The playground is intentionally not a workspace member. It has its own package
manifest and lockfile while consuming the parent package through `link:..`.

## Set up the package

Use Node.js 22 or newer and the pnpm version declared in `package.json`:

```sh
corepack enable
pnpm install
pnpm check
```

`pnpm check` type-checks source, runs deterministic tests, builds the publishable
package, audits the npm file list, and checks formatting.

## Set up the playground

```sh
cd playground
pnpm install
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The build and browser commands rebuild the parent runtime first. Browser tests
may create ignored screenshots and reports under `playground/test-results/` and
`playground/playwright-report/`.

## Change requirements

- Preserve the root entry's independence from React. React integrations belong
  in `src/react.tsx` and the `@wibus/interactive-film/react` entry.
- Keep one progression owner for a flow. Automatic clocks and host-controlled
  step controllers must not compete for the same state.
- Keep forward seek silent and reconstruct visible state declaratively. Rewind
  must re-arm future cues.
- Use stable host-owned anchors. Styling classes and positional selectors are
  not durable runtime contracts.
- Keep per-frame camera writes outside large React render trees.
- Add deterministic tests without real sleeps, wall-clock races, network
  access, or scheduler assumptions.
- Update `docs/usage.md` for public contracts and
  `docs/architecture/interactive-film.md` for ownership or design changes.

## Pull requests

Keep each pull request focused on one behavior or documentation concern.
Describe the user-visible result, affected entry points, and verification
performed. Include browser tests or screenshots only when real layout or visual
behavior is part of the contract.

By contributing, you agree that your contribution is licensed under the
repository's MIT License.
