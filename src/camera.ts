export const FILM_ANCHOR_ATTRIBUTE = 'data-film-anchor';

export type CameraShot<Anchor extends string = string> = {
  anchor: Anchor;
  padding?: number;
  minScale?: number;
  maxScale?: number;
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

export function filmAnchorProps<Anchor extends string>(
  anchor: Anchor
): { [FILM_ANCHOR_ATTRIBUTE]: Anchor } {
  return { [FILM_ANCHOR_ATTRIBUTE]: anchor };
}

export function resolveFilmAnchor<Anchor extends string>(
  stage: HTMLElement,
  anchor: Anchor,
  customResolver?: AnchorResolver<Anchor>
): HTMLElement | null {
  const custom = customResolver?.(stage, anchor);
  if (custom) return custom;
  for (const node of stage.querySelectorAll<HTMLElement>(`[${FILM_ANCHOR_ATTRIBUTE}]`)) {
    if (node.getAttribute(FILM_ANCHOR_ATTRIBUTE) === anchor) return node;
  }
  return null;
}

/** Convert post-transform DOM geometry back into the stage's coordinate space. */
export function measureFilmAnchor(
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
  shot: Pick<CameraShot, 'padding' | 'minScale' | 'maxScale'> = {}
): CameraPose {
  const padding = shot.padding ?? DEFAULT_CAMERA_PADDING;
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const fitScale = Math.min(availableWidth / rect.width, availableHeight / rect.height);
  const scale = Math.min(
    shot.maxScale ?? DEFAULT_CAMERA_MAX_SCALE,
    Math.max(shot.minScale ?? 0, fitScale)
  );
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  return {
    scale,
    x: viewport.width / 2 - centreX * scale,
    y: viewport.height / 2 - centreY * scale,
  };
}

export function cameraTargetFromPose(pose: CameraPose, viewport: ViewportSize): CameraTarget {
  return {
    scale: pose.scale,
    centreX: (viewport.width / 2 - pose.x) / pose.scale,
    centreY: (viewport.height / 2 - pose.y) / pose.scale,
  };
}

export function cameraPoseFromMotion(motion: CameraMotion, viewport: ViewportSize): CameraPose {
  return {
    scale: motion.scale,
    x: viewport.width / 2 - motion.centreX * motion.scale,
    y: viewport.height / 2 - motion.centreY * motion.scale,
  };
}

export function createCameraMotion(): CameraMotion {
  return {
    scale: 0,
    centreX: 0,
    centreY: 0,
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
    Math.abs(motion.centreX - target.centreX) < 0.5 &&
    Math.abs(motion.centreY - target.centreY) < 0.5 &&
    Math.abs(motion.velocity.centreX) < 0.5 &&
    Math.abs(motion.velocity.centreY) < 0.5
  );
}

export function applyCameraPose(stage: HTMLElement, pose: CameraPose): void {
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) scale(${pose.scale.toFixed(4)})`;
}
