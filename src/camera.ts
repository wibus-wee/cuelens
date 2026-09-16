export const CUELENS_ANCHOR_ATTRIBUTE = 'data-cuelens-anchor';
export const CUELENS_DEPTH_ATTRIBUTE = 'data-cuelens-depth';

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
  /** Orbit around the vertical axis through the subject, in degrees. */
  yaw?: number;
  /** Tilt around the horizontal axis through the subject, in degrees. */
  pitch?: number;
  /** Dutch roll around the view axis, in degrees. */
  roll?: number;
  /** Lens distance in px. Implied when an angle is set; required for depth layers. */
  perspective?: number;
};

export type CameraPose = {
  x: number;
  y: number;
  scale: number;
  /** Stage-space point the camera orientation pivots around. */
  originX?: number;
  originY?: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  perspective?: number;
};

export type CameraTarget = {
  centreX: number;
  centreY: number;
  scale: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  perspective?: number;
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
/** Lens distance assumed when a shot sets an angle without a perspective. */
export const DEFAULT_CAMERA_PERSPECTIVE = 1200;

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

/**
 * Mark a stage child as a depth layer. The layer keeps its layout position but
 * renders `depth` px toward the viewer once the camera has a perspective.
 * Intermediate wrappers between the stage and the layer need `preserve3dProps()`.
 */
export function cameraLayerProps(depth: number): {
  [CUELENS_DEPTH_ATTRIBUTE]: string;
  style: { transform: string; transformStyle: 'preserve-3d' };
} {
  const offset = Number.isFinite(depth) ? depth : 0;
  return {
    [CUELENS_DEPTH_ATTRIBUTE]: String(offset),
    style: {
      transform: `translateZ(${offset.toFixed(1)}px)`,
      transformStyle: 'preserve-3d',
    },
  };
}

/** Keep 3D space alive across an intermediate wrapper between stage and layer. */
export function preserve3dProps(): { style: { transformStyle: 'preserve-3d' } } {
  return { style: { transformStyle: 'preserve-3d' } };
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

/**
 * Convert post-transform DOM geometry back into the stage's coordinate space.
 * While the camera is rotated or perspective is active, bounding boxes are
 * projected quads rather than axis-aligned rects, so measurement walks the
 * offsetParent chain (layout coordinates are immune to the camera transform)
 * and falls back to the scaled-rect path when the chain cannot reach the stage.
 */
export function measureCameraAnchor(
  stage: HTMLElement,
  anchorNode: HTMLElement,
  appliedScale: number,
  spatial = false
): Rect | null {
  if (spatial) {
    const layout = measureCameraAnchorByLayout(stage, anchorNode);
    if (layout) return layout;
  }
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

/**
 * Measure an anchor in layout coordinates by walking offsetParents up to the
 * stage. The stage owns a transform, so it participates in the offsetParent
 * chain. Anchors outside that chain (fixed position, shadow roots, portals)
 * return null so the caller can fall back to rendered geometry.
 */
export function measureCameraAnchorByLayout(
  stage: HTMLElement,
  anchorNode: HTMLElement
): Rect | null {
  if (anchorNode === stage) {
    return stage.offsetWidth >= 1 && stage.offsetHeight >= 1
      ? { x: 0, y: 0, width: stage.offsetWidth, height: stage.offsetHeight }
      : null;
  }
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = anchorNode;
  while (node && node !== stage) {
    x += finiteOr(node.offsetLeft, 0);
    y += finiteOr(node.offsetTop, 0);
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== stage) return null;
  const width = finiteOr(anchorNode.offsetWidth, 0);
  const height = finiteOr(anchorNode.offsetHeight, 0);
  if (width < 1 || height < 1) return null;
  return {
    x: x + finiteOr(stage.clientLeft, 0),
    y: y + finiteOr(stage.clientTop, 0),
    width,
    height,
  };
}

/** Fit the whole subject in frame. Neither axis is allowed to crop it. */
export function solveCameraPose(
  rect: Rect,
  viewport: ViewportSize,
  shot: Pick<
    CameraShot,
    | 'padding'
    | 'minScale'
    | 'maxScale'
    | 'zoom'
    | 'focusX'
    | 'focusY'
    | 'yaw'
    | 'pitch'
    | 'roll'
    | 'perspective'
  > = {}
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
  const yaw = finiteOr(shot.yaw, 0);
  const pitch = finiteOr(shot.pitch, 0);
  const roll = finiteOr(shot.roll, 0);
  const perspective = Math.max(
    0,
    finiteOr(
      shot.perspective,
      yaw !== 0 || pitch !== 0 || roll !== 0 ? DEFAULT_CAMERA_PERSPECTIVE : 0
    )
  );
  return {
    scale,
    x: viewportWidth * focusX - centreX * scale,
    y: viewportHeight * focusY - centreY * scale,
    originX: centreX,
    originY: centreY,
    yaw,
    pitch,
    roll,
    perspective,
  };
}

export function cameraTargetFromPose(pose: CameraPose, viewport: ViewportSize): CameraTarget {
  const scale = Math.max(MIN_CAMERA_SCALE, finiteOr(pose.scale, 1));
  return {
    scale,
    centreX: (finiteOr(viewport.width, 0) / 2 - finiteOr(pose.x, 0)) / scale,
    centreY: (finiteOr(viewport.height, 0) / 2 - finiteOr(pose.y, 0)) / scale,
    yaw: finiteOr(pose.yaw, 0),
    pitch: finiteOr(pose.pitch, 0),
    roll: finiteOr(pose.roll, 0),
    perspective: Math.max(0, finiteOr(pose.perspective, 0)),
  };
}

export function cameraPoseFromMotion(motion: CameraMotion, viewport: ViewportSize): CameraPose {
  return {
    scale: motion.scale,
    x: viewport.width / 2 - motion.centreX * motion.scale,
    y: viewport.height / 2 - motion.centreY * motion.scale,
    originX: motion.centreX,
    originY: motion.centreY,
    yaw: finiteOr(motion.yaw, 0),
    pitch: finiteOr(motion.pitch, 0),
    roll: finiteOr(motion.roll, 0),
    perspective: Math.max(0, finiteOr(motion.perspective, 0)),
  };
}

/** Create an unpositioned camera, or park one exactly on an existing target. */
export function createCameraMotion(target?: CameraTarget): CameraMotion {
  return {
    scale: target ? Math.max(MIN_CAMERA_SCALE, finiteOr(target.scale, 1)) : 0,
    centreX: finiteOr(target?.centreX, 0),
    centreY: finiteOr(target?.centreY, 0),
    yaw: finiteOr(target?.yaw, 0),
    pitch: finiteOr(target?.pitch, 0),
    roll: finiteOr(target?.roll, 0),
    perspective: Math.max(0, finiteOr(target?.perspective, 0)),
    velocity: { scale: 0, centreX: 0, centreY: 0, yaw: 0, pitch: 0, roll: 0, perspective: 0 },
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
    return createCameraMotion(target);
  }
  const delta = Math.min(0.05, Math.max(0, deltaSeconds));
  if (delta === 0) return motion;

  const [logScale, scaleVelocity] = integrateAxis(
    Math.log(motion.scale),
    finiteOr(motion.velocity.scale, 0),
    Math.log(Math.max(0.0001, target.scale)),
    delta
  );
  const [centreX, centreXVelocity] = integrateAxis(
    motion.centreX,
    finiteOr(motion.velocity.centreX, 0),
    target.centreX,
    delta
  );
  const [centreY, centreYVelocity] = integrateAxis(
    motion.centreY,
    finiteOr(motion.velocity.centreY, 0),
    target.centreY,
    delta
  );
  const [yaw, yawVelocity] = integrateAxis(
    finiteOr(motion.yaw, 0),
    finiteOr(motion.velocity.yaw, 0),
    finiteOr(target.yaw, 0),
    delta
  );
  const [pitch, pitchVelocity] = integrateAxis(
    finiteOr(motion.pitch, 0),
    finiteOr(motion.velocity.pitch, 0),
    finiteOr(target.pitch, 0),
    delta
  );
  const [roll, rollVelocity] = integrateAxis(
    finiteOr(motion.roll, 0),
    finiteOr(motion.velocity.roll, 0),
    finiteOr(target.roll, 0),
    delta
  );
  return {
    scale: Math.exp(logScale),
    centreX,
    centreY,
    yaw,
    pitch,
    roll,
    // Lens distance tracks the target instantly: springing through small
    // perspective values while geometry is rotated would invert the projection.
    perspective: Math.max(0, finiteOr(target.perspective, 0)),
    velocity: {
      scale: scaleVelocity,
      centreX: centreXVelocity,
      centreY: centreYVelocity,
      yaw: yawVelocity,
      pitch: pitchVelocity,
      roll: rollVelocity,
      perspective: 0,
    },
  };
}

export function cameraAtRest(motion: CameraMotion, target: CameraTarget): boolean {
  if (motion.scale <= 0 || target.scale <= 0) return false;
  return (
    Math.abs(Math.log(motion.scale) - Math.log(target.scale)) < CAMERA_REST_EPSILON &&
    Math.abs(finiteOr(motion.velocity.scale, 0)) < CAMERA_REST_EPSILON &&
    Math.abs(motion.centreX - target.centreX) < 0.05 &&
    Math.abs(motion.centreY - target.centreY) < 0.05 &&
    Math.abs(finiteOr(motion.velocity.centreX, 0)) < 0.5 &&
    Math.abs(finiteOr(motion.velocity.centreY, 0)) < 0.5 &&
    Math.abs(finiteOr(motion.yaw, 0) - finiteOr(target.yaw, 0)) < 0.05 &&
    Math.abs(finiteOr(motion.pitch, 0) - finiteOr(target.pitch, 0)) < 0.05 &&
    Math.abs(finiteOr(motion.roll, 0) - finiteOr(target.roll, 0)) < 0.05 &&
    Math.abs(finiteOr(motion.perspective, 0) - finiteOr(target.perspective, 0)) < 0.5 &&
    Math.abs(finiteOr(motion.velocity.yaw, 0)) < 0.5 &&
    Math.abs(finiteOr(motion.velocity.pitch, 0)) < 0.5 &&
    Math.abs(finiteOr(motion.velocity.roll, 0)) < 0.5
  );
}

/**
 * Write the pose to the stage. Flat poses keep the original
 * `translate3d + scale` form. Spatial poses pivot around the tracked subject:
 * the transform origin moves to the stage-space focus point, the rotation and
 * perspective apply there, and the translate places that point back where the
 * flat solve put it. `preserveDepth` declares that the stage hosts
 * `data-cuelens-depth` layers and keeps `preserve-3d` on it permanently;
 * without it the stage flattens and layer transforms stay inert.
 */
export function applyCameraPose(stage: HTMLElement, pose: CameraPose, preserveDepth = false): void {
  const scale = finiteOr(pose.scale, 1);
  const yaw = finiteOr(pose.yaw, 0);
  const pitch = finiteOr(pose.pitch, 0);
  const roll = finiteOr(pose.roll, 0);
  const perspective = Math.max(0, finiteOr(pose.perspective, 0));
  const spatial = yaw !== 0 || pitch !== 0 || roll !== 0 || perspective > 0;
  stage.style.transformStyle = preserveDepth ? 'preserve-3d' : '';
  if (!spatial) {
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate3d(${finiteOr(pose.x, 0).toFixed(2)}px, ${finiteOr(
      pose.y,
      0
    ).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    return;
  }
  const originX = finiteOr(pose.originX, 0);
  const originY = finiteOr(pose.originY, 0);
  const focusX = finiteOr(pose.x, 0) + scale * originX;
  const focusY = finiteOr(pose.y, 0) + scale * originY;
  const lens = perspective > 0 ? `perspective(${perspective.toFixed(1)}px) ` : '';
  stage.style.transformOrigin = `${originX.toFixed(2)}px ${originY.toFixed(2)}px`;
  stage.style.transform =
    `translate3d(${(focusX - originX).toFixed(2)}px, ${(focusY - originY).toFixed(2)}px, 0) ` +
    `${lens}rotateY(${yaw.toFixed(3)}deg) rotateX(${pitch.toFixed(3)}deg) ` +
    `rotateZ(${roll.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
}
