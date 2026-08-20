# Cuelens architecture

This document describes the current architecture of
`@wibus/cuelens`, the constraints that keep it reusable, and the
intended shape of a future visual authoring tool.

An interactive film is not a video file or a scene renderer. The host renders
real React or DOM product surfaces, usually against deterministic fixture data.
The runtime supplies a common time model, derived state, cue crossing rules, and
a camera that frames host-owned DOM anchors.

## System map

| Area                    | Owner                                                                                      | Responsibility                                                                                  | Depends on                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Definition and timeline | [`src/definition.ts`](../../src/definition.ts), [`src/timeline.ts`](../../src/timeline.ts) | Preserve authored tracks, beats, shots, and cues; derive a frame for any time.                  | Easing registry only.                                       |
| Automatic clock         | [`src/clock.ts`](../../src/clock.ts)                                                       | Play, pause, seek, restart, change rate, loop, and publish deterministic transitions.           | An injectable frame driver.                                 |
| Cue controller          | [`src/cues.ts`](../../src/cues.ts)                                                         | Fire natural crossings once and re-arm them correctly after rewind, restart, or loop.           | Clock transitions.                                          |
| Step controller         | [`src/steps.ts`](../../src/steps.ts)                                                       | Expose deterministic host-controlled navigation without creating a playhead.                    | A step definition.                                          |
| Camera core             | [`src/camera.ts`](../../src/camera.ts)                                                     | Resolve and measure anchors, solve fit geometry, integrate spring motion, and apply transforms. | Browser DOM only for measurement and transform application. |
| React adapter           | [`src/react.tsx`](../../src/react.tsx)                                                     | Provide external stores through React and run camera motion outside React renders.              | React peer dependency and the core modules.                 |
| Playground              | [`playground/`](../../playground/)                                                         | Exercise automatic, step, camera, validation, and authoring behavior against a fixture UI.      | The package's built public exports.                         |

The root package entry is React-independent. React-specific behavior is exposed
only through `@wibus/cuelens/react`.

## Core model

Automatic films reduce the visible experience to one question: what should the
host show at time `t`?

```text
                         one playhead in seconds
                                   |
             +---------------------+--------------------+
             |                     |                    |
       numeric tracks        narrative beats      imperative cues
             |                     |                    |
             v                     v                    v
   declarative host state   copy + camera shot   allowlisted host effect
             |                     |                    |
             +---------------------+--------------------+
                                   |
                           one visible stage
```

If camera targets, copy, state changes, and product actions each own unrelated
timers, pause, seek, replay, and user intervention cannot remain synchronized.
The automatic runtime therefore uses one story clock. Camera physics may use a
separate animation-frame loop, but it reads the current story state rather than
creating another narrative clock.

Host-controlled films use a different source of authority. A form, router,
wizard, or async workflow changes the active step explicitly. The step carries
host state and an optional shot; the runtime does not add time-based progression
or dispatch product actions.

## Authored data

### Tracks

A track is a sorted list of numeric keyframes:

```ts
panelOpen: [
  { time: 0, value: 0 },
  { time: 7, value: 0 },
  { time: 8, value: 1, easing: 'easeInOutCubic' },
];
```

Tracks express facts rather than UI decisions. A value such as
`visibleRows = 3.4` may be floored to three rows, used as progress for the
fourth row, or written directly to a small visual effect. The host owns that
projection.

Easing on a keyframe controls the segment entering that keyframe. The timeline
evaluator clamps times outside the authored range and returns stable values for
arbitrary seeks.

### Beats and shots

A beat is the narrative unit active from its `at` time until the next beat. It
may contain fallback copy, metadata, and a camera shot:

```ts
{
  id: 'inspect',
  at: 7,
  title: 'Inspect the result',
  shot: { anchor: 'side-panel', padding: 80, maxScale: 1.8 }
}
```

A shot names a stable DOM anchor and framing parameters. It does not store
authored camera coordinates. The runtime derives the pose from live geometry so
the same shot can follow responsive layouts and changing product state.

### Cues

A cue identifies an imperative moment:

```ts
{
  id: 'open-panel',
  at: 7.4,
  anchor: 'changes-tab',
  lead: 0.7,
  kind: 'host-command',
  payload: { command: 'open-changes' }
}
```

The runtime reports the cue; the host decides what it means. The package does
not synthesize pointer events, invoke network mutations, or play audio. A host
should map cue kinds through an explicit allowlist.

`lead` is metadata for an optional pointer or anticipation effect. `at` is the
event crossing time. The package does not render that pointer.

### Steps

A step contains a stable ID, optional host state, optional metadata, and an
optional shot. Navigation changes only when the host calls `next()`,
`previous()`, `goTo()`, or `reset()`.

Step and automatic definitions are separate control models. They share camera
geometry but do not create nested ownership over the same flow.

## Runtime flows

### Automatic playback

```text
FrameDriver
    -> FilmClock transition
        -> frameAt(definition, time)
            -> numeric host state
            -> active beat and shot
        -> CueController crossing check
            -> host cue callback
        -> camera target measurement
            -> spring integration
            -> stage transform
```

`FilmClock` is an external store. It publishes snapshots for view subscribers
and detailed transitions for cue and camera consumers. An injected
`FrameDriver` makes clock behavior deterministic in tests.

The React provider owns its clock unless the host supplies one. A provider-owned
clock survives React StrictMode's effect probe and is destroyed after a real
unmount. An externally supplied clock remains the host's lifecycle
responsibility.

### Host-controlled steps

```text
host navigation or async result
    -> FilmStepController transition
        -> new step state rendered by host
        -> new shot read by camera
            -> anchor measurement
            -> continuous spring motion
```

The controller is also an external store. It reports direction, transition
reason, and revision so copy, form controls, and visual transitions can respond
without embedding navigation behavior in the camera.

## Camera architecture

The camera treats the stage as a stable authored coordinate system and the
viewport as the visible frame.

### Anchor resolution

The default contract is an exact `data-film-anchor` value. Existing nodes can be
marked without wrappers through `filmAnchorProps()`. Dynamic lists, virtualized
rows, portals, or product identity attributes may use a custom resolver.

The resolver should prefer stable product identity. Styling classes and
positional selectors are not durable camera contracts.

### Transform-aware measurement

`getBoundingClientRect()` returns post-transform geometry. Reusing that geometry
directly would make the camera chase its own scale. Measurement converts the
anchor rectangle back into stage coordinates:

```text
stageX = (anchor.left - stage.left) / appliedScale
stageY = (anchor.top  - stage.top)  / appliedScale
width  = anchor.width  / appliedScale
height = anchor.height / appliedScale
```

An anchor with a width or height below one pixel is treated as unavailable. A
`fallbackRect` can frame authored stage geometry until the live anchor becomes
measurable.

### Fit geometry

The camera fits the complete subject instead of cropping it:

```text
fitScale = min(availableWidth / subjectWidth,
               availableHeight / subjectHeight)
```

Padding reduces available viewport space. `minScale` and `maxScale` bound the
result, `zoom` adjusts it relative to the fit, and `focusX`/`focusY` place the
subject within the viewport.

The viewport must have non-zero dimensions and use `overflow: clip`.
`overflow: hidden` creates a scroll container whose offsets can make a valid
pose appear displaced. The stage must have stable authored dimensions, and the
camera owns its inline `transform` and `transform-origin`.

### Motion and readiness

Position and velocity persist across target changes. A camera already in motion
therefore curves toward a new subject rather than restarting a tween. Scale is
integrated in logarithmic space so equivalent zoom-in and zoom-out ratios feel
symmetric. Frame deltas are capped to avoid unstable jumps after a backgrounded
tab resumes.

The first valid pose is composed during browser layout. `hideUntilReady` keeps
the stage concealed until that transform is applied, and `onReady` reports the
first pose for each newly mounted stage. Later motion settles to the exact
target and idles.

Resize observation covers the viewport, stage, and current anchor. DOM mutation
observation wakes the camera when product state changes or a missing anchor
appears. The returned `refresh()` method handles geometry changes that those
observers cannot detect.

## Cue and seek semantics

Seeking is state reconstruction, not accelerated playback.

- Natural forward ticks fire each crossed cue once.
- Forward seek fires no crossed cues.
- Backward seek re-arms cues after the destination.
- Restart re-arms all cues.
- Looping fires the end segment, clears the fired set, and then fires the start
  segment.
- Play, pause, and rate changes do not fire cues by themselves.

The host must derive visible state for any time independently of cue history.
For example, a cue may open a panel during natural playback, but seeking past
that cue must project the panel as open without replaying the command.

A future authoring system should require a seek strategy for every imperative
cue:

| Strategy      | Contract                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| Snapshot      | Declarative host projection reconstructs the cue result.                                     |
| Replay-safe   | The command could be repeated safely, although forward seek remains silent by default.       |
| Playback-only | The effect occurs only during natural playback and is not required for the visible snapshot. |
| Host reset    | Rewind calls an explicit host adapter that reverses or resets the effect.                    |

Commands that mutate user data, billing, permissions, or remote systems should
never be inferred from an arbitrary selector. Preview environments should use
fixtures and allowlisted commands.

## React performance model

The system separates work by update frequency.

| Frequency            | Typical work                                            | Preferred mechanism                                       |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Per animation frame  | Camera transform, pointer position, fine visual motion. | Imperative DOM writes or compositor-friendly CSS.         |
| Quantized continuous | Typewriter progress, annotation reveal, meters.         | Small subscribed subtree or ref write.                    |
| Structural           | Rows, tabs, panels, task state, navigation.             | React props derived through integer or coarse thresholds. |

`useFilmFrame()` subscribes its caller to every story-clock tick. It should live
in a small conductor that derives a coarse product state. Passing raw fractional
track values through a large product tree creates high render cost without
necessarily changing visible output.

Expensive canvas, WebGL, or shader instances should remain mounted across beats.
Their transforms or parameters may change, but their backing stores should not
be recreated for every scene.

## Host boundary

The package owns:

- typed definitions and validation;
- numeric interpolation and frame derivation;
- deterministic automatic and step external stores;
- cue crossing and replay rules;
- anchor measurement, fit geometry, spring physics, and camera transforms;
- React providers and hooks over those primitives.

The host owns:

- product components and deterministic fixture composition;
- application state and the projection from tracks or steps into that state;
- localization and copy policy;
- audio and pointer visuals;
- cue command authorization and execution;
- navigation, native windows, network access, and user data;
- state reconstruction after seeking;
- accessibility and reduced-motion behavior for the complete experience.

This boundary prevents the runtime from becoming a product mock, an application
framework, or a privileged automation layer.

## Authoring architecture

The repository playground proves a synchronized visual and JSON editing flow,
but it is not a published Creator. A production authoring tool should generate
validated film data and adapter scaffolding instead of generating arbitrary
React animation code.

### Layers

```text
1. Project adapter
   Mount a real fixture-backed product stage.

2. Anchor inspector
   Select stable DOM subjects and preview framing.

3. Timeline editor
   Edit tracks, beats, shots, cues, and markers.

4. Compiler and validator
   Validate versioned project data and generate typed output.

5. Preview sandbox
   Run the production runtime under seek, replay, viewport, and failure tests.
```

The preview sandbox must consume the same runtime as production. Reimplementing
clock, cue, or camera behavior inside the editor would allow authored output to
behave differently after publication.

### Project format

Authoring state should use versioned JSON:

```json
{
  "schemaVersion": 1,
  "duration": 12,
  "tracks": {
    "panelOpen": [
      { "time": 0, "value": 0 },
      { "time": 8, "value": 1, "easing": "easeInOutCubic" }
    ]
  },
  "beats": [
    {
      "id": "inspect",
      "at": 7,
      "copyKey": "tour.inspect",
      "shot": { "anchor": "side-panel", "padding": 80, "maxScale": 1.8 }
    }
  ],
  "cues": [
    {
      "id": "open-changes",
      "at": 7.4,
      "anchor": "changes-tab",
      "lead": 0.7,
      "command": "press",
      "seekStrategy": "snapshot"
    }
  ]
}
```

JSON supports visual editing, diffs, schema migration, and collaboration. A
compiler may generate a literal-preserving TypeScript definition, locale stubs,
anchor types, validation reports, adapter placeholders, and tests. Generated
TypeScript should not become the editor's database.

### Anchor inspector

An inspector should:

1. Show the live DOM rectangle on hover.
2. Reuse an existing `data-film-anchor` or stable product identity selector.
3. Reject styling classes and positional selectors as publishable contracts.
4. Preview fit, padding, scale bounds, and focus placement.
5. Verify that the anchor exists with non-zero dimensions across target
   viewports.

If no durable selector exists, the author must add an explicit anchor to the
host application.

### Timeline surface

The smallest useful editor needs:

- a beat lane for narrative intervals;
- a camera lane for anchors and framing;
- a cue lane for anticipation, crossing, command, and seek strategy;
- numeric keyframe tracks with easing;
- markers for sound, checkpoints, or handoff;
- transport controls for play, pause, rate, beat jumps, and scrub;
- an inspector for frame values and validation issues.

The UI should keep code and visual editing on one shared validated draft. An
invalid JSON draft may remain editable, but it must not replace the last valid
runtime definition.

### Validation and generated tests

The package currently validates duration, ordering, ranges, duplicate IDs,
track bounds, cue lead time, and basic step identity. A Creator should also
validate:

- initial narrative coverage;
- anchor presence and non-zero geometry at checkpoints;
- cue target presence at crossing time;
- a declared seek strategy for each imperative cue;
- localization completeness;
- reduced-motion completion;
- explicit exit or handoff behavior;
- render-frequency risks from unquantized product state;
- command authorization and fixture isolation.

Generated tests should divide responsibility by boundary:

| Test                         | Responsibility                                               |
| ---------------------------- | ------------------------------------------------------------ |
| Definition validation        | Schema, ordering, ranges, IDs, and migration.                |
| Deterministic clock and cues | Playback, seek, rewind, restart, and loop without real time. |
| Seek snapshots               | Declarative host state at each beat and checkpoint.          |
| Anchor browser checks        | Presence and geometry across target viewports.               |
| Visual checkpoints           | Framing, overlap, crop, and responsive layout.               |

Core timing tests must use an injected frame driver. Browser automation is
reserved for behavior that depends on real layout or rendering.

## Current scope

Implemented:

- typed automatic and step definitions;
- numeric keyframes and easing;
- frame derivation and validation;
- deterministic play, pause, seek, restart, rate, loop, and completion;
- cue crossing, rewind re-arming, restart, and wrap behavior;
- generic DOM anchors and custom resolvers;
- transform-aware fit camera with logarithmic spring motion;
- synchronous first pose, fallback framing, observation, exact settle, and
  explicit refresh;
- React providers, hooks, external-store subscriptions, and StrictMode-safe
  owned-clock lifetime;
- an independent playground with visual and JSON authoring views;
- deterministic core tests and browser-level playground checks.

Not implemented as public package features:

- a production visual Creator or recorder;
- a CLI, compiler, schema migration, or project persistence layer;
- a generic pointer renderer or synthetic press executor;
- an audio event bus;
- generated screenshot checkpoint infrastructure;
- product components, fixtures, or application adapters.

These exclusions are explicit ownership boundaries. A second independent film
and a real host adapter are stronger tests of the abstraction than adding
product-specific behavior to the runtime.

## Design checklist

Before publishing an interactive film, verify that:

- one owner controls progression;
- every visible state can be reconstructed for an arbitrary time or step;
- forward seek does not execute crossed commands;
- rewind re-arms future cues;
- cues use an explicit command allowlist and seek strategy;
- fixtures cannot mutate real user data;
- anchors are stable contracts rather than styling selectors;
- the camera reverses applied scale during measurement and fits the complete
  subject;
- the viewport uses `overflow: clip` and the stage has stable dimensions;
- large React trees receive quantized structural state;
- expensive visual instances remain mounted;
- audio failure does not block interaction;
- scripted and real pointer ownership is explicit;
- reduced-motion and muted experiences remain complete;
- the final handoff or exit is explicit.
