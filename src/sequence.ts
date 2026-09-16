import {
  DEFAULT_CAMERA_MAX_SCALE,
  DEFAULT_CAMERA_PADDING,
  DEFAULT_CAMERA_PERSPECTIVE,
  MIN_CAMERA_SCALE,
  type CameraShot,
} from './camera.ts';
import { resolveEasing, type EasingFunction, type EasingName } from './easing.ts';
import {
  evaluateTimeline,
  interpolate,
  timelineDuration,
  type NumericTimeline,
} from './timeline.ts';

export type SequenceBeat<
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

export type SequenceCue<
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

/**
 * A timed camera target on the sequence's camera lane. Numeric shot fields
 * interpolate between keyframes with the easing of the segment's end keyframe;
 * the anchor is discrete and holds the segment's start value.
 */
export type CameraKeyframe<Anchor extends string = string> = CameraShot<Anchor> & {
  /** Seconds from the start of the sequence. */
  time: number;
  /** Easing for the segment ending at this keyframe. */
  easing?: EasingName | EasingFunction;
};

export type SequenceDefinition<
  Track extends string = string,
  BeatId extends string = string,
  Anchor extends string = string,
  CueId extends string = string,
  BeatMetadata = unknown,
  CuePayload = unknown,
> = {
  duration: number;
  tracks: NumericTimeline<Track>;
  beats: readonly SequenceBeat<BeatId, Anchor, BeatMetadata>[];
  cues: readonly SequenceCue<CueId, Anchor, CuePayload>[];
  /**
   * Continuous camera lane. When present it drives the frame's shot instead of
   * beat shots, so the camera can keep moving inside a single beat.
   */
  camera?: readonly CameraKeyframe<Anchor>[];
};

export type AnySequenceDefinition = SequenceDefinition<
  string,
  string,
  string,
  string,
  unknown,
  unknown
>;

export type SequenceFrame<
  Track extends string = string,
  BeatId extends string = string,
  Anchor extends string = string,
  BeatMetadata = unknown,
> = {
  time: number;
  progress: number;
  values: Record<Track, number>;
  beat: SequenceBeat<BeatId, Anchor, BeatMetadata> | null;
  beatIndex: number;
  shot: CameraShot<Anchor> | null;
};

export function defineSequence<const Definition extends AnySequenceDefinition>(
  definition: Definition
): Definition {
  return definition;
}

export function beatIndexAt(definition: AnySequenceDefinition, time: number): number {
  let active = -1;
  for (let index = 0; index < definition.beats.length; index += 1) {
    if (definition.beats[index]!.at > time) break;
    active = index;
  }
  return active;
}

export function beatAt<Definition extends AnySequenceDefinition>(
  definition: Definition,
  time: number
): Definition['beats'][number] | null {
  const index = beatIndexAt(definition, time);
  return index < 0 ? null : (definition.beats[index] ?? null);
}

const CAMERA_LANE_FIELDS = [
  'padding',
  'minScale',
  'maxScale',
  'zoom',
  'focusX',
  'focusY',
  'yaw',
  'pitch',
  'roll',
  'perspective',
] as const;

type CameraLaneField = (typeof CAMERA_LANE_FIELDS)[number];

const CAMERA_LANE_DEFAULTS: Record<CameraLaneField, number> = {
  padding: DEFAULT_CAMERA_PADDING,
  minScale: MIN_CAMERA_SCALE,
  maxScale: DEFAULT_CAMERA_MAX_SCALE,
  zoom: 1,
  focusX: 0.5,
  focusY: 0.5,
  yaw: 0,
  pitch: 0,
  roll: 0,
  perspective: 0,
};

/** Field value at a keyframe, filled with the same default the solver would use. */
function cameraKeyframeValue(keyframe: CameraKeyframe, field: CameraLaneField): number {
  const value = keyframe[field];
  if (value !== undefined && Number.isFinite(value)) return value;
  if (field === 'perspective') {
    const angled =
      (keyframe.yaw ?? 0) !== 0 || (keyframe.pitch ?? 0) !== 0 || (keyframe.roll ?? 0) !== 0;
    return angled ? DEFAULT_CAMERA_PERSPECTIVE : 0;
  }
  return CAMERA_LANE_DEFAULTS[field];
}

function shotFromCameraKeyframe<Anchor extends string>(
  keyframe: CameraKeyframe<Anchor>
): CameraShot<Anchor> {
  const { time: _time, easing: _easing, ...shot } = keyframe;
  return shot;
}

/**
 * Perspective is a lens distance: interpolating it linearly sweeps through
 * small values where `P / (P - z)` explodes or flips depth layers. Blend the
 * reciprocal (focal power) instead — `0` acts as an infinitely distant lens —
 * so the emitted value never drops below the nearer endpoint.
 */
function interpolatePerspective(a: number, b: number, progress: number): number {
  if (a <= 0 && b <= 0) return 0;
  const inverse = interpolate(a > 0 ? 1 / a : 0, b > 0 ? 1 / b : 0, progress);
  return inverse > 1e-6 ? 1 / inverse : 0;
}

/**
 * Evaluate the camera lane at a time. Clamps outside the authored range,
 * eases numeric fields across each segment, and holds the start anchor until
 * the next keyframe so cuts stay discrete while angles move continuously.
 */
export function evaluateCameraKeyframes<Anchor extends string>(
  keyframes: readonly CameraKeyframe<Anchor>[] | undefined,
  time: number
): CameraShot<Anchor> | null {
  if (!keyframes || keyframes.length === 0) return null;
  const first = keyframes[0]!;
  if (time <= first.time) return shotFromCameraKeyframe(first);
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) return shotFromCameraKeyframe(last);

  for (let index = 1; index < keyframes.length; index += 1) {
    const end = keyframes[index]!;
    if (time >= end.time) continue;
    const start = keyframes[index - 1]!;
    const span = end.time - start.time;
    const progress = span <= 0 ? 1 : resolveEasing(end.easing)((time - start.time) / span);
    const shot: CameraShot<Anchor> = { anchor: start.anchor };
    for (const field of CAMERA_LANE_FIELDS) {
      if (start[field] === undefined && end[field] === undefined) continue;
      shot[field] =
        field === 'perspective'
          ? interpolatePerspective(
              cameraKeyframeValue(start, field),
              cameraKeyframeValue(end, field),
              progress
            )
          : interpolate(
              cameraKeyframeValue(start, field),
              cameraKeyframeValue(end, field),
              progress
            );
    }
    return shot;
  }
  return shotFromCameraKeyframe(last);
}

export function frameAt<
  Track extends string,
  BeatId extends string,
  Anchor extends string,
  CueId extends string,
  BeatMetadata,
  CuePayload,
>(
  definition: SequenceDefinition<Track, BeatId, Anchor, CueId, BeatMetadata, CuePayload>,
  requestedTime: number
): SequenceFrame<Track, BeatId, Anchor, BeatMetadata> {
  const time = Math.max(0, Math.min(requestedTime, definition.duration));
  const beatIndex = beatIndexAt(definition, time);
  const beat = beatIndex < 0 ? null : (definition.beats[beatIndex] ?? null);
  return {
    time,
    progress: definition.duration <= 0 ? 1 : time / definition.duration,
    values: evaluateTimeline(definition.tracks, time),
    beat,
    beatIndex,
    shot: evaluateCameraKeyframes(definition.camera, time) ?? beat?.shot ?? null,
  };
}

export type SequenceValidationIssue = {
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
    | 'unsorted-cues'
    | 'invalid-camera-key'
    | 'camera-key-out-of-range'
    | 'unsorted-camera-keys';
  path: string;
  message: string;
};

export function validateSequence(definition: AnySequenceDefinition): SequenceValidationIssue[] {
  const issues: SequenceValidationIssue[] = [];
  if (!Number.isFinite(definition.duration) || definition.duration <= 0) {
    issues.push({
      code: 'invalid-duration',
      path: 'duration',
      message: 'Sequence duration must be a finite number greater than zero.',
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
          message: `Track "${trackName}" has a keyframe after the sequence duration.`,
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
        message: `Cue "${cue.id}" begins approaching before the sequence starts.`,
      });
    }
  });

  let previousKeyTime = Number.NEGATIVE_INFINITY;
  definition.camera?.forEach((keyframe, index) => {
    if (typeof keyframe.anchor !== 'string' || keyframe.anchor.length === 0) {
      issues.push({
        code: 'invalid-camera-key',
        path: `camera.${index}.anchor`,
        message: `Camera keyframe ${index} must name an anchor.`,
      });
    }
    if (
      !Number.isFinite(keyframe.time) ||
      keyframe.time < 0 ||
      keyframe.time > definition.duration
    ) {
      issues.push({
        code: 'camera-key-out-of-range',
        path: `camera.${index}.time`,
        message: `Camera keyframe ${index} is outside the sequence.`,
      });
    }
    if (keyframe.time < previousKeyTime) {
      issues.push({
        code: 'unsorted-camera-keys',
        path: `camera.${index}.time`,
        message: 'Camera keyframes must be sorted by time.',
      });
    }
    previousKeyTime = keyframe.time;
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
  issues: SequenceValidationIssue[]
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
        message: `${kind === 'beat' ? 'Beat' : 'Cue'} "${item.id}" is outside the sequence.`,
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
