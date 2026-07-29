export type FilmClockSnapshot = {
  time: number;
  duration: number;
  playing: boolean;
  playbackRate: number;
  revision: number;
};

export type FilmClockTransitionReason = 'tick' | 'play' | 'pause' | 'seek' | 'restart' | 'rate';

export type FilmClockTransition = {
  reason: FilmClockTransitionReason;
  previous: FilmClockSnapshot;
  current: FilmClockSnapshot;
  wrapped: boolean;
  completed: boolean;
};

export type FrameDriver = {
  now: () => number;
  request: (callback: (now: number) => void) => unknown;
  cancel: (handle: unknown) => void;
};

export type CreateFilmClockOptions = {
  duration: number;
  autoPlay?: boolean;
  loop?: boolean;
  playbackRate?: number;
  driver?: FrameDriver;
  onComplete?: () => void;
};

export type FilmClock = {
  getSnapshot: () => FilmClockSnapshot;
  subscribe: (listener: () => void) => () => void;
  subscribeTransitions: (listener: (transition: FilmClockTransition) => void) => () => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  restart: () => void;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};

function createDefaultFrameDriver(): FrameDriver {
  if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
    return {
      now: () => performance.now(),
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle as number),
    };
  }
  return {
    now: () => performance.now(),
    request: (callback) => setTimeout(() => callback(performance.now()), 16),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

export function createFilmClock(options: CreateFilmClockOptions): FilmClock {
  if (!Number.isFinite(options.duration) || options.duration < 0) {
    throw new Error('Film clock duration must be a finite non-negative number.');
  }
  const initialRate = options.playbackRate ?? 1;
  assertPlaybackRate(initialRate);

  const driver = options.driver ?? createDefaultFrameDriver();
  const listeners = new Set<() => void>();
  const transitionListeners = new Set<(transition: FilmClockTransition) => void>();
  let snapshot: FilmClockSnapshot = {
    time: 0,
    duration: options.duration,
    playing: false,
    playbackRate: initialRate,
    revision: 0,
  };
  let frameHandle: unknown = null;
  let previousFrameTime: number | null = null;
  let destroyed = false;
  let completed = false;

  const publish = (
    reason: FilmClockTransitionReason,
    patch: Partial<Omit<FilmClockSnapshot, 'revision'>>,
    flags: { wrapped?: boolean; completed?: boolean } = {}
  ): void => {
    if (destroyed) return;
    const previous = snapshot;
    snapshot = {
      ...snapshot,
      ...patch,
      revision: snapshot.revision + 1,
    };
    const transition: FilmClockTransition = {
      reason,
      previous,
      current: snapshot,
      wrapped: flags.wrapped ?? false,
      completed: flags.completed ?? false,
    };
    for (const listener of [...transitionListeners]) listener(transition);
    for (const listener of [...listeners]) listener();
  };

  const cancelFrame = (): void => {
    if (frameHandle !== null) driver.cancel(frameHandle);
    frameHandle = null;
    previousFrameTime = null;
  };

  const scheduleFrame = (): void => {
    if (destroyed || !snapshot.playing || frameHandle !== null) return;
    frameHandle = driver.request(tick);
  };

  const tick = (now: number): void => {
    frameHandle = null;
    if (destroyed || !snapshot.playing) return;
    if (previousFrameTime === null) {
      previousFrameTime = now;
      scheduleFrame();
      return;
    }
    const elapsed = Math.max(0, (now - previousFrameTime) / 1000);
    previousFrameTime = now;
    const duration = snapshot.duration;
    let nextTime = snapshot.time + elapsed * snapshot.playbackRate;
    let wrapped = false;

    if (options.loop && duration > 0 && nextTime >= duration) {
      nextTime %= duration;
      wrapped = true;
      completed = false;
    } else if (nextTime >= duration) {
      nextTime = duration;
      completed = true;
      publish('tick', { time: nextTime, playing: false }, { completed: true });
      cancelFrame();
      options.onComplete?.();
      return;
    }

    publish('tick', { time: nextTime }, { wrapped });
    scheduleFrame();
  };

  const clock: FilmClock = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeTransitions: (listener) => {
      transitionListeners.add(listener);
      return () => transitionListeners.delete(listener);
    },
    play: () => {
      if (destroyed || snapshot.playing) return;
      completed = false;
      publish('play', { playing: true });
      scheduleFrame();
    },
    pause: () => {
      if (destroyed || !snapshot.playing) return;
      cancelFrame();
      publish('pause', { playing: false });
    },
    seek: (time) => {
      if (destroyed || !Number.isFinite(time)) return;
      const nextTime = Math.max(0, Math.min(time, snapshot.duration));
      completed = nextTime >= snapshot.duration;
      previousFrameTime = snapshot.playing ? driver.now() : null;
      publish('seek', { time: nextTime });
    },
    restart: () => {
      if (destroyed) return;
      completed = false;
      previousFrameTime = snapshot.playing ? driver.now() : null;
      publish('restart', { time: 0 });
    },
    setPlaybackRate: (rate) => {
      if (destroyed) return;
      assertPlaybackRate(rate);
      previousFrameTime = snapshot.playing ? driver.now() : null;
      publish('rate', { playbackRate: rate });
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelFrame();
      listeners.clear();
      transitionListeners.clear();
    },
  };

  if (options.autoPlay ?? true) clock.play();
  return clock;
}

function assertPlaybackRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Film clock playback rate must be a finite number greater than zero.');
  }
}
