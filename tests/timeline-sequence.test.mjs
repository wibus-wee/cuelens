import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defineSequence,
  evaluateCameraKeyframes,
  evaluateTrack,
  frameAt,
  validateSequence,
} from '../src/index.ts';

const sequence = defineSequence({
  duration: 4,
  tracks: {
    panel: [
      { time: 0, value: 0 },
      { time: 2, value: 1, easing: 'easeOutCubic' },
      { time: 4, value: 0 },
    ],
  },
  beats: [
    { id: 'wide', at: 0, shot: { anchor: 'window', padding: 40 } },
    { id: 'detail', at: 2, shot: { anchor: 'button', maxScale: 2 } },
  ],
  cues: [{ id: 'press-button', at: 2.5, anchor: 'button', lead: 0.5 }],
});

describe('Cuelens timeline and sequence', () => {
  it('interpolates keyframes and clamps outside the authored range', () => {
    const track = [
      { time: 1, value: 10 },
      { time: 3, value: 20 },
    ];
    assert.equal(evaluateTrack(track, 0), 10);
    assert.equal(evaluateTrack(track, 2), 15);
    assert.equal(evaluateTrack(track, 8), 20);
  });

  it('derives tracks, narration, and shot from one requested time', () => {
    const frame = frameAt(sequence, 2.5);
    assert.equal(frame.time, 2.5);
    assert.equal(frame.progress, 0.625);
    assert.equal(frame.beat?.id, 'detail');
    assert.equal(frame.shot?.anchor, 'button');
    assert.ok(frame.values.panel > 0 && frame.values.panel < 1);
  });

  it('clamps a requested frame to the sequence duration', () => {
    const frame = frameAt(sequence, 99);
    assert.equal(frame.time, 4);
    assert.equal(frame.progress, 1);
  });

  it('accepts a valid sequence and reports actionable authoring errors', () => {
    assert.deepEqual(validateSequence(sequence), []);
    const issues = validateSequence({
      duration: 2,
      tracks: {
        opacity: [
          { time: 1.5, value: 1 },
          { time: 1, value: 0 },
          { time: 3, value: 1 },
        ],
      },
      beats: [
        { id: 'same', at: 1.5 },
        { id: 'same', at: 1 },
      ],
      cues: [{ id: 'early', at: 0.2, anchor: 'target', lead: 0.5 }],
    });
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has('unsorted-track'), true);
    assert.equal(codes.has('track-after-duration'), true);
    assert.equal(codes.has('duplicate-beat-id'), true);
    assert.equal(codes.has('unsorted-beats'), true);
    assert.equal(codes.has('cue-lead-before-start'), true);
  });

  it('interpolates the camera lane and holds the segment anchor', () => {
    const lane = [
      { time: 0, anchor: 'window', yaw: -30, zoom: 1 },
      { time: 4, anchor: 'panel', yaw: 30, zoom: 2, easing: 'linear' },
    ];
    const mid = evaluateCameraKeyframes(lane, 2);
    assert.equal(mid?.anchor, 'window');
    assert.equal(mid?.yaw, 0);
    assert.equal(mid?.zoom, 1.5);
    assert.equal(evaluateCameraKeyframes(lane, -1)?.yaw, -30);
    assert.equal(evaluateCameraKeyframes(lane, 4)?.anchor, 'panel');
    assert.equal(evaluateCameraKeyframes(lane, 9)?.yaw, 30);
    assert.equal(evaluateCameraKeyframes(undefined, 1), null);
    assert.equal(evaluateCameraKeyframes([], 1), null);
  });

  it('cuts to the next anchor exactly at its keyframe', () => {
    const lane = [
      { time: 0, anchor: 'a', yaw: 0 },
      { time: 4, anchor: 'b', yaw: 10 },
      { time: 8, anchor: 'c', yaw: 20 },
    ];
    assert.equal(evaluateCameraKeyframes(lane, 3.999)?.anchor, 'a');
    assert.equal(evaluateCameraKeyframes(lane, 4)?.anchor, 'b');
    assert.equal(evaluateCameraKeyframes(lane, 4)?.yaw, 10);
  });

  it('blends perspective in focal-power space so lens distance never dips', () => {
    const lane = [
      { time: 0, anchor: 'a', yaw: 8, perspective: 1100 },
      { time: 8, anchor: 'a', yaw: 0, perspective: 0, easing: 'linear' },
    ];
    for (const time of [1, 2, 4, 6, 7, 7.9]) {
      const shot = evaluateCameraKeyframes(lane, time);
      assert.ok(
        shot.perspective === 0 || shot.perspective >= 1100,
        `t=${time} emitted unsafe perspective ${shot.perspective}`
      );
    }
    assert.equal(evaluateCameraKeyframes(lane, 8)?.perspective, 0);
    // Finite endpoints stay between the authored values.
    const shift = evaluateCameraKeyframes(
      [
        { time: 0, anchor: 'a', perspective: 800 },
        { time: 4, anchor: 'a', perspective: 1600, easing: 'linear' },
      ],
      2
    );
    assert.ok(shift.perspective > 800 && shift.perspective < 1600);
  });

  it('lets the camera lane override beat shots in derived frames', () => {
    const orbiting = defineSequence({
      duration: 4,
      tracks: {},
      beats: [{ id: 'only', at: 0, shot: { anchor: 'window' } }],
      cues: [],
      camera: [
        { time: 0, anchor: 'window', yaw: -20 },
        { time: 4, anchor: 'panel', yaw: 20 },
      ],
    });
    const frame = frameAt(orbiting, 2);
    assert.equal(frame.shot?.yaw, 0);
    assert.equal(frame.shot?.anchor, 'window');
    // Without a camera lane the beat shot still wins.
    assert.equal(frameAt(sequence, 2.5).shot?.anchor, 'button');
  });

  it('validates camera lane ordering, range, and anchors', () => {
    const issues = validateSequence({
      duration: 2,
      tracks: {},
      beats: [],
      cues: [],
      camera: [
        { time: 1.5, anchor: 'panel' },
        { time: 1, anchor: '' },
        { time: 3, anchor: 'window' },
      ],
    });
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has('unsorted-camera-keys'), true);
    assert.equal(codes.has('invalid-camera-key'), true);
    assert.equal(codes.has('camera-key-out-of-range'), true);
  });
});
