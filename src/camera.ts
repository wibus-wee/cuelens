export const CUELENS_ANCHOR_ATTRIBUTE = 'data-cuelens-anchor';

export type CameraShot<Anchor extends string = string> = {
  anchor: Anchor;
  padding?: number;
  minScale?: number;
  maxScale?: number;
  /** Magnification relative to the fit scale. */
  zoom?: number;
  /** Where the subject lands in the viewport, from 0 to 1. */
  focusX?: number;
  /** Where the subject lands in the viewport, from 0 to 1. */
  focusY?: number;
};

export type CameraPose = {
  x: number;
  y: number;
  scale: number;
};

export type CameraTarget = {
  centreX: number;
  centreY: number;
  scale: number;
};

export type CameraMotion = CameraTarget & {
  velocity: CameraTarget;
};

export type Rect = { x: number; y: number; width: number; height: number };
export type ViewportSize = { width: number; height: number };
export type AnchorResolver<Anchor extends string = string> = (
  stage: HTMLElement,
  anchor: Anchor
) => HTMLElement | null;

export const DEFAULT_CAMERA_PADDING = 56;
export const DEFAULT_CAMERA_MAX_SCALE = 2.6;
export const MIN_CAMERA_SCALE = 0.0001;

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function cameraAnchorProps<Anchor extends string>(
  anchor: Anchor
): { [CUELENS_ANCHOR_ATTRIBUTE]: Anchor } {
  return { [CUELENS_ANCHOR_ATTRIBUTE]: anchor };
}

export function resolveCameraAnchor<Anchor extends string>(
  stage: HTMLElement,
  anchor: Anchor,
  customResolver?: AnchorResolver<Anchor>
): HTMLElement | null {
  const custom = customResolver?.(stage, anchor);
  if (custom) return custom;
  for (const node of stage.querySelectorAll<HTMLElement>(`[${CUELENS_ANCHOR_ATTRIBUTE}]`)) {
    if (node.getAttribute(CUELENS_ANCHOR_ATTRIBUTE) === anchor) return node;
  }
  return null;
}

/** Convert post-transform DOM geometry back into the stage's coordinate space. */
export function measureCameraAnchor(
  stage: HTMLElement,
  anchorNode: HTMLElement,
  appliedScale: number
): Rect | null {
  const stageRect = stage.getBoundingClientRect();
  const anchorRect = anchorNode.getBoundingClientRect();
  if (anchorRect.width < 1 || anchorRect.height < 1) return null;
  const scale = appliedScale > 0 ? appliedScale : 1;
  return {
    x: (anchorRect.left - stageRect.left) / scale,
    y: (anchorRect.top - stageRect.top) / scale,
    width: anchorRect.width / scale,
    height: anchorRect.height / scale,
  };
}

/** Fit the whole subject in frame. Neither axis is allowed to crop it. */
export function solveCameraPose(
  rect: Rect,
  viewport: ViewportSize,
  shot: Pick<CameraShot, 'padding' | 'minScale' | 'maxScale' | 'zoom' | 'focusX' | 'focusY'> = {}
): CameraPose {
  const viewportWidth = Math.max(1, finiteOr(viewport.width, 1));
  const viewportHeight = Math.max(1, finiteOr(viewport.height, 1));
  const subjectWidth = Math.max(1, finiteOr(rect.width, 1));
  const subjectHeight = Math.max(1, finiteOr(rect.height, 1));
  const padding = Math.max(0, finiteOr(shot.padding, DEFAULT_CAMERA_PADDING));
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const fitScale = Math.min(availableWidth / subjectWidth, availableHeight / subjectHeight);
  const zoom = Math.max(0.1, finiteOr(shot.zoom, 1));
  const minScale = Math.max(MIN_CAMERA_SCALE, finiteOr(shot.minScale, MIN_CAMERA_SCALE));
  const maxScale = Math.max(MIN_CAMERA_SCALE, finiteOr(shot.maxScale, DEFAULT_CAMERA_MAX_SCALE));
  const scale = Math.min(maxScale, Math.max(minScale, fitScale * zoom));
  const centreX = finiteOr(rect.x, 0) + subjectWidth / 2;
  const centreY = finiteOr(rect.y, 0) + subjectHeight / 2;
  const focusX = clamp(finiteOr(shot.focusX, 0.5), 0, 1);
  const focusY = clamp(finiteOr(shot.focusY, 0.5), 0, 1);
  return {
    scale,
    x: viewportWidth * focusX - centreX * scale,
    y: viewportHeight * focusY - centreY * scale,
  };
}

export function cameraTargetFromPose(pose: CameraPose, viewport: ViewportSize): CameraTarget {
  const scale = Math.max(MIN_CAMERA_SCALE, finiteOr(pose.scale, 1));
  return {
    scale,
    centreX: (finiteOr(viewport.width, 0) / 2 - finiteOr(pose.x, 0)) / scale,
    centreY: (finiteOr(viewport.height, 0) / 2 - finiteOr(pose.y, 0)) / scale,
  };
}

export function cameraPoseFromMotion(motion: CameraMotion, viewport: ViewportSize): CameraPose {
  return {
    scale: motion.scale,
    x: viewport.width / 2 - motion.centreX * motion.scale,
    y: viewport.height / 2 - motion.centreY * motion.scale,
  };
}

/** Create an unpositioned camera, or park one exactly on an existing target. */
export function createCameraMotion(target?: CameraTarget): CameraMotion {
  return {
    scale: target ? Math.max(MIN_CAMERA_SCALE, finiteOr(target.scale, 1)) : 0,
    centreX: finiteOr(target?.centreX, 0),
    centreY: finiteOr(target?.centreY, 0),
    velocity: { scale: 0, centreX: 0, centreY: 0 },
  };
}

const CAMERA_STIFFNESS = 40;
const CAMERA_DAMPING = 13.4;
const CAMERA_REST_EPSILON = 0.0004;

function integrateAxis(
  position: number,
  velocity: number,
  target: number,
  deltaSeconds: number
): [number, number] {
  const acceleration = (target - position) * CAMERA_STIFFNESS - velocity * CAMERA_DAMPING;
  const nextVelocity = velocity + acceleration * deltaSeconds;
  return [position + nextVelocity * deltaSeconds, nextVelocity];
}

/** Integrate scale in log space so a 2x push and a 2x pull feel symmetric. */
export function stepCamera(
  motion: CameraMotion,
  target: CameraTarget,
  deltaSeconds: number
): CameraMotion {
  if (motion.scale <= 0) {
    return {
      ...target,
      velocity: { scale: 0, centreX: 0, centreY: 0 },
    };
  }
  const delta = Math.min(0.05, Math.max(0, deltaSeconds));
  if (delta === 0) return motion;

  const [logScale, scaleVelocity] = integrateAxis(
    Math.log(motion.scale),
    motion.velocity.scale,
    Math.log(Math.max(0.0001, target.scale)),
    delta
  );
  const [centreX, centreXVelocity] = integrateAxis(
    motion.centreX,
    motion.velocity.centreX,
    target.centreX,
    delta
  );
  const [centreY, centreYVelocity] = integrateAxis(
    motion.centreY,
    motion.velocity.centreY,
    target.centreY,
    delta
  );
  return {
    scale: Math.exp(logScale),
    centreX,
    centreY,
    velocity: {
      scale: scaleVelocity,
      centreX: centreXVelocity,
      centreY: centreYVelocity,
    },
  };
}

export function cameraAtRest(motion: CameraMotion, target: CameraTarget): boolean {
  if (motion.scale <= 0 || target.scale <= 0) return false;
  return (
    Math.abs(Math.log(motion.scale) - Math.log(target.scale)) < CAMERA_REST_EPSILON &&
    Math.abs(motion.velocity.scale) < CAMERA_REST_EPSILON &&
    Math.abs(motion.centreX - target.centreX) < 0.05 &&
    Math.abs(motion.centreY - target.centreY) < 0.05 &&
    Math.abs(motion.velocity.centreX) < 0.5 &&
    Math.abs(motion.velocity.centreY) < 0.5
  );
}

export function applyCameraPose(stage: HTMLElement, pose: CameraPose): void {
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) scale(${pose.scale.toFixed(4)})`;
}
