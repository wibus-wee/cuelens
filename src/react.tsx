import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
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
  type AnchorResolver,
} from './camera.ts';
import { createFilmClock, type FilmClock, type FilmClockSnapshot } from './clock.ts';
import { createCueController } from './cues.ts';
import { frameAt, type AnyFilmDefinition, type FilmCue, type FilmFrame } from './definition.ts';

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

export type UseFilmCameraOptions<Anchor extends string = string> = {
  viewportRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  resolveAnchor?: AnchorResolver<Anchor>;
};

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
      const snapshot = clock.getSnapshot();
      if (!viewport || !stage) {
        if (snapshot.playing) schedule();
        return;
      }

      const delta = previousFrameTime === null ? 0 : (now - previousFrameTime) / 1000;
      previousFrameTime = now;
      const frame = frameAt(definition, snapshot.time);
      const shot = frame.shot;
      if (!shot) {
        if (snapshot.playing) schedule();
        return;
      }
      const anchorNode = resolveFilmAnchor(stage, shot.anchor as Anchor, customResolver);
      const viewportSize = { width: viewport.clientWidth, height: viewport.clientHeight };
      const rect = anchorNode
        ? measureFilmAnchor(stage, anchorNode, motion.scale > 0 ? motion.scale : 1)
        : null;
      if (rect && viewportSize.width > 0 && viewportSize.height > 0) {
        target = cameraTargetFromPose(solveCameraPose(rect, viewportSize, shot), viewportSize);
        motion = stepCamera(motion, target, delta);
        applyCameraPose(stage, cameraPoseFromMotion(motion, viewportSize));
      }

      if (snapshot.playing || !target || !cameraAtRest(motion, target)) schedule();
    };

    startRef.current = schedule;
    const unsubscribe = clock.subscribeTransitions(schedule);
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
  }, [clock, customResolver, definition, stageRef, viewportRef]);

  return { refresh: useCallback(() => startRef.current(), []) };
}

export type FilmAnchorProps = HTMLAttributes<HTMLDivElement> & { anchor: string };

/** Convenience wrapper; use `filmAnchorProps()` when marking an existing node. */
export const FilmAnchor = forwardRef<HTMLDivElement, FilmAnchorProps>(function FilmAnchor(
  { anchor, ...props },
  ref
) {
  return <div ref={ref} data-film-anchor={anchor} {...props} />;
});
