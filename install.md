# Install Cuelens

Use this guide to add `@wibus/cuelens` to an existing application. The
package supplies timing, state derivation, cue semantics, and camera framing; it
does not replace the application's UI.

## Coding-agent workflow

1. Inspect the repository's package manager, React version, application entry
   points, test commands, and local contributor instructions.
2. Install `@wibus/cuelens` with the existing package manager. Do not
   create a second lockfile or convert the repository into a workspace.
3. If the integration uses React, confirm that the host already provides React
   `>=18.3.1`. React is a peer dependency and must not be bundled twice.
4. Read `node_modules/@wibus/cuelens/dist/docs/usage.md` and the
   package's emitted TypeScript declarations before editing application code.
5. Choose exactly one control model for the flow: automatic timeline or
   host-controlled steps.
6. Keep product components, application state, commands, audio, localization,
   and navigation in the host. Add stable DOM anchors to the existing UI rather
   than recreating the product surface.
7. Validate authored definitions, run the host's focused tests, and run its
   normal type or build check.

## Install commands

Use the command that matches the existing repository:

```sh
pnpm add @wibus/cuelens
```

```sh
npm install @wibus/cuelens
```

```sh
yarn add @wibus/cuelens
```

```sh
bun add @wibus/cuelens
```

Do not run more than one package manager. If the host does not use React, import
only from `@wibus/cuelens`.

## Choose a runtime mode

| Requirement                                                             | Mode                  | Public entry points                                                                             |
| ----------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| Time controls playback, tracks, narration, shots, and cues.             | Automatic timeline    | `defineSequence()`, `SequenceProvider`, `useSequenceFrame()`, `useSequenceCamera()`             |
| A wizard, form, router, or async workflow controls progression.         | Host-controlled steps | `defineSequenceSteps()`, `SequenceStepProvider`, `useSequenceStep()`, `useSequenceStepCamera()` |
| A non-React host needs clock, cue, interpolation, or camera primitives. | Core only             | `@wibus/cuelens`                                                                                |

Do not mount an automatic clock and a step controller to own the same flow.

## Integration requirements

- Give the camera stage stable authored dimensions and place it inside an
  `overflow: clip` viewport with non-zero dimensions.
- Mark existing DOM nodes with `cameraAnchorProps()` or provide a stable custom
  anchor resolver.
- Use `fallbackRect` when an anchor may mount late or temporarily have no layout
  box.
- Treat cues as host notifications. Execute only allowlisted commands and
  reconstruct visible state declaratively after seeking.
- Keep `useSequenceFrame()` in a small conductor and quantize values before passing
  them into a large product tree.
- Run `validateSequence()` or `validateSequenceSteps()` before mounting authored data.

The complete contracts and examples are in
[`docs/usage.md`](docs/usage.md) in the repository and
`dist/docs/usage.md` in the installed package.

## Verify the installation

Confirm that the package resolves through the host toolchain, then run the
repository's existing checks. A direct core import can be used as a smoke test:

```ts
import { defineSequence, frameAt } from '@wibus/cuelens';

const sequence = defineSequence({
  duration: 1,
  tracks: {
    opacity: [
      { time: 0, value: 0 },
      { time: 1, value: 1 },
    ],
  },
  beats: [],
  cues: [],
});

console.assert(frameAt(sequence, 0.5).values.opacity === 0.5);
```

For React integration, use the complete mounted examples in the Usage guide;
the smoke test above intentionally verifies only the dependency and core entry
point.
