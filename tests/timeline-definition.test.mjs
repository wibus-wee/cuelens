import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineFilm, evaluateTrack, frameAt, validateFilm } from '../src/index.ts';

const film = defineFilm({
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

describe('Cuelens timeline and definition', () => {
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
    const frame = frameAt(film, 2.5);
    assert.equal(frame.time, 2.5);
    assert.equal(frame.progress, 0.625);
    assert.equal(frame.beat?.id, 'detail');
    assert.equal(frame.shot?.anchor, 'button');
    assert.ok(frame.values.panel > 0 && frame.values.panel < 1);
  });

  it('clamps a requested frame to the film duration', () => {
    const frame = frameAt(film, 99);
    assert.equal(frame.time, 4);
    assert.equal(frame.progress, 1);
  });

  it('accepts a valid film and reports actionable authoring errors', () => {
    assert.deepEqual(validateFilm(film), []);
    const issues = validateFilm({
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
});
