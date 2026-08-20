import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  applyCameraPose,
  cameraAtRest,
  cameraPoseFromMotion,
  cameraTargetFromPose,
  createCameraMotion,
  measureFilmAnchor,
  resolveFilmAnchor,
  solveCameraPose,
  stepCamera,
  type CameraShot,
  type AnchorResolver,
  type CameraPose,
  type Rect,
} from './camera.ts';
import { createFilmClock, type FilmClock, type FilmClockSnapshot } from './clock.ts';
import { createCueController } from './cues.ts';
import { frameAt, type AnyFilmDefinition, type FilmCue, type FilmFrame } from './definition.ts';
import {
  createFilmStepController,
  type AnyFilmStepDefinition,
  type FilmStepController,
  type FilmStepSelector,
  type FilmStepSnapshot,
} from './steps.ts';
import { createDeferredEffectLifetime } from './react-lifecycle.ts';

type FilmContextValue = {
  clock: FilmClock;
  definition: AnyFilmDefinition;
};

const FilmContext = createContext<FilmContextValue | null>(null);

export type FilmProviderProps = {
  definition: AnyFilmDefinition;
  clock?: FilmClock;
  autoPlay?: boolean;
  loop?: boolean;
  playbackRate?: number;
  onComplete?: () => void;
  children: ReactNode;
};

/**
 * Provides one immutable film definition and one clock. Pass an external clock
 * when a host needs to coordinate playback outside React.
 */
export function FilmProvider({
  definition,
  clock: externalClock,
  autoPlay,
  loop,
  playbackRate,
  onComplete,
  children,
}: FilmProviderProps): React.JSX.Element {
  const [ownedClock] = useState(() =>
    externalClock
      ? null
      : createFilmClock({
          duration: definition.duration,
          autoPlay,
          loop,
          playbackRate,
          onComplete,
        })
  );
  const clock = externalClock ?? ownedClock!;
  const [ownedClockLifetime] = useState(() =>
    ownedClock ? createDeferredEffectLifetime(ownedClock.destroy) : null
  );

  useEffect(() => {
    return ownedClockLifetime?.acquire();
  }, [ownedClockLifetime]);

  return <FilmContext.Provider value={{ clock, definition }}>{children}</FilmContext.Provider>;
}

function useFilmContext(): FilmContextValue {
  const value = useContext(FilmContext);
  if (!value) throw new Error('Interactive film hooks must be used within FilmProvider.');
  return value;
}

export function useFilmClock(): FilmClock {
  return useFilmContext().clock;
}

/** Subscribe only the component that needs clock state, not the whole stage. */
export function useFilmClockSnapshot(): FilmClockSnapshot {
  const clock = useFilmClock();
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}

/**
 * Derives a full frame and therefore updates on every playhead tick. Keep this
 * hook in a small conductor; quantize values before passing them to a large UI.
 */
export function useFilmFrame(): FilmFrame {
  const { definition } = useFilmContext();
  const { time } = useFilmClockSnapshot();
  return frameAt(definition, time);
}

export function useFilmCues<Cue extends FilmCue>(options: {
  cues?: readonly Cue[];
  onCue: (cue: Cue) => void;
}): void {
  const { clock, definition } = useFilmContext();
  const callbackRef = useRef(options.onCue);
  useEffect(() => {
    callbackRef.current = options.onCue;
  }, [options.onCue]);

  const cues = options.cues ?? (definition.cues as readonly Cue[]);
  useEffect(() => {
    const controller = createCueController({
      clock,
      cues,
      onCue: (cue) => callbackRef.current(cue),
    });
    return controller.dispose;
  }, [clock, cues]);
}

type FilmStepContextValue = {
  controller: FilmStepController;
  definition: AnyFilmStepDefinition;
};

const FilmStepContext = createContext<FilmStepContextValue | null>(null);
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type FilmStepProviderProps = {
  definition: AnyFilmStepDefinition;
  controller?: FilmStepController;
  initialStep?: FilmStepSelector;
  children: ReactNode;
};

/** Provides a host-controlled step sequence for semi-automatic films. */
export function FilmStepProvider({
  definition,
  controller: externalController,
  initialStep,
  children,
}: FilmStepProviderProps): React.JSX.Element {
  const [ownedController] = useState(() =>
    externalController ? null : createFilmStepController({ definition, initialStep })
  );
  const controller = externalController ?? ownedController!;

  return (
    <FilmStepContext.Provider value={{ controller, definition }}>
      {children}
    </FilmStepContext.Provider>
  );
}

function useFilmStepContext(): FilmStepContextValue {
  const value = useContext(FilmStepContext);
  if (!value) throw new Error('Semi-automatic film hooks must be used within FilmStepProvider.');
  return value;
}

export function useFilmStepController(): FilmStepController {
  return useFilmStepContext().controller;
}

export function useFilmStepSnapshot(): FilmStepSnapshot {
  const controller = useFilmStepController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

/** A compact step API for onboarding-like hosts that drive the film manually. */
export function useFilmStep(): FilmStepSnapshot &
  Pick<FilmStepController, 'next' | 'previous' | 'goTo' | 'reset'> {
  const controller = useFilmStepController();
  const snapshot = useFilmStepSnapshot();
  return {
    ...snapshot,
    next: controller.next,
    previous: controller.previous,
    goTo: controller.goTo,
    reset: controller.reset,
  };
}

export type FilmCameraFallback = Rect | ((stage: HTMLElement) => Rect | null);

type FilmCameraRuntimeOptions<Anchor extends string> = {
  resolveAnchor?: AnchorResolver<Anchor>;
  /** Frame this authored rect while the live anchor is absent or has no layout box. */
  fallbackRect?: FilmCameraFallback;
  /** Keep the stage hidden until its first camera transform has been composed. */
  hideUntilReady?: boolean;
  /** Runs once after each newly mounted stage receives its first valid pose. */
  onReady?: (pose: CameraPose) => void;
};

export type UseFilmCameraOptions<Anchor extends string = string> =
  FilmCameraRuntimeOptions<Anchor> & {
    viewportRef: RefObject<HTMLElement | null>;
    stageRef: RefObject<HTMLElement | null>;
  };

type CameraSource = {
  getShot: () => CameraShot<string> | null;
  subscribe: (listener: () => void) => () => void;
  shouldAnimate: () => boolean;
};

function useImperativeFilmCamera<Anchor extends string = string>(
  options: {
    viewportRef: RefObject<HTMLElement | null>;
    stageRef: RefObject<HTMLElement | null>;
    source: CameraSource;
  } & FilmCameraRuntimeOptions<Anchor>
): { refresh: () => void } {
  const { viewportRef, stageRef, source } = options;
  const startRef = useRef<() => void>(() => undefined);
  const motionRef = useRef(createCameraMotion());
  const stageNodeRef = useRef<HTMLElement | null>(null);
  const readyRef = useRef(false);
  const inputsRef = useRef({
    fallbackRect: options.fallbackRect,
    hideUntilReady: options.hideUntilReady ?? false,
    onReady: options.onReady,
    resolveAnchor: options.resolveAnchor,
  });
  inputsRef.current = {
    fallbackRect: options.fallbackRect,
    hideUntilReady: options.hideUntilReady ?? false,
    onReady: options.onReady,
    resolveAnchor: options.resolveAnchor,
  };

  useBrowserLayoutEffect(() => {
    let target = null as ReturnType<typeof cameraTargetFromPose> | null;
    let frameHandle = 0;
    let previousFrameTime: number | null = null;
    let disposed = false;
    let observedAnchor: HTMLElement | null = null;
    let concealedStage: HTMLElement | null = null;
    let previousVisibility = '';

    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;

    const observeAnchor = (anchor: HTMLElement | null): void => {
      if (anchor === observedAnchor) return;
      if (observedAnchor) resizeObserver?.unobserve(observedAnchor);
      observedAnchor = anchor;
      if (observedAnchor) resizeObserver?.observe(observedAnchor);
    };

    const revealStage = (stage: HTMLElement, pose: CameraPose): void => {
      if (concealedStage === stage) {
        stage.style.visibility = previousVisibility;
        concealedStage = null;
      }
      if (readyRef.current) return;
      readyRef.current = true;
      inputsRef.current.onReady?.(pose);
    };

    const prepareStage = (stage: HTMLElement): void => {
      if (stageNodeRef.current === stage) return;
      if (concealedStage) concealedStage.style.visibility = previousVisibility;
      stageNodeRef.current = stage;
      readyRef.current = false;
      motionRef.current = createCameraMotion();
      target = null;
      previousFrameTime = null;
      if (inputsRef.current.hideUntilReady) {
        concealedStage = stage;
        previousVisibility = stage.style.visibility;
        stage.style.visibility = 'hidden';
      }
    };

    const schedule = (): void => {
      if (disposed || frameHandle !== 0) return;
      frameHandle = requestAnimationFrame(step);
    };

    const step = (now: number): void => {
      frameHandle = 0;
      if (disposed) return;
      const viewport = viewportRef.current;
      const stage = stageRef.current;
      if (!viewport || !stage) return;
      prepareStage(stage);

      const delta = previousFrameTime === null ? 0 : (now - previousFrameTime) / 1000;
      previousFrameTime = now;
      const shot = source.getShot();
      if (!shot) {
        target = null;
        previousFrameTime = null;
        observeAnchor(null);
        return;
      }
      const anchorNode = resolveFilmAnchor(
        stage,
        shot.anchor as Anchor,
        inputsRef.current.resolveAnchor
      );
      observeAnchor(anchorNode);
      const viewportSize = {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      };
      if (viewportSize.width <= 0 || viewportSize.height <= 0) {
        previousFrameTime = null;
        return;
      }
      const measuredRect = anchorNode
        ? measureFilmAnchor(
            stage,
            anchorNode,
            motionRef.current.scale > 0 ? motionRef.current.scale : 1
          )
        : null;
      const fallback = inputsRef.current.fallbackRect;
      const rect =
        measuredRect ?? (typeof fallback === 'function' ? fallback(stage) : (fallback ?? null));
      if (rect) {
        target = cameraTargetFromPose(solveCameraPose(rect, viewportSize, shot), viewportSize);
      }

      if (target) {
        let motion = stepCamera(motionRef.current, target, delta);
        if (cameraAtRest(motion, target)) motion = createCameraMotion(target);
        motionRef.current = motion;
        const pose = cameraPoseFromMotion(motion, viewportSize);
        applyCameraPose(stage, pose);
        revealStage(stage, pose);
      }

      if (source.shouldAnimate() || (target && !cameraAtRest(motionRef.current, target)))
        schedule();
    };

    startRef.current = schedule;
    const unsubscribe = source.subscribe(schedule);
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (viewport) resizeObserver?.observe(viewport);
    if (stage) resizeObserver?.observe(stage);
    const mutationObserver =
      stage && typeof MutationObserver === 'function'
        ? new MutationObserver((records) => {
            const cameraWriteOnly = records.every(
              (record) =>
                record.type === 'attributes' &&
                record.target === stage &&
                record.attributeName === 'style'
            );
            if (!cameraWriteOnly) schedule();
          })
        : null;
    mutationObserver?.observe(stage!, {
      attributes: true,
      attributeFilter: ['class', 'data-film-anchor', 'hidden', 'style'],
      characterData: true,
      childList: true,
      subtree: true,
    });

    // The first valid shot is composed during layout, before the browser can
    // paint an unframed stage. Later changes retain the same motion state.
    step(typeof performance === 'undefined' ? 0 : performance.now());

    return () => {
      disposed = true;
      startRef.current = () => undefined;
      unsubscribe();
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (concealedStage) concealedStage.style.visibility = previousVisibility;
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle);
    };
  }, [source, stageRef, viewportRef]);

  // Re-measure after every host commit. This catches same-shot product-state
  // changes without asking callers to thread a dependency list into the hook.
  useBrowserLayoutEffect(() => startRef.current());

  return { refresh: useCallback(() => startRef.current(), []) };
}

/**
 * Runs camera physics outside React. Story time selects the target; a separate
 * frame loop lets the physical camera finish settling while story time pauses.
 */
export function useFilmCamera<Anchor extends string = string>({
  viewportRef,
  stageRef,
  resolveAnchor: customResolver,
  fallbackRect,
  hideUntilReady,
  onReady,
}: UseFilmCameraOptions<Anchor>): { refresh: () => void } {
  const { clock, definition } = useFilmContext();
  const source = useMemo<CameraSource>(
    () => ({
      getShot: () => frameAt(definition, clock.getSnapshot().time).shot ?? null,
      subscribe: (listener) => clock.subscribeTransitions(listener),
      shouldAnimate: () => clock.getSnapshot().playing,
    }),
    [clock, definition]
  );

  return useImperativeFilmCamera({
    viewportRef,
    stageRef,
    resolveAnchor: customResolver,
    fallbackRect,
    hideUntilReady,
    onReady,
    source,
  });
}

export type UseFilmStepCameraOptions<Anchor extends string = string> =
  FilmCameraRuntimeOptions<Anchor> & {
    viewportRef: RefObject<HTMLElement | null>;
    stageRef: RefObject<HTMLElement | null>;
  };

/** Runs the same camera physics, but changes shots only when the host changes film steps. */
export function useFilmStepCamera<Anchor extends string = string>({
  viewportRef,
  stageRef,
  resolveAnchor: customResolver,
  fallbackRect,
  hideUntilReady,
  onReady,
}: UseFilmStepCameraOptions<Anchor>): { refresh: () => void } {
  const controller = useFilmStepController();
  const source = useMemo<CameraSource>(
    () => ({
      getShot: () => controller.getSnapshot().step.shot ?? null,
      subscribe: (listener) => controller.subscribe(listener),
      shouldAnimate: () => false,
    }),
    [controller]
  );

  return useImperativeFilmCamera({
    viewportRef,
    stageRef,
    resolveAnchor: customResolver,
    fallbackRect,
    hideUntilReady,
    onReady,
    source,
  });
}

export type FilmAnchorProps = HTMLAttributes<HTMLDivElement> & {
  anchor: string;
};

/** Convenience wrapper; use `filmAnchorProps()` when marking an existing node. */
export const FilmAnchor = forwardRef<HTMLDivElement, FilmAnchorProps>(function FilmAnchor(
  { anchor, ...props },
  ref
) {
  return <div ref={ref} data-film-anchor={anchor} {...props} />;
});
