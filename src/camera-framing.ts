import type { CameraShot, Rect } from './camera.ts';

/** Snapshot the first live subject for an action; fallback remains provisional until it mounts. */
export function createCameraFraming(freezeSubject: boolean) {
  let currentShot: CameraShot | null = null;
  let subject: Rect | null = null;

  return {
    reset: () => {
      currentShot = null;
      subject = null;
    },
    read: (
      shot: CameraShot,
      measure: () => Rect | null,
      fallback: () => Rect | null
    ): Rect | null => {
      if (shot !== currentShot) {
        currentShot = shot;
        subject = null;
      }
      if (freezeSubject && subject) return subject;
      const measured = measure();
      if (measured) {
        subject = { ...measured };
        return subject;
      }
      return fallback();
    },
  };
}
