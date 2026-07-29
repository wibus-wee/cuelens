import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cameraTargetFromPose,
  createCameraMotion,
  solveCameraPose,
  stepCamera,
} from '../src/index.ts';

describe('interactive film camera', () => {
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
});
