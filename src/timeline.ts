import { EASINGS, resolveEasing, type EasingFunction, type EasingName } from './easing.ts';

export type Keyframe = {
  /** Seconds from the start of the film. */
  time: number;
  value: number;
  /** Easing for the segment ending at this keyframe. */
  easing?: EasingName | EasingFunction;
};

export type NumericTimeline<Track extends string = string> = Readonly<
  Record<Track, readonly Keyframe[]>
>;

export function progressAt(time: number, start: number, end: number): number {
  if (end <= start) return time >= end ? 1 : 0;
  const value = (time - start) / (end - start);
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

export function easedProgressAt(
  time: number,
  start: number,
  end: number,
  easing: EasingName = 'easeOutCubic'
): number {
  return EASINGS[easing](progressAt(time, start, end));
}

export function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

export function evaluateTrack(keyframes: readonly Keyframe[], time: number): number {
  if (keyframes.length === 0) return 0;
  const first = keyframes[0]!;
  if (time <= first.time) return first.value;
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) return last.value;

  for (let index = 1; index < keyframes.length; index += 1) {
    const end = keyframes[index]!;
    if (time > end.time) continue;
    const start = keyframes[index - 1]!;
    const span = end.time - start.time;
    if (span <= 0) return end.value;
    const localProgress = (time - start.time) / span;
    return interpolate(start.value, end.value, resolveEasing(end.easing)(localProgress));
  }
  return last.value;
}

export function evaluateTimeline<Track extends string>(
  timeline: NumericTimeline<Track>,
  time: number
): Record<Track, number> {
  const values = {} as Record<Track, number>;
  for (const track of Object.keys(timeline) as Track[]) {
    values[track] = evaluateTrack(timeline[track], time);
  }
  return values;
}

export function timelineDuration(timeline: NumericTimeline): number {
  let duration = 0;
  for (const keyframes of Object.values(timeline)) {
    const last = keyframes[keyframes.length - 1];
    if (last && last.time > duration) duration = last.time;
  }
  return duration;
}
