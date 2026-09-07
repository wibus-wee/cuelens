import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCameraFraming } from '../src/camera-framing.ts';
import { solveCameraPose } from '../src/camera.ts';

describe('action-driven camera framing', () => {
  const shot = { anchor: 'media', padding: 40 };
  const original = { x: 100, y: 150, width: 200, height: 300 };
  const fallback = () => ({ x: 0, y: 0, width: 1400, height: 900 });

  it('keeps the same camera pose when real UI moves or removes the subject', () => {
    const framing = createCameraFraming(true);
    const viewport = { width: 800, height: 600 };
    let live = { ...original };
    const measure = () => live;
    const first = solveCameraPose(framing.read(shot, measure, fallback), viewport, shot);
    live.x = 700;
    assert.deepEqual(solveCameraPose(framing.read(shot, measure, fallback), viewport, shot), first);
    live = null;
    assert.deepEqual(solveCameraPose(framing.read(shot, measure, fallback), viewport, shot), first);
  });

  it('remeasures for a new camera action, including a repeated anchor', () => {
    const framing = createCameraFraming(true);
    framing.read(shot, () => original, fallback);
    const moved = { ...original, x: 700 };
    assert.deepEqual(
      framing.read({ ...shot }, () => moved, fallback),
      moved
    );
    framing.reset();
    assert.deepEqual(
      framing.read(shot, () => null, fallback),
      fallback()
    );
  });

  it('waits for a late live anchor instead of freezing the provisional fallback', () => {
    const framing = createCameraFraming(true);
    assert.deepEqual(
      framing.read(shot, () => null, fallback),
      fallback()
    );
    assert.deepEqual(
      framing.read(shot, () => original, fallback),
      original
    );
    assert.deepEqual(
      framing.read(shot, () => null, fallback),
      original
    );
  });

  it('continues following live geometry for timeline and step cameras', () => {
    const framing = createCameraFraming(false);
    assert.deepEqual(
      framing.read(shot, () => original, fallback),
      original
    );
    const moved = { ...original, x: 700 };
    assert.deepEqual(
      framing.read(shot, () => moved, fallback),
      moved
    );
    assert.deepEqual(
      framing.read(shot, () => null, fallback),
      fallback()
    );
  });
});
