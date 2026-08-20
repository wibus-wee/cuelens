import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCueController, createSequenceClock } from '../src/index.ts';

class FakeFrameDriver {
  nowValue = 0;
  nextHandle = 1;
  callbacks = new Map();

  now = () => this.nowValue;

  request = (callback) => {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  };

  cancel = (handle) => {
    this.callbacks.delete(handle);
  };

  step(milliseconds) {
    this.nowValue += milliseconds;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(this.nowValue);
  }
}

describe('Cuelens clock', () => {
  it('plays, pauses, seeks, changes rate, and completes deterministically', () => {
    const driver = new FakeFrameDriver();
    let completions = 0;
    const clock = createSequenceClock({
      duration: 2,
      autoPlay: false,
      driver,
      onComplete: () => {
        completions += 1;
      },
    });

    clock.play();
    driver.step(0);
    driver.step(500);
    assert.equal(clock.getSnapshot().time, 0.5);

    clock.pause();
    driver.step(500);
    assert.equal(clock.getSnapshot().time, 0.5);

    clock.seek(1);
    clock.setPlaybackRate(2);
    clock.play();
    driver.step(0);
    driver.step(500);
    assert.equal(clock.getSnapshot().time, 2);
    assert.equal(clock.getSnapshot().playing, false);
    assert.equal(completions, 1);
    clock.destroy();
  });

  it('loops through the end without losing overflow time', () => {
    const driver = new FakeFrameDriver();
    const clock = createSequenceClock({ duration: 1, autoPlay: true, loop: true, driver });
    driver.step(0);
    driver.step(1250);
    assert.equal(clock.getSnapshot().time, 0.25);
    assert.equal(clock.getSnapshot().playing, true);
    clock.destroy();
  });
});

describe('Cuelens cues', () => {
  it('fires on natural crossings, stays silent on forward seek, and rearms on rewind', () => {
    const driver = new FakeFrameDriver();
    const clock = createSequenceClock({ duration: 1, autoPlay: false, driver });
    const fired = [];
    const cues = [
      { id: 'first', at: 0.25, anchor: 'one' },
      { id: 'second', at: 0.75, anchor: 'two' },
    ];
    const controller = createCueController({
      clock,
      cues,
      onCue: (cue) => fired.push(cue.id),
    });

    clock.play();
    driver.step(0);
    driver.step(300);
    assert.deepEqual(fired, ['first']);

    clock.seek(0.9);
    assert.deepEqual(fired, ['first']);

    clock.seek(0.4);
    driver.step(400);
    assert.deepEqual(fired, ['first', 'second']);

    clock.restart();
    driver.step(300);
    assert.deepEqual(fired, ['first', 'second', 'first']);
    controller.dispose();
    clock.destroy();
  });

  it('fires end cues before start cues when natural playback wraps', () => {
    const driver = new FakeFrameDriver();
    const clock = createSequenceClock({ duration: 1, autoPlay: false, loop: true, driver });
    const fired = [];
    const controller = createCueController({
      clock,
      cues: [
        { id: 'start', at: 0.1, anchor: 'start' },
        { id: 'end', at: 0.9, anchor: 'end' },
      ],
      onCue: (cue) => fired.push(cue.id),
    });

    clock.seek(0.8);
    clock.play();
    driver.step(0);
    driver.step(400);
    assert.deepEqual(fired, ['end', 'start']);
    controller.dispose();
    clock.destroy();
  });
});
