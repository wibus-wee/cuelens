# `@wibus/interactive-film`

A standalone runtime for interactive product films: one playhead drives numeric animation tracks, narration beats, camera shots, and imperative cues against host-owned UI.

The package is intentionally not a scene renderer. Your application renders the real product surface (or a fixture-backed version of it); this package supplies deterministic time, state derivation, cue semantics, and DOM framing.

This repository is independent from Lody. Lody supplied the original production case study, but the runtime has its own toolchain, tests, build output, and package boundary.

## Install

```sh
pnpm add @wibus/interactive-film
```

React hosts import the optional `@wibus/interactive-film/react` entry and provide their own compatible React installation.

## Package boundaries

The root export has no React dependency:

- typed film definitions;
- numeric keyframe interpolation;
- definition validation;
- an external-store playback clock;
- cue crossing and replay behavior;
- camera geometry, spring physics, DOM anchor measurement, and transform application.

`@wibus/interactive-film/react` adds:

- `FilmProvider`;
- `useFilmClock()` and `useFilmClockSnapshot()`;
- `useFilmFrame()`;
- `useFilmCues()`;
- `useFilmCamera()`;
- `FilmAnchor`.

Audio, localization, product fixtures, Electron windows, cursor artwork, and the meaning of a cue stay in the host. That keeps the runtime useful outside Lody.

## Define a film

```ts
import { defineFilm } from '@wibus/interactive-film';

export const tour = defineFilm({
  duration: 12,
  tracks: {
    rows: [
      { time: 0, value: 1 },
      { time: 4, value: 4, easing: 'easeOutCubic' },
    ],
    panel: [
      { time: 0, value: 0 },
      { time: 7, value: 0 },
      { time: 8, value: 1, easing: 'easeInOutCubic' },
    ],
  },
  beats: [
    {
      id: 'desk',
      at: 0,
      title: 'The whole workspace',
      shot: { anchor: 'window', padding: 64, minScale: 0.3 },
    },
    {
      id: 'run',
      at: 3,
      title: 'A task starts here',
      shot: { anchor: 'composer', padding: 180, maxScale: 1.6 },
    },
    {
      id: 'inspect',
      at: 7,
      title: 'Inspect the result in place',
      shot: { anchor: 'side-panel', padding: 80, maxScale: 1.8 },
    },
  ],
  cues: [
    { id: 'send', at: 4.2, anchor: 'send-button', lead: 0.8, kind: 'click' },
    { id: 'open-panel', at: 7.4, anchor: 'changes-tab', lead: 0.7, kind: 'click' },
  ],
});
```

`defineFilm()` preserves literal track, beat, cue, and anchor names for TypeScript. Run `validateFilm(tour)` in tests or in an authoring tool before playback.

## Mount the React runtime

```tsx
import { useMemo, useRef } from 'react';
import { frameAt } from '@wibus/interactive-film';
import {
  FilmProvider,
  useFilmCamera,
  useFilmClock,
  useFilmClockSnapshot,
  useFilmCues,
} from '@wibus/interactive-film/react';
import { tour } from './tour';

export function ProductFilm() {
  return (
    <FilmProvider definition={tour} onComplete={() => console.log('finished')}>
      <FilmStage />
    </FilmProvider>
  );
}

function FilmStage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const clock = useFilmClock();
  const snapshot = useFilmClockSnapshot();
  const frame = useMemo(() => frameAt(tour, snapshot.time), [snapshot.time]);

  useFilmCamera({ viewportRef, stageRef });
  useFilmCues({
    onCue: (cue) => {
      // The host decides whether this dispatches a real click, calls an app
      // command, plays Foley, or only points at the target.
      console.log('cue', cue.id);
    },
  });

  return (
    <div ref={viewportRef} style={{ position: 'absolute', inset: 0, overflow: 'clip' }}>
      <div ref={stageRef} style={{ width: 1800, height: 1100 }}>
        <RealProductFixture
          visibleRows={Math.floor(frame.values.rows)}
          panelOpen={frame.values.panel > 0.02}
        />
      </div>
      <button onClick={snapshot.playing ? clock.pause : clock.play}>
        {snapshot.playing ? 'Pause' : 'Play'}
      </button>
    </div>
  );
}
```

Mark existing product nodes without wrapping them:

```tsx
import { filmAnchorProps } from '@wibus/interactive-film';

<section {...filmAnchorProps('composer')}>...</section>;
```

Use `FilmAnchor` only when a wrapper `div` is semantically harmless.

## Playback and cue rules

- Natural playback fires a cue once when the playhead crosses it.
- Forward seek does not fire crossed cues. The host must reconstruct visible state from `frameAt()`.
- Backward seek re-arms cues after the destination so replaying that section behaves normally.
- Restart re-arms every cue.
- Looping fires end-of-film cues before start-of-film cues.
- The clock accepts an injected `FrameDriver`, so tests never need real sleeps.

These rules matter because a scrubber is not a very fast user. Seeking across five cue points must not click five real controls or play five sounds in a burst.

## Rendering budget

`useFilmFrame()` updates on each clock tick. Keep it in a small conductor and quantize values before passing them into a large product tree. Prefer:

- direct DOM transforms for camera and cursor motion;
- CSS transitions for compositor-friendly entrances;
- integers or coarse thresholds for list membership and panel presence;
- refs for typewriter text or other fine-grained writes;
- one persistent expensive canvas/WebGL instance rather than one per scene.

The package's `useFilmCamera()` already follows this rule: it reads the clock imperatively and writes only the stage transform, so the camera can settle while story time is paused without re-rendering React at 60 fps.

## What is deliberately not included

- A visual editor or recorder.
- A built-in fake product UI.
- Synthetic click dispatch. A host should explicitly decide which cues may operate real controls.
- A ghost cursor renderer.
- Music or sound effects.
- JSON schema/version migration tooling.
- Electron or native window lifecycle.

Those are adapters or creator features. The detailed extraction and creator design lives in `docs/architecture/interactive-onboarding-film.md`.

## Verification

From the repository root:

```sh
pnpm install
pnpm check
pnpm pack
```

`pnpm check` type-checks source, runs the deterministic suite, builds publishable ESM and declaration files into `dist/`, and verifies formatting. `pnpm pack` runs the build again and prints the exact npm tarball contents; generated `.tgz` files are ignored by Git. The tests use Node's built-in runner and a fake frame driver. They cover interpolation, validation, frame derivation, playback, pause/seek/rate/loop behavior, cue replay rules, and camera geometry/physics.
