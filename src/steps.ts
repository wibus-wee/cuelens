import type { CameraShot } from './camera.ts';

/**
 * A host-owned state projection for a user-controlled sequence step.
 *
 * The runtime does not interpret the state: the host can use it to render a
 * fixture, select a real screen, or project configuration status into a
 * product preview. This keeps host-controlled sequences useful outside onboarding.
 */
export type SequenceStep<
  StepId extends string = string,
  State = unknown,
  Metadata = unknown,
  Anchor extends string = string,
> = {
  id: StepId;
  state?: State;
  shot?: CameraShot<Anchor> | null;
  metadata?: Metadata;
};

export type AnySequenceStep = SequenceStep<string, unknown, unknown, string>;

export type SequenceStepDefinition<Step extends AnySequenceStep = AnySequenceStep> = {
  steps: readonly Step[];
};

export type AnySequenceStepDefinition = SequenceStepDefinition<AnySequenceStep>;

export type SequenceStepSelector<StepId extends string = string> = StepId | number;

export type SequenceStepTransitionReason = 'next' | 'previous' | 'goTo' | 'reset';

export type SequenceStepSnapshot<Step extends AnySequenceStep = AnySequenceStep> = {
  index: number;
  step: Step;
  direction: -1 | 0 | 1;
  reason: SequenceStepTransitionReason;
  revision: number;
};

export type SequenceStepTransition<Step extends AnySequenceStep = AnySequenceStep> = {
  previous: SequenceStepSnapshot<Step>;
  current: SequenceStepSnapshot<Step>;
  direction: -1 | 0 | 1;
  reason: SequenceStepTransitionReason;
};

export type SequenceStepController<Step extends AnySequenceStep = AnySequenceStep> = {
  getSnapshot: () => SequenceStepSnapshot<Step>;
  subscribe: (listener: () => void) => () => void;
  next: () => boolean;
  previous: () => boolean;
  goTo: (selector: SequenceStepSelector<Step['id']>) => boolean;
  reset: () => boolean;
};

export type SequenceStepValidationIssue = {
  code: 'empty-steps' | 'duplicate-step-id' | 'empty-step-id';
  path: string;
  message: string;
};

export function defineSequenceSteps<const Definition extends AnySequenceStepDefinition>(
  definition: Definition
): Definition {
  return definition;
}

export function validateSequenceSteps(
  definition: AnySequenceStepDefinition
): SequenceStepValidationIssue[] {
  const issues: SequenceStepValidationIssue[] = [];
  if (definition.steps.length === 0) {
    issues.push({
      code: 'empty-steps',
      path: 'steps',
      message: 'A host-controlled sequence must define at least one step.',
    });
    return issues;
  }

  const seen = new Set<string>();
  definition.steps.forEach((step, index) => {
    if (!step.id.trim()) {
      issues.push({
        code: 'empty-step-id',
        path: 'steps.' + index + '.id',
        message: 'Sequence step ids must not be empty.',
      });
    }
    if (seen.has(step.id)) {
      issues.push({
        code: 'duplicate-step-id',
        path: 'steps.' + index + '.id',
        message: 'Sequence step id "' + step.id + '" is duplicated.',
      });
    }
    seen.add(step.id);
  });
  return issues;
}

function resolveStepIndex(
  definition: AnySequenceStepDefinition,
  selector: SequenceStepSelector
): number {
  if (typeof selector === 'number') {
    if (!Number.isInteger(selector) || selector < 0 || selector >= definition.steps.length) {
      throw new RangeError('Sequence step index ' + selector + ' is outside the definition.');
    }
    return selector;
  }
  const index = definition.steps.findIndex((step) => step.id === selector);
  if (index < 0) throw new Error('Unknown sequence step "' + selector + '".');
  return index;
}

export function createSequenceStepController<
  Definition extends AnySequenceStepDefinition,
>(options: {
  definition: Definition;
  initialStep?: SequenceStepSelector<Definition['steps'][number]['id']>;
  onTransition?: (transition: SequenceStepTransition<Definition['steps'][number]>) => void;
}): SequenceStepController<Definition['steps'][number]> {
  const { definition } = options;
  const listeners = new Set<() => void>();
  let index = resolveStepIndex(definition, options.initialStep ?? 0);
  let revision = 0;
  let snapshot: SequenceStepSnapshot<Definition['steps'][number]> = {
    index,
    step: definition.steps[index]!,
    direction: 0,
    reason: 'reset',
    revision,
  };

  const publish = (nextIndex: number, reason: SequenceStepTransitionReason): boolean => {
    if (nextIndex === index) return false;
    const previous = snapshot;
    const direction: -1 | 1 = nextIndex > index ? 1 : -1;
    index = nextIndex;
    revision += 1;
    snapshot = {
      index,
      step: definition.steps[index]!,
      direction,
      reason,
      revision,
    };
    const transition = { previous, current: snapshot, direction, reason };
    options.onTransition?.(transition);
    for (const listener of [...listeners]) listener();
    return true;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    next: () => publish(Math.min(definition.steps.length - 1, index + 1), 'next'),
    previous: () => publish(Math.max(0, index - 1), 'previous'),
    goTo: (selector) => publish(resolveStepIndex(definition, selector), 'goTo'),
    reset: () => publish(0, 'reset'),
  };
}
