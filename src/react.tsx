import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
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

  useEffect(() => {
    if (!ownedClock) return undefined;
    return () => ownedClock.destroy();
  }, [ownedClock]);

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

export type UseFilmCameraOptions<Anchor extends string = string> = {
  viewportRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  resolveAnchor?: AnchorResolver<Anchor>;
};

type CameraSource = {
  getShot: () => CameraShot<string> | null;
  subscribe: (listener: () => void) => () => void;
  shouldAnimate: () => boolean;
};

function useImperativeFilmCamera<Anchor extends string = string>(options: {
  viewportRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  resolveAnchor?: AnchorResolver<Anchor>;
  source: CameraSource;
}): { refresh: () => void } {
  const { viewportRef, stageRef, resolveAnchor: customResolver, source } = options;
  const startRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let motion = createCameraMotion();
    let target = null as ReturnType<typeof cameraTargetFromPose> | null;
    let frameHandle = 0;
    let previousFrameTime: number | null = null;
    let disposed = false;

    const schedule = (): void => {
      if (disposed || frameHandle !== 0) return;
      frameHandle = requestAnimationFrame(step);
    };

    const step = (now: number): void => {
      frameHandle = 0;
      if (disposed) return;
      const viewport = viewportRef.current;
      const stage = stageRef.current;
      if (!viewport || !stage) {
        if (source.shouldAnimate()) schedule();
        return;
      }

      const delta = previousFrameTime === null ? 0 : (now - previousFrameTime) / 1000;
      previousFrameTime = now;
      const shot = source.getShot();
      if (!shot) {
        if (source.shouldAnimate()) schedule();
        return;
      }
      const anchorNode = resolveFilmAnchor(stage, shot.anchor as Anchor, customResolver);
      const viewportSize = {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      };
      const rect = anchorNode
        ? measureFilmAnchor(stage, anchorNode, motion.scale > 0 ? motion.scale : 1)
        : null;
      if (rect && viewportSize.width > 0 && viewportSize.height > 0) {
        target = cameraTargetFromPose(solveCameraPose(rect, viewportSize, shot), viewportSize);
        motion = stepCamera(motion, target, delta);
        applyCameraPose(stage, cameraPoseFromMotion(motion, viewportSize));
      }

      if (source.shouldAnimate() || !target || !cameraAtRest(motion, target)) schedule();
    };

    startRef.current = schedule;
    const unsubscribe = source.subscribe(schedule);
    const viewport = viewportRef.current;
    const resizeObserver =
      viewport && typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (viewport && resizeObserver) resizeObserver.observe(viewport);
    schedule();

    return () => {
      disposed = true;
      startRef.current = () => undefined;
      unsubscribe();
      resizeObserver?.disconnect();
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle);
    };
  }, [customResolver, source, stageRef, viewportRef]);

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
    source,
  });
}

export type UseFilmStepCameraOptions<Anchor extends string = string> = {
  viewportRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  resolveAnchor?: AnchorResolver<Anchor>;
};

/** Runs the same camera physics, but changes shots only when the host changes film steps. */
export function useFilmStepCamera<Anchor extends string = string>({
  viewportRef,
  stageRef,
  resolveAnchor: customResolver,
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
