import type { CameraShot } from './camera.ts';
import { evaluateTimeline, timelineDuration, type NumericTimeline } from './timeline.ts';

export type FilmBeat<
  BeatId extends string = string,
  Anchor extends string = string,
  Metadata = unknown,
> = {
  id: BeatId;
  at: number;
  title?: string;
  body?: string;
  shot?: CameraShot<Anchor>;
  metadata?: Metadata;
};

export type FilmCue<
  CueId extends string = string,
  Anchor extends string = string,
  Payload = unknown,
> = {
  id: CueId;
  at: number;
  anchor: Anchor;
  /** Seconds before `at` that a visual pointer may begin approaching. */
  lead?: number;
  /** The host decides what each cue kind means. */
  kind?: string;
  payload?: Payload;
};

export type FilmDefinition<
  Track extends string = string,
  BeatId extends string = string,
  Anchor extends string = string,
  CueId extends string = string,
  BeatMetadata = unknown,
  CuePayload = unknown,
> = {
  duration: number;
  tracks: NumericTimeline<Track>;
  beats: readonly FilmBeat<BeatId, Anchor, BeatMetadata>[];
  cues: readonly FilmCue<CueId, Anchor, CuePayload>[];
};

export type AnyFilmDefinition = FilmDefinition<string, string, string, string, unknown, unknown>;

export type FilmFrame<
  Track extends string = string,
  BeatId extends string = string,
  Anchor extends string = string,
  BeatMetadata = unknown,
> = {
  time: number;
  progress: number;
  values: Record<Track, number>;
  beat: FilmBeat<BeatId, Anchor, BeatMetadata> | null;
  beatIndex: number;
  shot: CameraShot<Anchor> | null;
};

export function defineFilm<const Definition extends AnyFilmDefinition>(
  definition: Definition
): Definition {
  return definition;
}

export function beatIndexAt(definition: AnyFilmDefinition, time: number): number {
  let active = -1;
  for (let index = 0; index < definition.beats.length; index += 1) {
    if (definition.beats[index]!.at > time) break;
    active = index;
  }
  return active;
}

export function beatAt<Definition extends AnyFilmDefinition>(
  definition: Definition,
  time: number
): Definition['beats'][number] | null {
  const index = beatIndexAt(definition, time);
  return index < 0 ? null : (definition.beats[index] ?? null);
}

export function frameAt<
  Track extends string,
  BeatId extends string,
  Anchor extends string,
  CueId extends string,
  BeatMetadata,
  CuePayload,
>(
  definition: FilmDefinition<Track, BeatId, Anchor, CueId, BeatMetadata, CuePayload>,
  requestedTime: number
): FilmFrame<Track, BeatId, Anchor, BeatMetadata> {
  const time = Math.max(0, Math.min(requestedTime, definition.duration));
  const beatIndex = beatIndexAt(definition, time);
  const beat = beatIndex < 0 ? null : (definition.beats[beatIndex] ?? null);
  return {
    time,
    progress: definition.duration <= 0 ? 1 : time / definition.duration,
    values: evaluateTimeline(definition.tracks, time),
    beat,
    beatIndex,
    shot: beat?.shot ?? null,
  };
}

export type FilmValidationIssue = {
  code:
    | 'invalid-duration'
    | 'track-after-duration'
    | 'unsorted-track'
    | 'duplicate-beat-id'
    | 'beat-out-of-range'
    | 'unsorted-beats'
    | 'duplicate-cue-id'
    | 'cue-out-of-range'
    | 'cue-lead-before-start'
    | 'unsorted-cues';
  path: string;
  message: string;
};

export function validateFilm(definition: AnyFilmDefinition): FilmValidationIssue[] {
  const issues: FilmValidationIssue[] = [];
  if (!Number.isFinite(definition.duration) || definition.duration <= 0) {
    issues.push({
      code: 'invalid-duration',
      path: 'duration',
      message: 'Film duration must be a finite number greater than zero.',
    });
  }

  for (const [trackName, keyframes] of Object.entries(definition.tracks)) {
    let previous = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < keyframes.length; index += 1) {
      const keyframe = keyframes[index]!;
      if (keyframe.time < previous) {
        issues.push({
          code: 'unsorted-track',
          path: `tracks.${trackName}.${index}`,
          message: `Track "${trackName}" keyframes must be sorted by time.`,
        });
      }
      if (keyframe.time > definition.duration) {
        issues.push({
          code: 'track-after-duration',
          path: `tracks.${trackName}.${index}.time`,
          message: `Track "${trackName}" has a keyframe after the film duration.`,
        });
      }
      previous = keyframe.time;
    }
  }

  validateTimedItems(definition.beats, definition.duration, 'beat', issues);
  validateTimedItems(definition.cues, definition.duration, 'cue', issues);
  definition.cues.forEach((cue, index) => {
    if (cue.at - (cue.lead ?? 0) < 0) {
      issues.push({
        code: 'cue-lead-before-start',
        path: `cues.${index}.lead`,
        message: `Cue "${cue.id}" begins approaching before the film starts.`,
      });
    }
  });

  if (timelineDuration(definition.tracks) > definition.duration) {
    // Individual keyframe issues above contain the actionable paths. This
    // branch intentionally adds nothing; it keeps the aggregate check explicit.
  }
  return issues;
}

function validateTimedItems(
  items: readonly { id: string; at: number }[],
  duration: number,
  kind: 'beat' | 'cue',
  issues: FilmValidationIssue[]
): void {
  const seen = new Set<string>();
  let previous = Number.NEGATIVE_INFINITY;
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push({
        code: kind === 'beat' ? 'duplicate-beat-id' : 'duplicate-cue-id',
        path: `${kind}s.${index}.id`,
        message: `${kind === 'beat' ? 'Beat' : 'Cue'} id "${item.id}" is duplicated.`,
      });
    }
    seen.add(item.id);
    if (!Number.isFinite(item.at) || item.at < 0 || item.at > duration) {
      issues.push({
        code: kind === 'beat' ? 'beat-out-of-range' : 'cue-out-of-range',
        path: `${kind}s.${index}.at`,
        message: `${kind === 'beat' ? 'Beat' : 'Cue'} "${item.id}" is outside the film.`,
      });
    }
    if (item.at < previous) {
      issues.push({
        code: kind === 'beat' ? 'unsorted-beats' : 'unsorted-cues',
        path: `${kind}s.${index}.at`,
        message: `${kind === 'beat' ? 'Beats' : 'Cues'} must be sorted by time.`,
      });
    }
    previous = item.at;
  });
}
