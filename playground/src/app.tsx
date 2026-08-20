import {
  lazy,
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Aperture,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  Layers3,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Send,
  Smartphone,
  Tablet,
  WandSparkles,
} from 'lucide-react';
import {
  defineSequence,
  defineSequenceSteps,
  cameraAnchorProps,
  type CameraShot,
} from '@wibus/cuelens';
import {
  SequenceProvider,
  SequenceStepProvider,
  useSequenceCamera,
  useSequenceClock,
  useSequenceClockSnapshot,
  useSequenceCues,
  useSequenceFrame,
  useSequenceStep,
  useSequenceStepCamera,
} from '@wibus/cuelens/react';

const StudioPlayground = lazy(() =>
  import('./studio').then((module) => ({ default: module.StudioPlayground }))
);

const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 900;
const FALLBACK_RECT = { x: 120, y: 68, width: 1200, height: 764 };

type ViewportPreset = 'desktop' | 'tablet' | 'phone';
type PlaygroundMode = 'guided' | 'timeline' | 'studio';
type DeliveryStatus = 'drafting' | 'review' | 'ready';

type ProductState = {
  activeScene: number;
  comments: number;
  progress: number;
  status: DeliveryStatus;
};

const DEFAULT_PRODUCT_STATE: ProductState = {
  activeScene: 1,
  comments: 2,
  progress: 0.36,
  status: 'drafting',
};

const guidedSequence = defineSequenceSteps({
  steps: [
    {
      id: 'workspace',
      state: { activeScene: 1, comments: 2, progress: 0.36, status: 'drafting' },
      shot: { anchor: 'window', padding: 42, maxScale: 1.1 },
      metadata: { label: 'Workspace', note: 'The authored product surface' },
    },
    {
      id: 'story',
      state: { activeScene: 2, comments: 2, progress: 0.48, status: 'drafting' },
      shot: { anchor: 'story-canvas', padding: 82, maxScale: 1.55, focusX: 0.48 },
      metadata: { label: 'Story frame', note: 'Fit the live canvas, never crop' },
    },
    {
      id: 'review',
      state: { activeScene: 3, comments: 4, progress: 0.72, status: 'review' },
      shot: { anchor: 'review-panel', padding: 68, maxScale: 1.75, focusX: 0.58 },
      metadata: { label: 'Review', note: 'Follow a changing panel' },
    },
    {
      id: 'delivery',
      state: { activeScene: 4, comments: 5, progress: 0.94, status: 'ready' },
      shot: { anchor: 'publish', padding: 170, maxScale: 2.1, focusX: 0.62, focusY: 0.42 },
      metadata: { label: 'Delivery', note: 'Cap magnification on controls' },
    },
  ],
});

const timelineSequence = defineSequence({
  duration: 18,
  tracks: {
    scene: [
      { time: 0, value: 1 },
      { time: 5, value: 2, easing: 'easeOutCubic' },
      { time: 10, value: 3, easing: 'easeInOutCubic' },
      { time: 15, value: 4, easing: 'easeInOutCubic' },
    ],
    comments: [
      { time: 0, value: 1 },
      { time: 6, value: 2 },
      { time: 11, value: 4 },
      { time: 16, value: 5 },
    ],
    progress: [
      { time: 0, value: 0.12 },
      { time: 18, value: 1, easing: 'easeInOutCubic' },
    ],
    status: [
      { time: 0, value: 0 },
      { time: 10, value: 1 },
      { time: 15, value: 2 },
    ],
  },
  beats: [
    {
      id: 'orient',
      at: 0,
      title: 'Workspace',
      body: 'Establish the full product world.',
      shot: { anchor: 'window', padding: 44, maxScale: 1.1 },
    },
    {
      id: 'compose',
      at: 4,
      title: 'Story frame',
      body: 'Move into the live canvas.',
      shot: { anchor: 'story-canvas', padding: 82, maxScale: 1.55, focusX: 0.48 },
    },
    {
      id: 'respond',
      at: 9,
      title: 'Review',
      body: 'Hold on feedback while the state changes.',
      shot: { anchor: 'review-panel', padding: 68, maxScale: 1.75, focusX: 0.58 },
    },
    {
      id: 'deliver',
      at: 14,
      title: 'Delivery',
      body: 'Finish on the real product action.',
      shot: { anchor: 'publish', padding: 170, maxScale: 2.1, focusX: 0.62, focusY: 0.42 },
    },
  ],
  cues: [
    { id: 'select-scene', at: 5, anchor: 'story-canvas', kind: 'point' },
    { id: 'open-review', at: 10, anchor: 'review-panel', kind: 'point' },
    { id: 'publish-ready', at: 15.5, anchor: 'publish', kind: 'confirm' },
  ],
});

const viewportPresets: Record<
  ViewportPreset,
  { label: string; width: number; height: number; icon: typeof Monitor }
> = {
  desktop: { label: 'Desktop', width: 1180, height: 700, icon: Monitor },
  tablet: { label: 'Tablet', width: 820, height: 680, icon: Tablet },
  phone: { label: 'Phone', width: 390, height: 680, icon: Smartphone },
};

const scenes = [
  { id: '01', name: 'Cold open', time: '00:00', tone: 'coral' },
  { id: '02', name: 'Leave the city', time: '00:07', tone: 'blue' },
  { id: '03', name: 'Open road', time: '00:14', tone: 'photo' },
  { id: '04', name: 'Final ascent', time: '00:21', tone: 'green' },
  { id: '05', name: 'End frame', time: '00:28', tone: 'charcoal' },
];

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="icon-button"
      data-active={active ? 'true' : undefined}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function App() {
  const [mode, setMode] = useState<PlaygroundMode>('guided');
  const [viewport, setViewport] = useState<ViewportPreset>(() =>
    window.innerWidth <= 760 ? 'phone' : 'desktop'
  );
  const [debug, setDebug] = useState(false);
  const preset = viewportPresets[viewport];

  return (
    <main className="playground-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden>
            <Aperture size={18} strokeWidth={2.1} />
          </span>
          <div>
            <strong>Cuelens</strong>
            <span>Camera playground</span>
          </div>
        </div>

        <div className="mode-switch" aria-label="Playback mode">
          <button type="button" data-active={mode === 'guided'} onClick={() => setMode('guided')}>
            Guided
          </button>
          <button
            type="button"
            data-active={mode === 'timeline'}
            onClick={() => setMode('timeline')}
          >
            Timeline
          </button>
          <button type="button" data-active={mode === 'studio'} onClick={() => setMode('studio')}>
            Studio
          </button>
        </div>

        {mode === 'studio' ? (
          <div className="topbar-actions" />
        ) : (
          <div className="topbar-actions">
            <div className="viewport-switch" aria-label="Viewport preset">
              {(
                Object.entries(viewportPresets) as [
                  ViewportPreset,
                  (typeof viewportPresets)[ViewportPreset],
                ][]
              ).map(([id, option]) => {
                const Icon = option.icon;
                return (
                  <IconButton
                    key={id}
                    label={option.label}
                    active={viewport === id}
                    onClick={() => setViewport(id)}
                  >
                    <Icon size={17} />
                  </IconButton>
                );
              })}
            </div>
            <span className="toolbar-divider" />
            <IconButton
              label={debug ? 'Hide camera anchors' : 'Show camera anchors'}
              active={debug}
              onClick={() => setDebug((value) => !value)}
            >
              {debug ? <Eye size={17} /> : <EyeOff size={17} />}
            </IconButton>
          </div>
        )}
      </header>

      {mode === 'guided' ? (
        <SequenceStepProvider definition={guidedSequence} initialStep="workspace">
          <GuidedPlayground viewport={preset} debug={debug} />
        </SequenceStepProvider>
      ) : mode === 'timeline' ? (
        <SequenceProvider definition={timelineSequence} autoPlay={false} playbackRate={1}>
          <TimelinePlayground viewport={preset} debug={debug} />
        </SequenceProvider>
      ) : (
        <Suspense
          fallback={
            <div className="studio-loading" role="status">
              Loading editor…
            </div>
          }
        >
          <StudioPlayground />
        </Suspense>
      )}
    </main>
  );
}

function GuidedPlayground({
  viewport,
  debug,
}: {
  viewport: (typeof viewportPresets)[ViewportPreset];
  debug: boolean;
}) {
  const step = useSequenceStep();
  const state = (step.step.state ?? DEFAULT_PRODUCT_STATE) as ProductState;
  const shot = step.step.shot as CameraShot;
  const metadata = step.step.metadata as { label: string; note: string };

  return (
    <PlaygroundWorkspace
      sidebar={
        <ShotList
          activeId={step.step.id}
          onSelect={(id) => step.goTo(id)}
          items={guidedSequence.steps.map((item, index) => ({
            id: item.id,
            index: index + 1,
            label: (item.metadata as { label: string }).label,
            anchor: item.shot?.anchor ?? 'none',
          }))}
        />
      }
      inspector={<ShotInspector shot={shot} title={metadata.label} note={metadata.note} />}
      transport={
        <GuidedTransport
          index={step.index}
          count={guidedSequence.steps.length}
          canPrevious={step.index > 0}
          canNext={step.index < guidedSequence.steps.length - 1}
          onPrevious={step.previous}
          onNext={step.next}
          onReset={step.reset}
        />
      }
    >
      <GuidedCameraViewport viewport={viewport} state={state} shot={shot} debug={debug} />
    </PlaygroundWorkspace>
  );
}

function TimelinePlayground({
  viewport,
  debug,
}: {
  viewport: (typeof viewportPresets)[ViewportPreset];
  debug: boolean;
}) {
  const clock = useSequenceClock();
  const snapshot = useSequenceClockSnapshot();
  const frame = useSequenceFrame();
  const [lastCue, setLastCue] = useState<string | null>(null);
  const cueTimerRef = useRef<number | null>(null);
  const status: DeliveryStatus =
    frame.values.status >= 1.5 ? 'ready' : frame.values.status >= 0.5 ? 'review' : 'drafting';
  const state: ProductState = {
    activeScene: Math.min(4, Math.max(0, Math.round(frame.values.scene))),
    comments: Math.max(1, Math.floor(frame.values.comments)),
    progress: frame.values.progress,
    status,
  };
  const activeBeat = frame.beat;
  const shot = activeBeat?.shot ?? timelineSequence.beats[0]!.shot!;

  useSequenceCues({
    onCue: (cue) => {
      setLastCue(cue.id);
      if (cueTimerRef.current !== null) window.clearTimeout(cueTimerRef.current);
      cueTimerRef.current = window.setTimeout(
        () => setLastCue((current) => (current === cue.id ? null : current)),
        1400
      );
    },
  });

  useEffect(
    () => () => {
      if (cueTimerRef.current !== null) window.clearTimeout(cueTimerRef.current);
    },
    []
  );

  return (
    <PlaygroundWorkspace
      sidebar={<BeatList activeId={activeBeat?.id ?? null} onSelect={(time) => clock.seek(time)} />}
      inspector={
        <ShotInspector
          shot={shot}
          title={activeBeat?.title ?? 'No beat'}
          note={activeBeat?.body ?? 'Awaiting the first beat'}
        />
      }
      transport={<TimelineTransport />}
    >
      <TimelineCameraViewport viewport={viewport} state={state} shot={shot} debug={debug} />
      {lastCue ? (
        <div className="cue-toast" role="status">
          <CircleDot size={15} />
          Cue crossed · {lastCue}
        </div>
      ) : null}
      <span className="sr-only">{snapshot.time.toFixed(1)} seconds</span>
    </PlaygroundWorkspace>
  );
}

function PlaygroundWorkspace({
  sidebar,
  inspector,
  transport,
  children,
}: {
  sidebar: ReactNode;
  inspector: ReactNode;
  transport: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="workspace-layout">
      <aside className="control-panel left-panel">{sidebar}</aside>
      <section className="camera-workspace">{children}</section>
      <aside className="control-panel right-panel">{inspector}</aside>
      <footer className="transport-bar">{transport}</footer>
    </div>
  );
}

function GuidedCameraViewport({
  viewport,
  state,
  shot,
  debug,
}: {
  viewport: (typeof viewportPresets)[ViewportPreset];
  state: ProductState;
  shot: CameraShot;
  debug: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const camera = useSequenceStepCamera({
    viewportRef,
    stageRef,
    fallbackRect: FALLBACK_RECT,
    hideUntilReady: true,
    onReady,
  });

  return (
    <CameraFrame viewport={viewport} ready={ready} onRefresh={camera.refresh}>
      <div ref={viewportRef} className="camera-viewport">
        <ProductStage ref={stageRef} state={state} activeAnchor={shot.anchor} debug={debug} />
      </div>
    </CameraFrame>
  );
}

function TimelineCameraViewport({
  viewport,
  state,
  shot,
  debug,
}: {
  viewport: (typeof viewportPresets)[ViewportPreset];
  state: ProductState;
  shot: CameraShot;
  debug: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const camera = useSequenceCamera({
    viewportRef,
    stageRef,
    fallbackRect: FALLBACK_RECT,
    hideUntilReady: true,
    onReady,
  });

  return (
    <CameraFrame viewport={viewport} ready={ready} onRefresh={camera.refresh}>
      <div ref={viewportRef} className="camera-viewport">
        <ProductStage ref={stageRef} state={state} activeAnchor={shot.anchor} debug={debug} />
      </div>
    </CameraFrame>
  );
}

function CameraFrame({
  viewport,
  ready,
  onRefresh,
  children,
}: {
  viewport: (typeof viewportPresets)[ViewportPreset];
  ready: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const style = {
    '--preview-width': `${viewport.width}px`,
    '--preview-ratio': `${viewport.width} / ${viewport.height}`,
  } as CSSProperties;

  return (
    <div className="camera-frame-wrap">
      <div className="camera-frame" style={style}>
        {children}
        <div className="frame-status">
          <span data-ready={ready ? 'true' : 'false'} />
          {ready ? 'Camera ready' : 'Composing'}
        </div>
        <IconButton label="Re-measure camera" onClick={onRefresh}>
          <Crosshair size={16} />
        </IconButton>
      </div>
      <span className="viewport-caption">
        {viewport.label} · {viewport.width} × {viewport.height}
      </span>
    </div>
  );
}

const ProductStage = forwardRef<
  HTMLDivElement,
  {
    state: ProductState;
    activeAnchor: string;
    debug: boolean;
  }
>(function ProductStage({ state, activeAnchor, debug }, ref) {
  const anchor = (name: string) => ({
    ...cameraAnchorProps(name),
    'data-anchor-label': name,
    'data-camera-subject': debug && activeAnchor === name ? 'true' : undefined,
  });

  return (
    <div
      ref={ref}
      className="film-stage"
      data-debug-anchors={debug ? 'true' : undefined}
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
    >
      <article className="product-window" {...anchor('window')}>
        <header className="product-topbar">
          <div className="product-project">
            <span className="project-symbol">
              <WandSparkles size={16} />
            </span>
            <span>
              <strong>Northstar Cut</strong>
              <small>Campaign film · v12</small>
            </span>
          </div>
          <div className="product-actions">
            <div className="avatar-stack" aria-label="3 collaborators">
              <span>AM</span>
              <span>RK</span>
              <span>+1</span>
            </div>
            <button className="product-button secondary" type="button">
              <MessageSquare size={14} />
              Review
            </button>
            <button className="product-button primary" type="button" {...anchor('publish')}>
              {state.status === 'ready' ? <Check size={14} /> : <Send size={14} />}
              {state.status === 'ready' ? 'Ready' : 'Publish'}
            </button>
          </div>
        </header>

        <div className="product-body">
          <aside className="scene-sidebar" {...anchor('sidebar')}>
            <div className="section-heading">
              <span>Scenes</span>
              <button type="button" aria-label="Scene options" title="Scene options">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <div className="scene-list">
              {scenes.map((scene, index) => (
                <button
                  className="scene-row"
                  data-active={state.activeScene === index ? 'true' : undefined}
                  key={scene.id}
                  type="button"
                >
                  <span className="scene-number">{scene.id}</span>
                  <span className="scene-thumb" data-tone={scene.tone}>
                    {scene.tone === 'photo' ? (
                      <img src="/storyboard-road.jpg" alt="Desert road between red rock cliffs" />
                    ) : null}
                  </span>
                  <span className="scene-copy">
                    <strong>{scene.name}</strong>
                    <small>{scene.time}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="media-bin">
              <Layers3 size={15} />
              <span>Media</span>
              <strong>24</strong>
            </div>
          </aside>

          <section className="edit-surface">
            <div className="canvas-toolbar">
              <span>Frame 03</span>
              <div className="canvas-zoom">
                <span>Fit</span>
                <span>82%</span>
              </div>
            </div>
            <div className="story-canvas" {...anchor('story-canvas')}>
              <div className="film-frame-image">
                <img src="/storyboard-road.jpg" alt="Desert road between red rock cliffs" />
                <span className="frame-index">03 / 05</span>
                <div className="title-safe">
                  <span>KEEP MOVING</span>
                  <small>Northstar / Chapter one</small>
                </div>
              </div>
            </div>
            <div className="timeline-editor">
              <div className="timeline-ruler">
                <span>00:00</span>
                <span>00:08</span>
                <span>00:16</span>
                <span>00:24</span>
                <span>00:32</span>
              </div>
              <div className="timeline-tracks">
                <span className="track-label">V1</span>
                <div className="clip clip-one" />
                <div className="clip clip-two" />
                <div className="clip clip-three" />
                <div
                  className="playhead"
                  style={{ left: `${Math.min(96, Math.max(4, state.progress * 100))}%` }}
                />
              </div>
              <div className="timeline-tracks audio-track">
                <span className="track-label">A1</span>
                <div className="waveform" />
              </div>
            </div>
          </section>

          <aside className="review-panel" {...anchor('review-panel')}>
            <div className="review-heading">
              <span>Review</span>
              <span className="comment-count">{state.comments}</span>
            </div>
            <div className="approval-status" data-status={state.status}>
              <span>{state.status === 'ready' ? <Check size={14} /> : <Gauge size={14} />}</span>
              <div>
                <strong>
                  {state.status === 'ready'
                    ? 'Approved to publish'
                    : state.status === 'review'
                      ? 'Review in progress'
                      : 'First pass'}
                </strong>
                <small>{Math.round(state.progress * 100)}% complete</small>
              </div>
            </div>
            <div className="review-thread">
              <article>
                <span className="comment-avatar blue">AM</span>
                <div>
                  <strong>Alex Morgan</strong>
                  <small>00:14</small>
                  <p>The opening has room now. Hold this frame for another beat.</p>
                </div>
              </article>
              {state.comments >= 3 ? (
                <article>
                  <span className="comment-avatar coral">RK</span>
                  <div>
                    <strong>Rina Kato</strong>
                    <small>00:18</small>
                    <p>Color feels right. The cut can land after the ridge.</p>
                  </div>
                </article>
              ) : null}
              {state.comments >= 5 ? (
                <article>
                  <span className="comment-avatar green">JL</span>
                  <div>
                    <strong>Jon Lee</strong>
                    <small>Just now</small>
                    <p>Final export is clear from my side.</p>
                  </div>
                </article>
              ) : null}
            </div>
            <div className="comment-composer">
              <span>Add a comment…</span>
              <Send size={14} />
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
});

function ShotList({
  items,
  activeId,
  onSelect,
}: {
  items: { id: string; index: number; label: string; anchor: string }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="panel-heading">
        <span>Shots</span>
        <small>{items.length}</small>
      </div>
      <nav className="shot-list" aria-label="Guided shots">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={activeId === item.id ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="shot-index">{String(item.index).padStart(2, '0')}</span>
            <span className="shot-copy">
              <strong>{item.label}</strong>
              <small>{item.anchor}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </nav>
      <div className="panel-section compact">
        <span className="section-label">Driver</span>
        <div className="driver-row">
          <Crosshair size={15} />
          <span>SequenceStepController</span>
          <i>host</i>
        </div>
      </div>
    </>
  );
}

function BeatList({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (time: number) => void;
}) {
  return (
    <>
      <div className="panel-heading">
        <span>Beats</span>
        <small>{timelineSequence.beats.length}</small>
      </div>
      <nav className="shot-list" aria-label="Timeline beats">
        {timelineSequence.beats.map((beat, index) => (
          <button
            key={beat.id}
            type="button"
            data-active={activeId === beat.id ? 'true' : undefined}
            onClick={() => onSelect(beat.at)}
          >
            <span className="shot-index">{formatTime(beat.at)}</span>
            <span className="shot-copy">
              <strong>{beat.title}</strong>
              <small>{beat.shot?.anchor}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </nav>
      <div className="panel-section compact">
        <span className="section-label">Driver</span>
        <div className="driver-row">
          <Play size={15} />
          <span>SequenceClock</span>
          <i>18s</i>
        </div>
      </div>
    </>
  );
}

function ShotInspector({ shot, title, note }: { shot: CameraShot; title: string; note: string }) {
  const values = [
    ['Anchor', shot.anchor],
    ['Padding', `${shot.padding ?? 56}px`],
    ['Max scale', `${shot.maxScale ?? 2.6}×`],
    ['Zoom', `${shot.zoom ?? 1}×`],
    ['Focus X', `${Math.round((shot.focusX ?? 0.5) * 100)}%`],
    ['Focus Y', `${Math.round((shot.focusY ?? 0.5) * 100)}%`],
  ];

  return (
    <>
      <div className="panel-heading">
        <span>Camera</span>
        <Crosshair size={15} />
      </div>
      <div className="inspector-title">
        <span className="inspector-icon">
          <Aperture size={17} />
        </span>
        <div>
          <strong>{title}</strong>
          <small>{note}</small>
        </div>
      </div>
      <dl className="property-list">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="panel-section">
        <span className="section-label">Lifecycle</span>
        <ul className="lifecycle-list">
          <li>
            <Check size={14} />
            Layout-first pose
          </li>
          <li>
            <Check size={14} />
            Persistent velocity
          </li>
          <li>
            <Check size={14} />
            Exact settle
          </li>
        </ul>
      </div>
    </>
  );
}

function GuidedTransport({
  index,
  count,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onReset,
}: {
  index: number;
  count: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => boolean;
  onNext: () => boolean;
  onReset: () => boolean;
}) {
  return (
    <div className="guided-transport">
      <span className="transport-mode">
        <CircleDot size={14} />
        Guided shot
      </span>
      <div className="step-dots" aria-label={`Shot ${index + 1} of ${count}`}>
        {Array.from({ length: count }, (_, dot) => (
          <span key={dot} data-active={dot === index ? 'true' : undefined} />
        ))}
      </div>
      <div className="transport-actions">
        <button
          type="button"
          className="reset-step-button"
          aria-label="Reset guided sequence"
          title="Reset guided sequence"
          disabled={index === 0}
          onClick={() => onReset()}
        >
          <RotateCcw size={15} />
        </button>
        <button type="button" disabled={!canPrevious} onClick={() => onPrevious()}>
          <ChevronLeft size={16} />
          Previous
        </button>
        <button type="button" disabled={!canNext} onClick={() => onNext()}>
          Next shot
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function TimelineTransport() {
  const clock = useSequenceClock();
  const snapshot = useSequenceClockSnapshot();
  const rates = [0.5, 1, 1.5];

  return (
    <div className="timeline-transport">
      <div className="playback-buttons">
        <IconButton label="Restart sequence" onClick={clock.restart}>
          <RotateCcw size={16} />
        </IconButton>
        <button
          className="play-button"
          type="button"
          aria-label={snapshot.playing ? 'Pause sequence' : 'Play sequence'}
          title={snapshot.playing ? 'Pause sequence' : 'Play sequence'}
          onClick={snapshot.playing ? clock.pause : clock.play}
        >
          {snapshot.playing ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
      </div>
      <span className="timecode">{formatTime(snapshot.time)}</span>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={snapshot.duration}
        step={0.01}
        value={snapshot.time}
        aria-label="Sequence time"
        style={
          { '--scrub-progress': `${(snapshot.time / snapshot.duration) * 100}%` } as CSSProperties
        }
        onChange={(event) => clock.seek(Number(event.currentTarget.value))}
      />
      <span className="timecode muted">{formatTime(snapshot.duration)}</span>
      <div className="rate-switch" aria-label="Playback rate">
        {rates.map((rate) => (
          <button
            key={rate}
            type="button"
            data-active={snapshot.playbackRate === rate ? 'true' : undefined}
            onClick={() => clock.setPlaybackRate(rate)}
          >
            {rate}×
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `00:${String(whole).padStart(2, '0')}`;
}
