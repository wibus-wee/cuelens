# Changelog

All notable changes to this project are documented in this file. Releases use
semantic versioning while the public API remains in the `0.x` development
series.

## Unreleased

### Added

- Camera orientation on shots: `yaw`, `pitch`, and `roll` in degrees plus an
  explicit `perspective` lens, integrated by the same spring physics as position.
- A definition-level `camera` lane of shot keyframes that interpolate inside a
  beat for continuous orbits, drifts, and push-ins.
- Depth layers through `cameraLayerProps()`, the `<CameraLayer>` React wrapper,
  `preserve3dProps()` for intermediate wrappers, and the `depthLayers` camera
  option that keeps `preserve-3d` on the stage.
- Layout-space anchor measurement while the camera is rotated, so spatial poses
  never chase their own projected geometry.
- Studio camera lane authoring with a dedicated timeline lane, keyframe
  inspector, and angle/perspective sliders.

## 0.2.0 - 2026-09-07

### Added

- Typed interaction triggers with ordered host-owned actions and hover, focus,
  click, and manual dispatch.
- React trigger bindings for existing UI elements, independent of sequence steps
  and playback progress.
- Host-selected camera shots that capture their target geometry so normal product
  interaction does not retarget the camera.
- Interactive Guided playground narration, independent Sidebar and scene controls,
  and integration documentation.

## 0.1.0 - 2026-08-20

### Added

- Cuelens package identity under `@wibus/cuelens`.
- Typed automatic sequences with numeric tracks, narrative beats, camera shots, and
  host-owned cues.
- Host-controlled step sequences for onboarding, forms, and wizard flows.
- Deterministic clock, seek, restart, loop, and cue replay semantics.
- Transform-aware DOM camera framing with spring motion and React adapters.
- Packaged installation, Usage, and architecture documentation.
- Independent visual and JSON authoring playground with browser coverage.
