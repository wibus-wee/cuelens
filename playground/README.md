# Interactive Film Playground

An independent Vite and React application for exercising the package's camera runtime against a fixture-backed product surface. It is a nested folder, not a pnpm workspace member, and it owns its package manifest, lockfile, dependencies, build, and browser tests.

## Surface map

| Area            | Responsibility                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Guided mode     | Drives four authored shots, direct navigation, and reset through `FilmStepProvider`.                             |
| Timeline mode   | Drives tracks, beats, cues, seek, rate, and camera motion through `FilmProvider`.                                |
| Studio mode     | Visually edits tracks, keyframes, beats, camera shots, and cues, with a synchronized CodeMirror view.            |
| Runtime lab     | Exposes autoplay, loop, completion, resolver, fallback geometry, easing curves, cues, and frame values.          |
| Product stage   | Renders deterministic film-review fixtures with stable authored dimensions and live DOM anchors.                 |
| Camera controls | Switch viewport presets, reveal anchor diagnostics, edit fallback geometry, and request explicit re-measurement. |
| Browser checks  | Verifies authoring, camera motion, playback semantics, image loading, and desktop/mobile overflow.               |

## Run locally

The playground consumes the parent package through `link:..`. Its `dev` and `build` commands rebuild the parent runtime first, so the application tests the package's emitted public exports rather than importing source files through a Vite alias.

From this directory:

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173/`.

## Author in Studio

1. Open **Studio**. **Visual** is the default authoring view; choose Tracks, Beats, or Cues and select an item from the list or timeline.
2. Edit the visible fields. Valid visual changes update the shared JSON definition and live runtime immediately. Selecting a beat or cue also seeks and pauses the preview at that time.
3. Switch to **Code** for direct JSON editing. Code changes remain drafts until they pass structural and package validation and **Apply** is pressed.

The validation status and inspector identify a blocked draft. **Reset** restores the fixture definition, runtime options, and fallback geometry.

A fresh clone also needs the parent package dependencies installed once:

```sh
cd ..
pnpm install
cd playground
pnpm install
```

## Commands

| Command          | Result                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`       | Builds the parent runtime and starts Vite on port 4173.                      |
| `pnpm typecheck` | Type-checks the playground without emitting files.                           |
| `pnpm build`     | Builds the parent runtime, type-checks, and emits the production playground. |
| `pnpm test:e2e`  | Starts or reuses the dev server and runs the Playwright camera smoke tests.  |
| `pnpm preview`   | Serves the latest production playground build.                               |

## Ownership

The runtime package owns time, steps, cue semantics, validation, camera geometry, and camera lifecycle. The playground owns the product fixture, authored shots, editor state, UI projection, controls, styling, and visual assets. Nothing under this folder is included in the package tarball because the parent package publishes only `dist`, `README.md`, and `LICENSE`.

Visual and Code views edit one JSON draft. Visual controls serialize each mutation and apply it when both structural and package validation pass. CodeMirror may hold incomplete JSON without replacing the last runnable definition; Apply remains disabled until that draft passes both validation layers. This keeps the preview alive while code is being typed without allowing the two authoring views to diverge.

The camera owns the stage's inline `transform` and `transform-origin`. The fixture therefore gives the stage fixed `1440 x 900` authored dimensions and places it inside an `overflow: clip` viewport. The local fallback rectangle matches the product window and is used only before a live anchor can be measured.

## Visual asset

`public/storyboard-road.jpg` is a local copy of [Unsplash image `photo-1500530855697-b586d89ba3ee`](https://images.unsplash.com/photo-1500530855697-b586d89ba3ee), used under the Unsplash license. Keeping it local makes camera and screenshot checks deterministic after installation.
