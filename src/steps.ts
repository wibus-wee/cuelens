import type { CameraShot } from './camera.ts';

/**
 * A host-owned state projection for a user-controlled film step.
 *
 * The runtime does not interpret the state: the host can use it to render a
 * fixture, select a real screen, or project configuration status into a
 * product preview. This keeps semi-automatic films useful outside onboarding.
 */
export type FilmStep<
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

export type AnyFilmStep = FilmStep<string, unknown, unknown, string>;

export type FilmStepDefinition<Step extends AnyFilmStep = AnyFilmStep> = {
  steps: readonly Step[];
};

export type AnyFilmStepDefinition = FilmStepDefinition<AnyFilmStep>;

export type FilmStepSelector<StepId extends string = string> = StepId | number;

export type FilmStepTransitionReason = 'next' | 'previous' | 'goTo' | 'reset';

export type FilmStepSnapshot<Step extends AnyFilmStep = AnyFilmStep> = {
  index: number;
  step: Step;
  direction: -1 | 0 | 1;
  reason: FilmStepTransitionReason;
  revision: number;
};

export type FilmStepTransition<Step extends AnyFilmStep = AnyFilmStep> = {
  previous: FilmStepSnapshot<Step>;
  current: FilmStepSnapshot<Step>;
  direction: -1 | 0 | 1;
  reason: FilmStepTransitionReason;
};

export type FilmStepController<Step extends AnyFilmStep = AnyFilmStep> = {
  getSnapshot: () => FilmStepSnapshot<Step>;
  subscribe: (listener: () => void) => () => void;
  next: () => boolean;
  previous: () => boolean;
  goTo: (selector: FilmStepSelector<Step['id']>) => boolean;
  reset: () => boolean;
};

export type FilmStepValidationIssue = {
  code: 'empty-steps' | 'duplicate-step-id' | 'empty-step-id';
  path: string;
  message: string;
};

export function defineFilmSteps<const Definition extends AnyFilmStepDefinition>(
  definition: Definition
): Definition {
  return definition;
}

export function validateFilmSteps(definition: AnyFilmStepDefinition): FilmStepValidationIssue[] {
  const issues: FilmStepValidationIssue[] = [];
  if (definition.steps.length === 0) {
    issues.push({
      code: 'empty-steps',
      path: 'steps',
      message: 'A semi-automatic film must define at least one step.',
    });
    return issues;
  }

  const seen = new Set<string>();
  definition.steps.forEach((step, index) => {
    if (!step.id.trim()) {
      issues.push({
        code: 'empty-step-id',
        path: 'steps.' + index + '.id',
        message: 'Film step ids must not be empty.',
      });
    }
    if (seen.has(step.id)) {
      issues.push({
        code: 'duplicate-step-id',
        path: 'steps.' + index + '.id',
        message: 'Film step id "' + step.id + '" is duplicated.',
      });
    }
    seen.add(step.id);
  });
  return issues;
}

function resolveStepIndex(definition: AnyFilmStepDefinition, selector: FilmStepSelector): number {
  if (typeof selector === 'number') {
    if (!Number.isInteger(selector) || selector < 0 || selector >= definition.steps.length) {
      throw new RangeError('Film step index ' + selector + ' is outside the definition.');
    }
    return selector;
  }
  const index = definition.steps.findIndex((step) => step.id === selector);
  if (index < 0) throw new Error('Unknown film step "' + selector + '".');
  return index;
}

export function createFilmStepController<Definition extends AnyFilmStepDefinition>(options: {
  definition: Definition;
  initialStep?: FilmStepSelector<Definition['steps'][number]['id']>;
  onTransition?: (transition: FilmStepTransition<Definition['steps'][number]>) => void;
}): FilmStepController<Definition['steps'][number]> {
  const { definition } = options;
  const listeners = new Set<() => void>();
  let index = resolveStepIndex(definition, options.initialStep ?? 0);
  let revision = 0;
  let snapshot: FilmStepSnapshot<Definition['steps'][number]> = {
    index,
    step: definition.steps[index]!,
    direction: 0,
    reason: 'reset',
    revision,
  };

  const publish = (nextIndex: number, reason: FilmStepTransitionReason): boolean => {
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
