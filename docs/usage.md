# Usage

This is the authoritative consumer guide for `@wibus/cuelens`. It
covers the public runtime and React adapter; product rendering and visual
authoring remain host concerns.

## Install and imports

```sh
pnpm add @wibus/cuelens
```

The root entry has no React dependency:

```ts
import {
  createSequenceClock,
  createSequenceStepController,
  defineSequence,
  defineSequenceSteps,
  cameraAnchorProps,
  frameAt,
  validateSequence,
  validateSequenceSteps,
} from '@wibus/cuelens';
```

React hosts install a compatible React version and import adapters separately:

```ts
import {
  CameraAnchor,
  SequenceProvider,
  SequenceStepProvider,
  useSequenceCamera,
  useSequenceClock,
  useSequenceClockSnapshot,
  useSequenceCues,
  useSequenceFrame,
  useSequenceStep,
  useSequenceStepCamera,
} from '@wibus/cuelens/react';
```

## Choose the control model

Use an automatic sequence when time is authoritative. Tracks, narration, shots, and
cues all derive from one clock, so play, pause, seek, rate changes, restart, and
loop stay aligned.

Use sequence steps when the host is authoritative. This fits onboarding forms and
wizards where navigation, validation, or async work decides when the user may
continue. A step may carry host-owned state and a camera shot, but it does not
create a playhead or dispatch product actions.

Do not mount both models merely to control the same flow. They share camera
primitives, but each model should have one clear owner.

## Define an automatic sequence

`defineSequence()` preserves literal names for tracks, beats, cues, and anchors.
Tracks contain numeric keyframes. Beats select narrative content and the current
camera shot. Cues identify imperative moments whose meaning belongs to the host.

```ts
import { defineSequence, validateSequence } from '@wibus/cuelens';

export const tour = defineSequence({
  duration: 12,
  tracks: {
    visibleRows: [
      { time: 0, value: 1 },
      { time: 4, value: 4, easing: 'easeOutCubic' },
    ],
    panelOpen: [
      { time: 0, value: 0 },
      { time: 7, value: 0 },
      { time: 8, value: 1, easing: 'easeInOutCubic' },
    ],
  },
  beats: [
    {
      id: 'workspace',
      at: 0,
      title: 'The whole workspace',
      body: 'Start with the complete product context.',
      shot: { anchor: 'window', padding: 64, minScale: 0.3 },
    },
    {
      id: 'compose',
      at: 3,
      title: 'Write a task',
      shot: {
        anchor: 'composer',
        padding: 160,
        maxScale: 1.6,
        focusX: 0.62,
        focusY: 0.5,
      },
    },
    {
      id: 'inspect',
      at: 7,
      title: 'Inspect the result',
      shot: { anchor: 'side-panel', padding: 80, maxScale: 1.8 },
    },
  ],
  cues: [
    { id: 'send', at: 4.2, anchor: 'send-button', lead: 0.8, kind: 'press' },
    {
      id: 'open-panel',
      at: 7.4,
      anchor: 'changes-tab',
      lead: 0.7,
      kind: 'host-command',
      payload: { command: 'open-changes' },
    },
  ],
});

const issues = validateSequence(tour);
if (issues.length > 0) {
  throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
}
```

Keyframe easing describes the segment entering that keyframe. The runtime ships
named easing functions such as `linear`, `easeInCubic`, `easeOutCubic`, and
`easeInOutCubic`; the emitted declarations list the complete `EasingName` union.

`frameAt(tour, time)` clamps time into the sequence and returns `time`, `progress`,
all interpolated track `values`, the active `beat`, its index, and its `shot`.
Use it outside React or when reconstructing state after a seek.

## Mount the automatic React runtime

```tsx
import { cameraAnchorProps } from '@wibus/cuelens';
import {
  SequenceProvider,
  useSequenceCamera,
  useSequenceClock,
  useSequenceClockSnapshot,
  useSequenceCues,
  useSequenceFrame,
} from '@wibus/cuelens/react';
import { useRef } from 'react';
import { tour } from './tour';

export function ProductSequence() {
  return (
    <SequenceProvider
      definition={tour}
      autoPlay={false}
      loop={false}
      playbackRate={1}
      onComplete={() => console.log('finished')}
    >
      <SequenceStage />
    </SequenceProvider>
  );
}

function SequenceStage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const clock = useSequenceClock();
  const snapshot = useSequenceClockSnapshot();
  const frame = useSequenceFrame();

  useSequenceCamera({
    viewportRef,
    stageRef,
    fallbackRect: { x: 0, y: 0, width: 1800, height: 1100 },
    hideUntilReady: true,
  });

  useSequenceCues({
    onCue: (cue) => {
      // Resolve cue.kind through an explicit host allowlist. The runtime does
      // not synthesize clicks, mutate product state, or play sounds itself.
      console.log(cue.id, cue.kind, cue.payload);
    },
  });

  return (
    <div
      ref={viewportRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'clip' }}
    >
      <div ref={stageRef} style={{ width: 1800, height: 1100 }}>
        <ProductFixture
          visibleRows={Math.floor(frame.values.visibleRows)}
          panelOpen={frame.values.panelOpen > 0.02}
          windowProps={cameraAnchorProps('window')}
          composerProps={cameraAnchorProps('composer')}
        />
      </div>

      <nav>
        <button onClick={snapshot.playing ? clock.pause : clock.play}>
          {snapshot.playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => clock.seek(Math.max(0, snapshot.time - 2))}>Back 2s</button>
        <button onClick={() => clock.seek(Math.min(snapshot.duration, snapshot.time + 2))}>
          Forward 2s
        </button>
        <button onClick={clock.restart}>Restart</button>
        <button onClick={() => clock.setPlaybackRate(0.5)}>0.5x</button>
        <button onClick={() => clock.setPlaybackRate(1)}>1x</button>
        <button onClick={() => clock.setPlaybackRate(2)}>2x</button>
      </nav>
    </div>
  );
}
```

`SequenceProvider` creates and owns a clock unless `clock` is supplied. Its default
is `autoPlay: true`; set `autoPlay={false}` when the host presents an explicit
start control. An externally created clock lets non-React code coordinate the
same playback. The provider does not destroy an external clock.

`useSequenceClockSnapshot()` and `useSequenceFrame()` subscribe to every clock tick.
Keep them in a small conductor. `useSequenceClock()` only returns the stable control
object and does not itself subscribe.

## Drive host-controlled steps

```tsx
import { defineSequenceSteps, validateSequenceSteps } from '@wibus/cuelens';
import { SequenceStepProvider, useSequenceStep, useSequenceStepCamera } from '@wibus/cuelens/react';
import { useRef } from 'react';

const onboarding = defineSequenceSteps({
  steps: [
    {
      id: 'welcome',
      state: { screen: 'welcome', panelOpen: false },
      shot: { anchor: 'window', padding: 64 },
    },
    {
      id: 'workspace',
      state: { screen: 'workspace', panelOpen: false },
      shot: { anchor: 'workspace-row', zoom: 1.2, focusX: 0.62 },
    },
    {
      id: 'finish',
      state: { screen: 'finish', panelOpen: true },
      shot: { anchor: 'side-panel', maxScale: 1.7 },
    },
  ],
});

const issues = validateSequenceSteps(onboarding);
if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join('\n'));

function OnboardingStage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const step = useSequenceStep();

  useSequenceStepCamera({
    viewportRef,
    stageRef,
    fallbackRect: { x: 0, y: 0, width: 1800, height: 1100 },
    hideUntilReady: true,
  });

  return (
    <div ref={viewportRef} style={{ position: 'relative', overflow: 'clip' }}>
      <div ref={stageRef} style={{ width: 1800, height: 1100 }}>
        <ProductFixture state={step.step.state} />
      </div>
      <button disabled={step.index === 0} onClick={step.previous}>
        Back
      </button>
      <button disabled={step.index === onboarding.steps.length - 1} onClick={step.next}>
        Continue
      </button>
      <button onClick={() => step.goTo('workspace')}>Workspace</button>
      <button onClick={step.reset}>Start over</button>
    </div>
  );
}

export function Onboarding() {
  return (
    <SequenceStepProvider definition={onboarding} initialStep="welcome">
      <OnboardingStage />
    </SequenceStepProvider>
  );
}
```

`next()`, `previous()`, `goTo()`, and `reset()` return `true` only when they
change the active step. The snapshot also exposes `index`, `direction`,
transition `reason`, and `revision`. Use `createSequenceStepController()` or pass an
external `controller` to `SequenceStepProvider` when navigation must live outside
React.

## Mark and resolve camera anchors

Mark an existing node with `cameraAnchorProps()` so its semantics and layout do
not change:

```tsx
<section {...cameraAnchorProps('side-panel')}>...</section>
```

`CameraAnchor` is a convenience `div` from the React entry. Use it only when an
extra wrapper is semantically and visually harmless:

```tsx
<CameraAnchor anchor="composer">...</CameraAnchor>
```

The default resolver searches the stage for an exact `data-cuelens-anchor` value.
Dynamic lists, portals, or product-owned identity attributes can use a custom
resolver. Return `null` to fall back to the default marker search:

```tsx
const camera = useSequenceCamera({
  viewportRef,
  stageRef,
  resolveAnchor: (stage, anchor) => {
    if (anchor.startsWith('session:')) {
      const id = CSS.escape(anchor.slice('session:'.length));
      return stage.querySelector<HTMLElement>(`[data-session-id="${id}"]`);
    }
    return null;
  },
  fallbackRect: (stage) => ({ x: 0, y: 0, width: stage.offsetWidth, height: stage.offsetHeight }),
});
```

Call `camera.refresh()` after geometry changes that `ResizeObserver` and DOM
mutation observation cannot detect, such as a canvas-internal layout change or
an external portal affecting an authored fallback rectangle.

## Camera layout and lifecycle

The viewport and stage form a strict contract:

- Give the stage stable authored dimensions. The camera owns its inline
  `transform` and `transform-origin`.
- Put `overflow: clip` on the viewport. `overflow: hidden` creates a scroll
  container whose offsets can make a correct pose appear displaced.
- Make the viewport's rendered width and height non-zero.
- Keep anchors inside the stage coordinate system when possible. A custom
  resolver may find other elements, but measurement is still relative to the
  transformed stage.
- Supply `fallbackRect` when the current anchor may mount late or temporarily
  have a zero-size layout box.

Both React camera hooks calculate the first valid pose during browser layout.
`hideUntilReady` conceals the stage until that transform is applied, then
restores its previous inline visibility. `onReady(pose)` runs once for each
newly mounted stage after its first valid pose.

Later shot and product-state changes preserve camera position and velocity, so
an in-flight camera curves toward the new subject instead of restarting. The
camera measures transform-aware DOM geometry, fits the complete subject,
integrates zoom in log space, settles to the exact target, and idles when no
animation or relevant DOM activity remains.

Shot controls are:

| Property                | Meaning                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `anchor`                | Stable host-owned subject name.                                        |
| `padding`               | Minimum viewport breathing room before fitting.                        |
| `minScale` / `maxScale` | Bounds that prevent unusable wide shots or extreme magnification.      |
| `zoom`                  | Multiplier relative to the fitted scale.                               |
| `focusX` / `focusY`     | Subject placement in the viewport from `0` to `1`; defaults to center. |

## Cue, seek, restart, and loop semantics

`useSequenceCues()` and `createCueController()` implement event crossing, not state
reconstruction:

- Natural playback fires a cue once when the playhead crosses it.
- Forward seek does not fire crossed cues.
- Backward seek re-arms cues after the destination.
- Restart re-arms every cue but does not fire one until playback crosses it.
- A looping tick fires end-of-sequence cues before clearing the fired set and
  then fires start-of-sequence cues.
- Play, pause, and playback-rate changes do not fire cues by themselves.

This prevents a scrub from clicking five controls or playing five sounds in a
burst. The host must derive visible state declaratively from `frameAt()` after a
seek. For example, a panel opened by a natural cue should also have a
time-to-panel-state projection so seeking past that cue shows the correct
result without replaying the command.

Treat cue execution as a security and product boundary. Resolve cue kinds
through an explicit allowlist, and do not synthesize destructive, billing,
network, or user-data mutations merely because an authored cue names a DOM
node.

## Validation and authoring failures

Run `validateSequence()` or `validateSequenceSteps()` before mounting authored data.
Validation returns path-addressed issues; it does not throw or repair input.
Automatic validation covers duration, ordering, time ranges, duplicate IDs,
track bounds, and cue lead time. Step validation covers empty definitions,
empty IDs, and duplicate IDs.

`defineSequence()` and `defineSequenceSteps()` are compile-time literal-preserving
helpers, not runtime validators. A JSON editor should parse into a draft, run
structural checks and the package validator, and replace the live definition
only when every check succeeds. Keep the last valid definition mounted while an
invalid draft is being edited.

The package does not provide a JSON schema, schema migration, persistence,
undo/redo, recorder, or published visual editor. The repository playground is
an authoring lab, not a runtime export.

## Performance and host ownership

`useSequenceFrame()` renders its caller on every clock tick. Keep that hook in a
small conductor and quantize values before passing them into a large product
tree:

```ts
const frame = useSequenceFrame();
const productState = {
  visibleRows: Math.floor(frame.values.visibleRows),
  panelOpen: frame.values.panelOpen > 0.02,
};
```

Prefer direct DOM transforms for per-frame camera or cursor motion, CSS for
compositor-friendly entrances, refs for fine-grained typewriter output, and
coarse thresholds for structural UI changes. Keep expensive canvas or WebGL
instances mounted instead of remounting them per beat.

The host owns product components, fixture data, localization, audio, ghost
cursor visuals, cue command policy, Electron/native lifecycle, navigation, and
the declarative state projection required after seeking. The runtime never
connects to product backends or user data by itself.

## Deterministic clock tests

Inject a `FrameDriver` into `createSequenceClock()` so tests control time without
sleeping or depending on scheduler timing:

```ts
import { createSequenceClock, type FrameDriver } from '@wibus/cuelens';

function createTestDriver() {
  let now = 0;
  let nextHandle = 1;
  const callbacks = new Map<number, (time: number) => void>();

  const driver: FrameDriver = {
    now: () => now,
    request: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => callbacks.delete(handle as number),
  };

  return {
    driver,
    step(milliseconds: number) {
      now += milliseconds;
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(now);
    },
  };
}

const test = createTestDriver();
const clock = createSequenceClock({ duration: 2, autoPlay: false, driver: test.driver });

clock.play();
test.step(0); // Establish the first frame timestamp.
test.step(500);
console.assert(clock.getSnapshot().time === 0.5);
clock.destroy();
```

Test cue crossing with the same driver. Test camera geometry through the pure
functions exported from the root entry, and reserve browser automation for
layout, observer, and visual behavior that requires a real DOM.

## Installed documentation

The published package contains the installation guide, this Usage guide, the
documentation index, and architecture analysis under:

```text
node_modules/@wibus/cuelens/dist/docs/
```

Coding agents should begin with `dist/docs/README.md`, then read this Usage guide
and the emitted `.d.ts` files before changing an integration.
