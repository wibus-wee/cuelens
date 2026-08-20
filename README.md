# `@wibus/interactive-film`

A typed runtime for interactive product films. One playhead drives numeric
tracks, narrative beats, camera shots, and host-owned cues against real DOM UI.

The package is a director, not a scene renderer. Your application owns the
product UI, fixtures, audio, cursor, commands, and navigation. The runtime owns
deterministic time, state derivation, cue replay rules, and camera framing.

## Install

```sh
pnpm add @wibus/interactive-film
```

React is a peer dependency. React hosts use the separate React entry:

```sh
pnpm add react @wibus/interactive-film
```

**AI install prompt:** `Install @wibus/interactive-film in this project, then read node_modules/@wibus/interactive-film/install.md and node_modules/@wibus/interactive-film/dist/docs/usage.md before integrating the appropriate runtime mode into the existing UI.`

## Choose a mode

| Mode                  | Use it when                                                       | Main API                                                                        |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Automatic timeline    | Playback, seeking, tracks, beats, and cues follow one clock.      | `defineFilm()`, `FilmProvider`, `useFilmFrame()`, `useFilmCamera()`             |
| Host-controlled steps | A wizard, form, or onboarding flow decides when the shot changes. | `defineFilmSteps()`, `FilmStepProvider`, `useFilmStep()`, `useFilmStepCamera()` |
| Core only             | A non-React host needs timing, cue, or camera primitives.         | Root export only                                                                |

## Minimal automatic film

```tsx
import { defineFilm, filmAnchorProps } from '@wibus/interactive-film';
import {
  FilmProvider,
  useFilmCamera,
  useFilmClock,
  useFilmClockSnapshot,
  useFilmFrame,
} from '@wibus/interactive-film/react';
import { useRef } from 'react';

const film = defineFilm({
  duration: 8,
  tracks: {
    rows: [
      { time: 0, value: 1 },
      { time: 5, value: 4, easing: 'easeOutCubic' },
    ],
  },
  beats: [
    { id: 'wide', at: 0, title: 'Workspace', shot: { anchor: 'window' } },
    { id: 'write', at: 3, title: 'Composer', shot: { anchor: 'composer', maxScale: 1.5 } },
  ],
  cues: [{ id: 'send', at: 5.5, anchor: 'send', kind: 'press' }],
});

function Stage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const clock = useFilmClock();
  const snapshot = useFilmClockSnapshot();
  const frame = useFilmFrame();

  useFilmCamera({
    viewportRef,
    stageRef,
    fallbackRect: { x: 0, y: 0, width: 1600, height: 1000 },
    hideUntilReady: true,
  });

  return (
    <div ref={viewportRef} style={{ position: 'relative', overflow: 'clip' }}>
      <div ref={stageRef} style={{ width: 1600, height: 1000 }}>
        <main {...filmAnchorProps('window')}>
          <textarea {...filmAnchorProps('composer')} />
          <button {...filmAnchorProps('send')}>Send</button>
          <output>{Math.floor(frame.values.rows)} rows</output>
        </main>
      </div>
      <button onClick={snapshot.playing ? clock.pause : clock.play}>
        {snapshot.playing ? 'Pause' : 'Play'}
      </button>
    </div>
  );
}

export function Demo() {
  return (
    <FilmProvider definition={film} autoPlay={false}>
      <Stage />
    </FilmProvider>
  );
}
```

## Documentation

| Document                                                                         | Purpose                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`install.md`](install.md)                                                       | Installation workflow for developers and coding agents.                                                       |
| [`docs/usage.md`](docs/usage.md)                                                 | Authoritative installation, automatic and step modes, camera lifecycle, cues, performance, and testing guide. |
| [`docs/architecture/interactive-film.md`](docs/architecture/interactive-film.md) | Runtime boundaries, data flow, camera design, and future Creator architecture.                                |
| [`playground/`](playground/)                                                     | Independent Vite app for guided shots, timeline playback, JSON authoring, and camera diagnostics.             |

Published packages include this documentation under `dist/docs/`. An AI or
developer inspecting an installed dependency should start at:

```text
node_modules/@wibus/interactive-film/dist/docs/README.md
```

The complete Usage guide has one source owner in `docs/usage.md`; this README is
only the package entry point and quick start.

## Playground

The playground has its own package manifest and lockfile, so this repository is
not a monorepo.

```sh
cd playground
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173/`. Guided mode exercises host-owned steps, Timeline
mode exercises the automatic runtime, and Studio combines CodeMirror JSON with
visual tracks, keyframes, beats, shots, cues, validation, and live preview.

## Verify a release

```sh
pnpm install
pnpm check
pnpm pack
```

`pnpm build` emits ESM, declarations, source maps, and public documentation at
`dist/docs/`. Historical execution plans remain repository-only. `pnpm pack`
runs that build again and creates the same file set npm will publish.
