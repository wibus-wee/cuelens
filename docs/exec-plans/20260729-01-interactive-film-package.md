# Extract an interactive film toolkit without changing Lody onboarding

This is the historical extraction plan. The runtime was subsequently moved to a
standalone repository and is now published as `@wibus/cuelens` from
`wibus-wee/cuelens`. The paths and intermediate package name below are retained
as migration history.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It follows `/Users/wibus/.agents/skills/execplan/references/PLANS.md`; that file is outside the repository, so the rules needed to continue are repeated here: keep this plan self-contained, record decisions and discoveries as they happen, name exact files and commands, and require observable behavior rather than compilation alone.

## Purpose / Big Picture

After this work, a developer can describe an interactive product film as data instead of coordinating several React timers. One definition owns numeric animation tracks, narration beats, camera shots, and interaction cues. A reusable clock can play, pause, seek, restart, change rate, and loop that definition. A DOM camera can frame real product nodes, and a React adapter can expose the clock without coupling the engine to Lody, Jotai, Electron, Tailwind, Web Audio, or the current onboarding components.

The existing Lody onboarding remains byte-for-byte untouched. The implementation is additive: `packages/interactive-film/` contains the package, and `docs/architecture/interactive-onboarding-film.md` explains both the current Lody system and how to build future films or a visual authoring tool on top of the new package.

## Progress

- [x] (2026-07-29 03:05Z) Read the repository rules, Electron onboarding notes, current timeline, camera, cursor, audio, fixture, and real-product composition code.
- [x] (2026-07-29 03:05Z) Chose an additive package boundary that leaves all current Lody onboarding files unchanged.
- [x] (2026-07-29 03:12Z) Implemented the pure timeline, definition, validation, clock, cue, and camera modules under `packages/interactive-film/src/`.
- [x] (2026-07-29 03:12Z) Implemented the optional React adapter and a typed example definition in `packages/interactive-film/README.md`.
- [x] (2026-07-29 03:12Z) Added 12 deterministic tests for interpolation, clock transitions, cue replay rules, validation, and camera behavior.
- [x] (2026-07-29 03:12Z) Wrote the detailed architecture analysis and future visual creator design in `docs/architecture/interactive-onboarding-film.md`.
- [x] (2026-07-29 03:18Z) Ran package tests, package typecheck, formatting checks, and `git diff --check`; all passed.

## Surprises & Discoveries

- Observation: Lody already has a useful numeric timeline primitive, but it lives under `packages/components/src/lib/motion/` and the production tour adds essential semantics outside it.
  Evidence: `tour-stage.tsx` separately handles entrance-time offset, state restoration after seek, cue crossing, quantization, sound crossing, and camera/cursor motion.

- Observation: the most important reuse boundary is not the rendered scene component.
  Evidence: `tour-app.tsx` deliberately mounts real Lody components with fixture providers, while `tour-script.ts` is product-neutral timing data. Moving the real UI into a toolkit would invert ownership and make the toolkit Lody-specific.

- Observation: story time and physical animation time must be separate while sharing one source of truth.
  Evidence: `use-tour-motion.ts` reads the master playhead for targets and cue crossings, but runs the camera spring on its own `requestAnimationFrame` so the camera can settle while playback is paused.

- Observation: Node's experimental TypeScript stripping follows native ESM resolution and therefore does not infer a `.ts` suffix for source imports.
  Evidence: package source exports use explicit imports such as `export * from './camera.ts'`, and the test command succeeds directly under Node without a build step.

- Observation: adding a workspace package with React as a peer still requires package-local dependency links before `tsgo` can resolve its React adapter.
  Evidence: `pnpm install --filter @wibus/interactive-film --lockfile=false --offline --ignore-scripts` created local links to the repository's existing React and `@types/react` installations while leaving `pnpm-lock.yaml` untouched by this work.

- Observation: the current tour describes user-input arbitration for its ghost cursor, but does not implement that state yet.
  Evidence: `tour-stage.tsx` still passes `cursorEnabled: playing`; no `event.isTrusted` state temporarily yields control to a real user. The architecture document records this as a current gap rather than claiming it is solved by the package.

## Decision Log

- Decision: Create `@wibus/interactive-film` as a new, dependency-light package and do not migrate current onboarding onto it in this change.
  Rationale: The user explicitly asked not to alter current Lody content. An additive package proves the extraction boundary without risking the working tour.
  Date/Author: 2026-07-29 / Codex

- Decision: Keep product rendering, fixtures, copy localization, audio synthesis, and Electron window orchestration outside the package.
  Rationale: Those are host adapters. The reusable contract is time, state derivation, cue crossing, and framing of host-owned DOM nodes.
  Date/Author: 2026-07-29 / Codex

- Decision: Treat forward seek as state reconstruction, not as natural playback, so it does not fire every crossed click or sound. Treat backward seek as re-arming future cues.
  Rationale: This matches the hard-won Lody behavior: a scrub should restore the visible snapshot declaratively and must not burst through a chain of synthetic user actions.
  Date/Author: 2026-07-29 / Codex

- Decision: Use an external-store clock with an injectable frame driver.
  Rationale: React consumers can subscribe narrowly through `useSyncExternalStore`, while tests advance a fake driver without sleeps or wall-clock races.
  Date/Author: 2026-07-29 / Codex

## Outcomes & Retrospective

The additive extraction is complete. `@wibus/interactive-film` now provides a React-independent runtime for typed definitions, tracks, beats, shots, cues, validation, deterministic playback, cue replay rules, and camera geometry and spring motion. The separate React entry provides narrow subscriptions, a provider, cue integration, DOM anchors, and imperative camera motion. Twelve deterministic tests pass, the package type-checks, all new files satisfy repository formatting, and `git diff --check` reports no whitespace errors.

The result deliberately stops at the runtime kernel. It does not yet provide the visual Creator, JSON schema migrations, a recorder, audio, cursor rendering, synthetic click policy, Electron lifecycle, or product fixtures. The architecture document specifies how those host and authoring layers should sit above this stable runtime. Existing Lody onboarding source remains unchanged, so adopting the package can be a separate migration with visual regression coverage rather than an implicit part of this extraction.

## Context and Orientation

The current implementation is split across two layers. `packages/components/src/lib/motion/timeline.ts` evaluates named numeric tracks, and `packages/components/src/lib/motion/use-timeline.ts` owns a React-driven animation clock. The product film is authored in `packages/components/src/components/onboarding/tour/tour-script.ts`: `TOUR_TRACKS` controls continuous or fractional state, `TOUR_BEATS` supplies narration and camera shots, and `TOUR_CUES` describes real interactions at exact times.

`packages/components/src/components/onboarding/tour/tour-stage.tsx` is the conductor. It reads one playhead, derives a current beat, quantizes values before passing them to the large product tree, restores state after a seek, and maps cue and state crossings to sound. `packages/components/src/components/onboarding/tour/use-tour-motion.ts` is the imperative motion lane: it measures DOM anchors, applies camera transforms without React renders, moves a ghost cursor, and dispatches a browser-like pointer/mouse/click sequence. `packages/components/src/components/onboarding/tour/tour-app.tsx` is the host adapter: it mounts real Lody product components with deterministic fixture data. `packages/components/src/components/onboarding/ceremony/intro-sequence.tsx` uses discrete cuts and compositor CSS rather than the continuous tour timeline. `apps/electron/src/main/onboarding-window.ts` and the renderer entry coordinate a hidden, opacity-zero native window with a React-ready handshake before the first animation starts.

In the new package, a “track” is a sorted list of numeric keyframes. A “beat” is a time-indexed narrative unit and optional camera shot. A “cue” is an imperative event that may run during natural playback. A “frame” is the complete declarative snapshot derived for one playhead time. An “anchor” is a stable string that identifies a host DOM node. The host owns what that node renders and what a cue means.

## Plan of Work

Create `packages/interactive-film/package.json` and `tsconfig.json` with source exports for the pure core and a separate React entry. Do not add runtime dependencies to the core. React is an optional peer used only by `src/react.tsx`.

Implement `src/easing.ts` and `src/timeline.ts` for typed numeric keyframes. Implement `src/definition.ts` for `defineFilm`, `frameAt`, beat lookup, duration calculation, and validation that rejects negative duration, unsorted/out-of-range beats and cues, duplicate IDs, and unsorted track keyframes.

Implement `src/clock.ts` as an external store. It emits transitions with explicit reasons (`tick`, `seek`, `restart`, `play`, `pause`, `rate`) and supports an injected animation driver. Implement `src/cues.ts` so natural ticks fire crossed cues once, backward seek re-arms future cues, forward seek stays silent, restart re-arms all cues, and looping handles the end and beginning segments in order.

Implement `src/camera.ts` as pure geometry plus a DOM adapter. It resolves `[data-film-anchor]`, reverses the currently applied stage scale when measuring, fits rather than crops, caps magnification, integrates scale in logarithmic space, clamps large frame deltas, and writes one transform to the stage element.

Implement `src/react.tsx` with a provider, narrow clock snapshot hook, derived frame hook, cue hook, and `FilmAnchor`. Do not place the full product subtree under a hook that must render at 60 fps; documentation and examples must show quantization or imperative DOM writes for high-frequency effects.

Add tests under `packages/interactive-film/tests/` using Node's built-in test runner and an injected fake animation driver. Add `README.md` with a small typed example. Write `docs/architecture/interactive-onboarding-film.md` as the long-form technical analysis, including current file ownership, execution sequence, performance model, interaction semantics, audio and Electron concerns, package mapping, an authoring workflow, and the architecture of a later visual creator.

## Concrete Steps

Work from `/Users/wibus/dev/lody/lody`.

Create the package and documentation with additive patches. Then run:

    pnpm --filter @wibus/interactive-film typecheck
    pnpm --filter @wibus/interactive-film test
    pnpm exec prettier --check packages/interactive-film docs/architecture/interactive-onboarding-film.md docs/exec-plans/20260729-01-interactive-film-package.md
    git diff --check

The test command should report all package tests passing without network access, browser automation, real timers, or changes to the existing onboarding implementation.

## Validation and Acceptance

The package is accepted when a sample film definition can be evaluated at arbitrary times, a fake frame driver can deterministically play it to completion, pause and seek it, and cue tests prove that forward seek does not synthesize clicks while rewind allows later natural playback to fire them again.

Camera tests must prove that a wide subject is width-limited, a tall subject is height-limited, a small node respects `maxScale`, the first target is adopted without an entrance swoop, later targets are approached without teleportation, and a large resumed-frame delta remains finite.

Repository acceptance requires that `git status --short` shows only newly added package/documentation files in addition to the user's pre-existing `packages/acp-extension-claude`, `packages/acp-extension-codex`, and `pnpm-lock.yaml` changes. No existing onboarding source file may be modified.

## Idempotence and Recovery

All work is additive. Tests use a fake animation driver and can be repeated without cleanup. No migration, generated binary, server, or persistent user data is involved. If an implementation attempt fails, edit only files under `packages/interactive-film/` or the two new documentation paths. Do not reset the repository or touch the pre-existing dirty files.

## Artifacts and Notes

The key current architecture relation is:

    one playhead
      -> numeric tracks -> declarative product state
      -> beats          -> narration + camera target
      -> cues           -> real host interactions
      -> crossings      -> sound punctuation

    independent frame loop
      -> reads current playhead
      -> measures current DOM anchor
      -> integrates camera/cursor physics
      -> writes transforms directly to DOM

This distinction must remain visible in both the package API and the architecture document.

Final verification from `/Users/wibus/dev/lody/lody` produced:

    $ pnpm --filter @wibus/interactive-film typecheck
    > tsgo --noEmit
    # exit 0

    $ pnpm --filter @wibus/interactive-film test
    # tests 12, pass 12, fail 0

    $ pnpm exec prettier --check packages/interactive-film docs/architecture/interactive-onboarding-film.md docs/exec-plans/20260729-01-interactive-film-package.md
    All matched files use Prettier code style!

    $ git diff --check
    # no output, exit 0

## Interfaces and Dependencies

The pure package root must export at least these interfaces:

    type FilmDefinition<Track, BeatId, Anchor, CuePayload>
    type FilmFrame<Track, BeatId, Anchor>
    function defineFilm(input): FilmDefinition
    function validateFilm(definition): FilmValidationIssue[]
    function frameAt(definition, time): FilmFrame

    interface FilmClock {
      getSnapshot(): FilmClockSnapshot
      subscribe(listener): () => void
      subscribeTransitions(listener): () => void
      play(): void
      pause(): void
      seek(time): void
      restart(): void
      setPlaybackRate(rate): void
      destroy(): void
    }

    function createFilmClock(options): FilmClock
    function createCueController(options): CueController
    function solveCameraPose(rect, viewport, shot): CameraPose
    function stepCamera(motion, target, deltaSeconds): CameraMotion

The React entry at `@wibus/interactive-film/react` must export `FilmProvider`, `useFilmClock`, `useFilmClockSnapshot`, `useFilmFrame`, `useFilmCues`, and `FilmAnchor`. React and React DOM are host concerns; the core package must not import them.

Revision note (2026-07-29): Initial plan created after inspecting the current Lody onboarding film. The scope is additive extraction plus detailed documentation, explicitly excluding migration of the existing flow.

Revision note (2026-07-29 03:18Z): Marked the additive runtime and architecture analysis complete, recorded Node ESM and package-linking discoveries, documented the current cursor-arbitration gap, and added final verification evidence.
