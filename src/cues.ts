import type { FilmClock, FilmClockTransition } from './clock.ts';
import type { FilmCue } from './definition.ts';

export type CueController<Cue extends FilmCue = FilmCue> = {
  hasFired: (cueId: Cue['id']) => boolean;
  reset: () => void;
  dispose: () => void;
};

export function createCueController<Cue extends FilmCue>(options: {
  clock: FilmClock;
  cues: readonly Cue[];
  onCue: (cue: Cue, transition: FilmClockTransition) => void;
}): CueController<Cue> {
  const fired = new Set<Cue['id']>();

  const fireRange = (
    from: number,
    to: number,
    transition: FilmClockTransition,
    includeStart: boolean
  ): void => {
    for (const cue of options.cues) {
      const afterStart = includeStart ? cue.at >= from : cue.at > from;
      if (!afterStart || cue.at > to || fired.has(cue.id)) continue;
      fired.add(cue.id);
      options.onCue(cue, transition);
    }
  };

  const unsubscribe = options.clock.subscribeTransitions((transition) => {
    const { previous, current, reason, wrapped } = transition;
    if (reason === 'restart') {
      fired.clear();
      return;
    }
    if (reason === 'seek') {
      if (current.time < previous.time) {
        for (const cue of options.cues) {
          if (cue.at > current.time) fired.delete(cue.id);
        }
      }
      return;
    }
    if (reason !== 'tick') return;

    if (wrapped) {
      fireRange(previous.time, previous.duration, transition, false);
      fired.clear();
      fireRange(0, current.time, transition, true);
      return;
    }
    if (current.time < previous.time) return;
    fireRange(previous.time, current.time, transition, previous.time === 0);
  });

  return {
    hasFired: (cueId) => fired.has(cueId),
    reset: () => fired.clear(),
    dispose: unsubscribe,
  };
}
