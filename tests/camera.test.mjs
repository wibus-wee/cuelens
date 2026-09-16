import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCameraPose,
  cameraAtRest,
  cameraLayerProps,
  cameraTargetFromPose,
  createCameraMotion,
  measureCameraAnchor,
  measureCameraAnchorByLayout,
  solveCameraPose,
  stepCamera,
  DEFAULT_CAMERA_PERSPECTIVE,
} from '../src/index.ts';

describe('Cuelens camera', () => {
  const viewport = { width: 1200, height: 800 };

  it('fits wide and tall subjects without cropping', () => {
    const wide = solveCameraPose({ x: 0, y: 0, width: 2000, height: 200 }, viewport, {
      padding: 0,
      maxScale: 99,
    });
    const tall = solveCameraPose({ x: 0, y: 0, width: 200, height: 2000 }, viewport, {
      padding: 0,
      maxScale: 99,
    });
    assert.equal(wide.scale, 0.6);
    assert.equal(tall.scale, 0.4);
  });

  it('respects magnification limits and centres the subject', () => {
    const pose = solveCameraPose({ x: 400, y: 100, width: 24, height: 24 }, viewport, {
      padding: 0,
      maxScale: 2.5,
    });
    const target = cameraTargetFromPose(pose, viewport);
    assert.equal(pose.scale, 2.5);
    assert.ok(Math.abs(target.centreX - 412) < 0.0001);
    assert.ok(Math.abs(target.centreY - 112) < 0.0001);
  });

  it('supports step-driven framing with zoom and a chosen focus point', () => {
    const pose = solveCameraPose({ x: 400, y: 100, width: 200, height: 100 }, viewport, {
      padding: 0,
      maxScale: 99,
      zoom: 2,
      focusX: 0.25,
      focusY: 0.75,
    });
    assert.equal(pose.scale, 12);
    assert.equal(pose.x, -5700);
    assert.equal(pose.y, -1200);
  });

  it('reverses the applied stage scale when measuring a live anchor', () => {
    const stage = {
      getBoundingClientRect: () => ({ left: 100, top: 50 }),
    };
    const anchor = {
      getBoundingClientRect: () => ({ left: 300, top: 250, width: 400, height: 200 }),
    };

    assert.deepEqual(measureCameraAnchor(stage, anchor, 2), {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it('keeps malformed authoring values out of the rendered transform', () => {
    const pose = solveCameraPose(
      { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 0, height: Number.NaN },
      { width: Number.NaN, height: 0 },
      {
        padding: Number.NaN,
        minScale: Number.NaN,
        maxScale: Number.POSITIVE_INFINITY,
        zoom: Number.NaN,
        focusX: Number.NEGATIVE_INFINITY,
      }
    );

    assert.equal(Number.isFinite(pose.x), true);
    assert.equal(Number.isFinite(pose.y), true);
    assert.equal(Number.isFinite(pose.scale), true);
    assert.ok(pose.scale > 0);
  });

  it('can initialize and snap a camera exactly to a solved target', () => {
    const target = { scale: 1.25, centreX: 420, centreY: 240 };
    const motion = createCameraMotion(target);

    assert.deepEqual(motion, {
      ...target,
      yaw: 0,
      pitch: 0,
      roll: 0,
      perspective: 0,
      velocity: { scale: 0, centreX: 0, centreY: 0, yaw: 0, pitch: 0, roll: 0, perspective: 0 },
    });
    assert.equal(cameraAtRest(motion, target), true);
  });

  it('adopts the first target, then approaches later targets without teleporting', () => {
    let motion = stepCamera(createCameraMotion(), { scale: 1, centreX: 0, centreY: 0 }, 1 / 60);
    assert.equal(motion.scale, 1);
    assert.equal(motion.centreX, 0);

    const target = { scale: 2, centreX: 500, centreY: 300 };
    motion = stepCamera(motion, target, 1 / 60);
    assert.ok(motion.centreX > 0);
    assert.ok(motion.centreX < target.centreX);

    for (let frame = 0; frame < 600; frame += 1) {
      motion = stepCamera(motion, target, 1 / 60);
    }
    assert.ok(Math.abs(motion.centreX - target.centreX) < 0.1);
    assert.ok(Math.abs(motion.centreY - target.centreY) < 0.1);
    assert.ok(Math.abs(motion.scale - target.scale) < 0.01);
  });

  it('clamps a huge resumed-frame delta', () => {
    let motion = stepCamera(createCameraMotion(), { scale: 1, centreX: 0, centreY: 0 }, 0);
    motion = stepCamera(motion, { scale: 1, centreX: 1000, centreY: 0 }, 30);
    assert.equal(Number.isFinite(motion.centreX), true);
    assert.ok(motion.centreX <= 1000);
  });

  it('solves 3D shots with a subject pivot and an implied lens', () => {
    const pose = solveCameraPose({ x: 100, y: 50, width: 200, height: 100 }, viewport, {
      yaw: -24,
      pitch: 8,
    });
    assert.equal(pose.yaw, -24);
    assert.equal(pose.pitch, 8);
    assert.equal(pose.roll, 0);
    assert.equal(pose.perspective, DEFAULT_CAMERA_PERSPECTIVE);
    assert.equal(pose.originX, 200);
    assert.equal(pose.originY, 100);
  });

  it('keeps perspective opt-in on flat shots and respects explicit values', () => {
    const flat = solveCameraPose({ x: 0, y: 0, width: 100, height: 100 }, viewport, {});
    assert.equal(flat.perspective, 0);
    const layered = solveCameraPose({ x: 0, y: 0, width: 100, height: 100 }, viewport, {
      perspective: 1600,
    });
    assert.equal(layered.perspective, 1600);
  });

  it('carries orientation through target conversion and spring motion', () => {
    const pose = solveCameraPose({ x: 0, y: 0, width: 200, height: 100 }, viewport, {
      yaw: 30,
      roll: -6,
      perspective: 900,
    });
    const target = cameraTargetFromPose(pose, viewport);
    assert.equal(target.yaw, 30);
    assert.equal(target.roll, -6);
    assert.equal(target.perspective, 900);

    let motion = stepCamera(createCameraMotion(), target, 1 / 60);
    assert.equal(motion.yaw, 30);
    motion = stepCamera(createCameraMotion(target), { ...target, yaw: 0, perspective: 0 }, 1 / 60);
    assert.ok(motion.yaw < 30);
    assert.equal(cameraAtRest(motion, target), false);
  });

  it('writes flat poses in the original form and spatial poses around the pivot', () => {
    const stage = { style: {} };
    applyCameraPose(stage, { x: -10, y: 20, scale: 1.5 });
    assert.equal(stage.style.transformOrigin, '0 0');
    assert.equal(stage.style.transform, 'translate3d(-10.00px, 20.00px, 0) scale(1.5000)');
    assert.equal(stage.style.transformStyle, '');

    applyCameraPose(stage, {
      x: -100,
      y: -50,
      scale: 2,
      originX: 200,
      originY: 100,
      yaw: -24,
      pitch: 8,
      roll: 0,
      perspective: 1200,
    });
    assert.equal(stage.style.transformOrigin, '200.00px 100.00px');
    // focus = x + scale * origin => (300, 150); translate = focus - origin
    assert.equal(
      stage.style.transform,
      'translate3d(100.00px, 50.00px, 0) perspective(1200.0px) ' +
        'rotateY(-24.000deg) rotateX(8.000deg) rotateZ(0.000deg) scale(2.0000)'
    );
    // preserve-3d is opt-in via the depthLayers option, not implied by angles.
    assert.equal(stage.style.transformStyle, '');
    applyCameraPose(stage, { x: 0, y: 0, scale: 1 }, true);
    assert.equal(stage.style.transformStyle, 'preserve-3d');
  });

  it('measures anchors in layout space while the camera is rotated', () => {
    const stage = {
      offsetWidth: 1600,
      offsetHeight: 1000,
      clientLeft: 0,
      clientTop: 0,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };
    const anchor = {
      offsetLeft: 300,
      offsetTop: 200,
      offsetWidth: 120,
      offsetHeight: 60,
      offsetParent: stage,
      getBoundingClientRect: () => ({ left: 500, top: 900, width: 340, height: 20 }),
    };
    assert.deepEqual(measureCameraAnchorByLayout(stage, anchor), {
      x: 300,
      y: 200,
      width: 120,
      height: 60,
    });
    // The distorted bounding rect is ignored while the pose is spatial.
    assert.deepEqual(measureCameraAnchor(stage, anchor, 2, true), {
      x: 300,
      y: 200,
      width: 120,
      height: 60,
    });
    // Anchors outside the stage's offsetParent chain fall back to rect math.
    const detached = { ...anchor, offsetParent: null };
    assert.equal(measureCameraAnchorByLayout(stage, detached), null);
  });

  it('marks depth layers with an attribute and a translateZ transform', () => {
    const props = cameraLayerProps(80);
    assert.equal(props['data-cuelens-depth'], '80');
    assert.equal(props.style.transform, 'translateZ(80.0px)');
    assert.equal(props.style.transformStyle, 'preserve-3d');
  });
});
