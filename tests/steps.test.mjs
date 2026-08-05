import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFilmStepController, defineFilmSteps, validateFilmSteps } from '../src/index.ts';

describe('semi-automatic film steps', () => {
  const definition = defineFilmSteps({
    steps: [
      { id: 'workspace', state: { panel: 'closed' } },
      { id: 'composer', state: { panel: 'open' } },
      { id: 'result', state: { panel: 'open', result: true } },
    ],
  });

  it('keeps the host stateful while exposing deterministic navigation', () => {
    const transitions = [];
    const controller = createFilmStepController({
      definition,
      initialStep: 'composer',
      onTransition: (transition) => transitions.push(transition),
    });

    assert.equal(controller.getSnapshot().step.id, 'composer');
    assert.equal(controller.getSnapshot().revision, 0);
    assert.equal(controller.next(), true);
    assert.equal(controller.getSnapshot().step.state.result, true);
    assert.equal(transitions[0].direction, 1);
    assert.equal(transitions[0].reason, 'next');
    assert.equal(controller.next(), false);
    assert.equal(controller.goTo('workspace'), true);
    assert.equal(controller.getSnapshot().direction, -1);
    assert.equal(controller.previous(), false);
    assert.equal(controller.reset(), false);
    assert.equal(controller.getSnapshot().revision, 2);
  });

  it('can address steps by index and reports invalid definitions', () => {
    const controller = createFilmStepController({ definition });
    assert.equal(controller.goTo(2), true);
    assert.equal(controller.getSnapshot().step.id, 'result');
    assert.throws(() => controller.goTo('missing'), /Unknown film step/);

    const issues = validateFilmSteps({
      steps: [{ id: '' }, { id: 'same' }, { id: 'same' }],
    });
    assert.deepEqual(
      issues.map((issue) => issue.code),
      ['empty-step-id', 'duplicate-step-id']
    );
  });
});
