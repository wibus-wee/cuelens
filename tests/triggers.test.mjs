import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSequenceClock,
  createSequenceStepController,
  createSequenceTriggerController,
  defineSequenceTriggers,
} from '../src/index.ts';

describe('sequence triggers', () => {
  const triggers = defineSequenceTriggers([
    {
      id: 'analytics',
      events: ['hover', 'focus', 'click'],
      actions: [
        { type: 'tab', tab: 'analytics' },
        { type: 'camera', anchor: 'chart' },
      ],
    },
    { id: 'overview', events: ['click'], actions: [{ type: 'camera', anchor: 'window' }] },
  ]);

  it('dispatches ordered host actions without changing sequence progress', () => {
    const steps = createSequenceStepController({
      definition: { steps: [{ id: 'intro' }, { id: 'end' }] },
    });
    const clock = createSequenceClock({ duration: 10, autoPlay: false });
    const initialStep = steps.getSnapshot();
    const initialClock = clock.getSnapshot();
    let productTab = 'home';
    let cameraAnchor = 'window';
    const calls = [];
    const controller = createSequenceTriggerController({
      triggers,
      onAction: (action, context) => {
        if (action.type === 'tab') productTab = action.tab;
        else cameraAnchor = action.anchor;
        calls.push([action.type, context.event, context.trigger.id, productTab]);
      },
    });

    assert.equal(controller.trigger('analytics', 'hover'), true);
    assert.equal(cameraAnchor, 'chart');
    assert.deepEqual(calls, [
      ['tab', 'hover', 'analytics', 'analytics'],
      ['camera', 'hover', 'analytics', 'analytics'],
    ]);
    productTab = 'home';
    assert.equal(controller.trigger('overview', 'hover'), false);
    assert.equal(cameraAnchor, 'chart');
    assert.equal(controller.trigger('overview', 'click'), true);
    assert.equal(cameraAnchor, 'window');
    assert.equal(productTab, 'home');
    assert.equal(steps.getSnapshot(), initialStep);
    assert.equal(clock.getSnapshot(), initialClock);
    clock.destroy();
  });

  it('replays on each matching event and supports explicit dispatch', () => {
    const events = [];
    const controller = createSequenceTriggerController({
      triggers,
      onAction: (_, context) => events.push(context.event),
    });
    controller.trigger('analytics', 'focus');
    controller.trigger('analytics', 'click');
    controller.trigger('analytics', 'hover');
    controller.trigger('overview');
    assert.deepEqual(events, ['focus', 'focus', 'click', 'click', 'hover', 'hover', 'manual']);
    assert.throws(() => controller.trigger('missing'), /Unknown sequence trigger/);
  });

  it('rejects ambiguous identities before running any actions', () => {
    const onAction = () => assert.fail('Validation must not dispatch actions.');
    assert.throws(
      () => createSequenceTriggerController({ triggers: [triggers[0], triggers[0]], onAction }),
      /Duplicate sequence trigger/
    );
    assert.throws(
      () =>
        createSequenceTriggerController({
          triggers: [{ id: ' ', events: [], actions: [] }],
          onAction,
        }),
      /must not be empty/
    );
  });

  it('stops the action list on host errors without replaying or rolling back', () => {
    const calls = [];
    const controller = createSequenceTriggerController({
      triggers,
      onAction: (action) => {
        calls.push(action.type);
        throw new Error('Host failure');
      },
    });
    assert.throws(() => controller.trigger('analytics'), /Host failure/);
    assert.deepEqual(calls, ['tab']);
  });
});
