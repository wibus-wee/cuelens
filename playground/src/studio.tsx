import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import {
  AlertTriangle,
  Braces,
  Check,
  CircleDot,
  Code2,
  Crosshair,
  ListVideo,
  MousePointerClick,
  Orbit,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  EASINGS,
  cameraLayerProps,
  evaluateTrack,
  solveCameraPose,
  validateSequence,
  type AnySequenceDefinition,
  type CameraKeyframe,
  type CameraShot,
  type SequenceValidationIssue,
  type Rect,
} from '@wibus/cuelens';
import {
  CameraAnchor,
  SequenceProvider,
  useSequenceCamera,
  useSequenceClock,
  useSequenceClockSnapshot,
  useSequenceCues,
  useSequenceFrame,
} from '@wibus/cuelens/react';
import './studio.css';

const STUDIO_VIEWPORT = { width: 760, height: 480 };
const DEFAULT_FALLBACK_RECT: Rect = { x: 612, y: 346, width: 260, height: 156 };
const EASING_NAMES = new Set(Object.keys(EASINGS));

const DEFAULT_STUDIO_SOURCE = `{
  "duration": 12,
  "tracks": {
    "accent": [
      { "time": 0, "value": 0.18 },
      { "time": 4, "value": 1, "easing": "easeOutCubic" },
      { "time": 8, "value": 0.42, "easing": "easeInOutCubic" },
      { "time": 12, "value": 0.88, "easing": "easeOutQuart" }
    ],
    "lift": [
      { "time": 0, "value": 0 },
      { "time": 6, "value": 1, "easing": "easeOutBack" },
      { "time": 12, "value": 0.25, "easing": "easeInOutCubic" }
    ],
    "spread": [
      { "time": 0, "value": 0.22 },
      { "time": 5, "value": 0.74, "easing": "easeOutExpo" },
      { "time": 9, "value": 1, "easing": "easeOutElastic" }
    ]
  },
  "beats": [
    {
      "id": "canvas",
      "at": 0,
      "title": "Full canvas",
      "shot": { "anchor": "studio-canvas", "padding": 44, "maxScale": 1.1 }
    },
    {
      "id": "resolver",
      "at": 4,
      "title": "Custom resolver",
      "shot": {
        "anchor": "virtual-focus",
        "padding": 72,
        "maxScale": 1.8,
        "focusX": 0.54,
        "yaw": -16,
        "pitch": 6,
        "perspective": 1400
      }
    },
    {
      "id": "fallback",
      "at": 8,
      "title": "Function fallback",
      "shot": { "anchor": "missing-anchor", "padding": 84, "maxScale": 2, "focusY": 0.46 }
    }
  ],
  "camera": [
    { "time": 0, "anchor": "studio-canvas", "padding": 44, "maxScale": 1.1, "perspective": 0 },
    {
      "time": 3,
      "anchor": "studio-canvas",
      "padding": 60,
      "maxScale": 1.3,
      "yaw": 9,
      "pitch": -4,
      "perspective": 1200,
      "easing": "easeInOutCubic"
    },
    {
      "time": 4,
      "anchor": "virtual-focus",
      "padding": 72,
      "maxScale": 1.8,
      "focusX": 0.54,
      "yaw": -16,
      "pitch": 6,
      "perspective": 1400,
      "easing": "easeOutCubic"
    },
    {
      "time": 7.5,
      "anchor": "virtual-focus",
      "padding": 88,
      "maxScale": 1.7,
      "yaw": -5,
      "pitch": 2,
      "perspective": 1400,
      "easing": "easeInOutCubic"
    },
    {
      "time": 8,
      "anchor": "missing-anchor",
      "padding": 84,
      "maxScale": 2,
      "focusY": 0.46,
      "yaw": 7,
      "pitch": -3,
      "perspective": 1100,
      "easing": "easeOutCubic"
    },
    {
      "time": 12,
      "anchor": "studio-canvas",
      "padding": 52,
      "maxScale": 1.15,
      "perspective": 0,
      "easing": "easeInOutCubic"
    }
  ],
  "cues": [
    { "id": "mark-in", "at": 2.5, "anchor": "studio-canvas", "kind": "marker" },
    { "id": "focus-ready", "at": 6.5, "anchor": "virtual-focus", "kind": "focus" },
    { "id": "handoff", "at": 10.2, "anchor": "missing-anchor", "kind": "confirm" }
  ]
}`;

type StudioIssue = {
  code: SequenceValidationIssue['code'] | 'schema';
  path: string;
  message: string;
};

type DraftResult = {
  definition: AnySequenceDefinition | null;
  issues: StudioIssue[];
};

type RuntimeOptions = {
  autoPlay: boolean;
  loop: boolean;
  resolver: boolean;
  depthLayers: boolean;
};

type AuthorMode = 'visual' | 'code';
type VisualSection = 'tracks' | 'beats' | 'cues' | 'camera';

type MutableKeyframe = {
  time: number;
  value: number;
  easing?: string;
};

type MutableBeat = {
  id: string;
  at: number;
  title?: string;
  body?: string;
  shot?: CameraShot;
};

type MutableCue = {
  id: string;
  at: number;
  anchor: string;
  lead?: number;
  kind?: string;
};

type MutableCameraKeyframe = CameraShot & {
  time: number;
  easing?: string;
};

type MutableStudioDefinition = {
  duration: number;
  tracks: Record<string, MutableKeyframe[]>;
  beats: MutableBeat[];
  cues: MutableCue[];
  camera?: MutableCameraKeyframe[];
};

type StudioSeekRequest = {
  time: number;
  revision: number;
};

const studioHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#f0a06f' },
  { tag: tags.string, color: '#f2c66f' },
  { tag: tags.number, color: '#71c9a8' },
  { tag: [tags.bool, tags.null], color: '#8ea5ff' },
  { tag: [tags.punctuation, tags.separator], color: '#819087' },
  { tag: tags.invalid, color: '#ff876f', textDecoration: 'underline' },
]);

const studioEditorTheme = [
  EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: '#171c19',
        color: '#e8eee9',
      },
      '.cm-scroller': {
        backgroundColor: '#171c19',
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        lineHeight: '1.62',
      },
      '.cm-content': {
        padding: '14px 0 48px',
        caretColor: '#ff7658',
      },
      '.cm-gutters': {
        backgroundColor: '#171c19',
        color: '#69736d',
        border: '0',
      },
      '.cm-activeLine, .cm-activeLineGutter': {
        backgroundColor: '#202722',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: '#344d73 !important',
      },
      '&.cm-focused': {
        outline: 'none',
      },
    },
    { dark: true }
  ),
  syntaxHighlighting(studioHighlightStyle),
];

const editorExtensions = [json(), EditorView.lineWrapping];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaIssue(path: string, message: string): StudioIssue {
  return { code: 'schema', path, message };
}

const SHOT_NUMBER_FIELDS = [
  'padding',
  'minScale',
  'maxScale',
  'zoom',
  'focusX',
  'focusY',
  'yaw',
  'pitch',
  'roll',
  'perspective',
] as const;

function validateShotSchema(shot: unknown, path: string, issues: StudioIssue[]): void {
  if (!isRecord(shot) || typeof shot.anchor !== 'string') {
    issues.push(schemaIssue(path, 'A shot must contain a text anchor.'));
    return;
  }
  for (const field of SHOT_NUMBER_FIELDS) {
    const value = shot[field];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      issues.push(schemaIssue(`${path}.${field}`, `Shot ${field} must be a finite number.`));
    }
  }
}

function parseStudioDefinition(source: string): DraftResult {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      definition: null,
      issues: [
        schemaIssue(
          'document',
          error instanceof Error ? error.message : 'The definition is not valid JSON.'
        ),
      ],
    };
  }

  if (!isRecord(value)) {
    return { definition: null, issues: [schemaIssue('document', 'Expected a JSON object.')] };
  }

  const issues: StudioIssue[] = [];
  if (typeof value.duration !== 'number' || !Number.isFinite(value.duration)) {
    issues.push(schemaIssue('duration', 'Duration must be a finite number.'));
  }
  if (!isRecord(value.tracks)) issues.push(schemaIssue('tracks', 'Tracks must be an object.'));
  if (!Array.isArray(value.beats)) issues.push(schemaIssue('beats', 'Beats must be an array.'));
  if (!Array.isArray(value.cues)) issues.push(schemaIssue('cues', 'Cues must be an array.'));
  if (value.camera !== undefined && !Array.isArray(value.camera)) {
    issues.push(schemaIssue('camera', 'Camera must be an array of keyframes.'));
  }
  if (issues.length > 0) return { definition: null, issues };

  for (const [trackName, keyframes] of Object.entries(value.tracks as Record<string, unknown>)) {
    if (!Array.isArray(keyframes)) {
      issues.push(schemaIssue(`tracks.${trackName}`, 'A track must be an array of keyframes.'));
      continue;
    }
    keyframes.forEach((keyframe, index) => {
      const path = `tracks.${trackName}.${index}`;
      if (!isRecord(keyframe)) {
        issues.push(schemaIssue(path, 'A keyframe must be an object.'));
        return;
      }
      if (typeof keyframe.time !== 'number' || !Number.isFinite(keyframe.time)) {
        issues.push(schemaIssue(`${path}.time`, 'Keyframe time must be a finite number.'));
      }
      if (typeof keyframe.value !== 'number' || !Number.isFinite(keyframe.value)) {
        issues.push(schemaIssue(`${path}.value`, 'Keyframe value must be a finite number.'));
      }
      if (
        keyframe.easing !== undefined &&
        (typeof keyframe.easing !== 'string' || !EASING_NAMES.has(keyframe.easing))
      ) {
        issues.push(schemaIssue(`${path}.easing`, 'Use a named easing exported by the runtime.'));
      }
    });
  }

  (value.beats as unknown[]).forEach((beat, index) => {
    const path = `beats.${index}`;
    if (!isRecord(beat)) {
      issues.push(schemaIssue(path, 'A beat must be an object.'));
      return;
    }
    if (typeof beat.id !== 'string')
      issues.push(schemaIssue(`${path}.id`, 'Beat id must be text.'));
    if (typeof beat.at !== 'number' || !Number.isFinite(beat.at)) {
      issues.push(schemaIssue(`${path}.at`, 'Beat time must be a finite number.'));
    }
    if (beat.shot !== undefined) {
      validateShotSchema(beat.shot, `${path}.shot`, issues);
    }
  });

  ((value.camera ?? []) as unknown[]).forEach((keyframe, index) => {
    const path = `camera.${index}`;
    if (!isRecord(keyframe)) {
      issues.push(schemaIssue(path, 'A camera keyframe must be an object.'));
      return;
    }
    if (typeof keyframe.time !== 'number' || !Number.isFinite(keyframe.time)) {
      issues.push(schemaIssue(`${path}.time`, 'Keyframe time must be a finite number.'));
    }
    if (
      keyframe.easing !== undefined &&
      (typeof keyframe.easing !== 'string' || !EASING_NAMES.has(keyframe.easing))
    ) {
      issues.push(schemaIssue(`${path}.easing`, 'Use a named easing exported by the runtime.'));
    }
    validateShotSchema(keyframe, path, issues);
  });

  (value.cues as unknown[]).forEach((cue, index) => {
    const path = `cues.${index}`;
    if (!isRecord(cue)) {
      issues.push(schemaIssue(path, 'A cue must be an object.'));
      return;
    }
    if (typeof cue.id !== 'string') issues.push(schemaIssue(`${path}.id`, 'Cue id must be text.'));
    if (typeof cue.anchor !== 'string') {
      issues.push(schemaIssue(`${path}.anchor`, 'Cue anchor must be text.'));
    }
    if (typeof cue.at !== 'number' || !Number.isFinite(cue.at)) {
      issues.push(schemaIssue(`${path}.at`, 'Cue time must be a finite number.'));
    }
  });

  if (issues.length > 0) return { definition: null, issues };
  const definition = value as AnySequenceDefinition;
  return { definition, issues: validateSequence(definition) };
}

function cloneStudioDefinition(definition: AnySequenceDefinition): MutableStudioDefinition {
  return JSON.parse(JSON.stringify(definition)) as MutableStudioDefinition;
}

function studioSource(definition: AnySequenceDefinition): string {
  return JSON.stringify(definition, null, 2);
}

function uniqueId(prefix: string, ids: readonly string[]): string {
  let index = ids.length + 1;
  let candidate = `${prefix}-${index}`;
  while (ids.includes(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

function inputNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function StudioPlayground() {
  const initial = useMemo(() => parseStudioDefinition(DEFAULT_STUDIO_SOURCE), []);
  const [draft, setDraft] = useState(DEFAULT_STUDIO_SOURCE);
  const [appliedSource, setAppliedSource] = useState(DEFAULT_STUDIO_SOURCE);
  const [definition, setDefinition] = useState<AnySequenceDefinition>(() => initial.definition!);
  const [authorMode, setAuthorMode] = useState<AuthorMode>('visual');
  const [revision, setRevision] = useState(1);
  const [completionCount, setCompletionCount] = useState(0);
  const [seekRequest, setSeekRequest] = useState<StudioSeekRequest>({ time: 0, revision: 0 });
  const [fallbackRect, setFallbackRect] = useState(DEFAULT_FALLBACK_RECT);
  const [options, setOptions] = useState<RuntimeOptions>({
    autoPlay: false,
    loop: false,
    resolver: true,
    depthLayers: true,
  });
  const draftResult = useMemo(() => parseStudioDefinition(draft), [draft]);
  const dirty = draft !== appliedSource;
  const visualDefinition = draftResult.definition ?? definition;

  const applyDraft = useCallback(() => {
    if (!draftResult.definition || draftResult.issues.length > 0) return;
    setDefinition(draftResult.definition);
    setAppliedSource(draft);
    setCompletionCount(0);
    setRevision((value) => value + 1);
  }, [draft, draftResult]);

  const resetDraft = useCallback(() => {
    const reset = parseStudioDefinition(DEFAULT_STUDIO_SOURCE).definition!;
    setDraft(DEFAULT_STUDIO_SOURCE);
    setAppliedSource(DEFAULT_STUDIO_SOURCE);
    setDefinition(reset);
    setCompletionCount(0);
    setSeekRequest((current) => ({ time: 0, revision: current.revision + 1 }));
    setFallbackRect(DEFAULT_FALLBACK_RECT);
    setOptions({ autoPlay: false, loop: false, resolver: true, depthLayers: true });
    setAuthorMode('visual');
    setRevision((value) => value + 1);
  }, []);

  const updateVisualDefinition = useCallback(
    (next: AnySequenceDefinition) => {
      const source = studioSource(next);
      const result = parseStudioDefinition(source);
      setDraft(source);
      if (!result.definition || result.issues.length > 0) return;
      const durationChanged = result.definition.duration !== definition.duration;
      setDefinition(result.definition);
      setAppliedSource(source);
      if (durationChanged) {
        setCompletionCount(0);
        setRevision((value) => value + 1);
      }
    },
    [definition.duration]
  );

  const changeAuthorMode = useCallback(
    (mode: AuthorMode) => {
      if (mode === 'visual' && !draftResult.definition) {
        const source = studioSource(definition);
        setDraft(source);
        setAppliedSource(source);
      }
      setAuthorMode(mode);
    },
    [definition, draftResult.definition]
  );

  const setOption = useCallback((option: keyof RuntimeOptions, checked: boolean) => {
    setOptions((current) => ({ ...current, [option]: checked }));
  }, []);

  const seekPreview = useCallback((time: number) => {
    setSeekRequest((current) => ({ time, revision: current.revision + 1 }));
  }, []);

  const providerKey = `${revision}-${options.autoPlay}-${options.loop}`;

  return (
    <section className="studio-shell">
      <header className="studio-commandbar">
        <div className="studio-command-title">
          {authorMode === 'visual' ? <SlidersHorizontal size={16} /> : <Braces size={16} />}
          <strong>Runtime studio</strong>
          <span>v{revision}</span>
        </div>
        <div className="studio-options" aria-label="Runtime options">
          <StudioToggle
            label="Autoplay"
            checked={options.autoPlay}
            onChange={(checked) => setOption('autoPlay', checked)}
          />
          <StudioToggle
            label="Loop"
            checked={options.loop}
            onChange={(checked) => setOption('loop', checked)}
          />
          <StudioToggle
            label="Resolver"
            checked={options.resolver}
            onChange={(checked) => setOption('resolver', checked)}
          />
          <StudioToggle
            label="3D layers"
            checked={options.depthLayers}
            onChange={(checked) => setOption('depthLayers', checked)}
          />
        </div>
        <div className="studio-command-actions">
          <button type="button" className="studio-secondary-button" onClick={resetDraft}>
            <RotateCcw size={14} />
            Reset
          </button>
          {authorMode === 'code' ? (
            <button
              type="button"
              className="studio-apply-button"
              disabled={!dirty || !draftResult.definition || draftResult.issues.length > 0}
              onClick={applyDraft}
            >
              <Check size={14} />
              Apply
            </button>
          ) : (
            <span
              className="studio-live-status"
              data-state={draftResult.issues.length > 0 ? 'blocked' : 'live'}
            >
              {draftResult.issues.length > 0 ? (
                <AlertTriangle size={12} />
              ) : (
                <CircleDot size={12} />
              )}
              {draftResult.issues.length > 0 ? 'Draft' : 'Live'}
            </span>
          )}
        </div>
      </header>

      <div className="studio-main">
        <StudioAuthorPane
          mode={authorMode}
          onModeChange={changeAuthorMode}
          draft={draft}
          onDraftChange={setDraft}
          definition={visualDefinition}
          onDefinitionChange={updateVisualDefinition}
          onSeek={seekPreview}
          issues={draftResult.issues}
          dirty={dirty}
        />

        <SequenceProvider
          key={providerKey}
          definition={definition}
          autoPlay={options.autoPlay}
          loop={options.loop}
          onComplete={() => setCompletionCount((value) => value + 1)}
        >
          <StudioRuntime
            definition={definition}
            resolverEnabled={options.resolver}
            depthLayers={options.depthLayers}
            completionCount={completionCount}
            draftIssues={draftResult.issues}
            seekRequest={seekRequest}
            fallbackRect={fallbackRect}
            onFallbackRectChange={setFallbackRect}
          />
        </SequenceProvider>
      </div>
    </section>
  );
}

function StudioAuthorPane({
  mode,
  onModeChange,
  draft,
  onDraftChange,
  definition,
  onDefinitionChange,
  onSeek,
  issues,
  dirty,
}: {
  mode: AuthorMode;
  onModeChange: (mode: AuthorMode) => void;
  draft: string;
  onDraftChange: (source: string) => void;
  definition: AnySequenceDefinition;
  onDefinitionChange: (definition: AnySequenceDefinition) => void;
  onSeek: (time: number) => void;
  issues: StudioIssue[];
  dirty: boolean;
}) {
  return (
    <section
      className="studio-editor-pane"
      data-author-mode={mode}
      aria-label="Sequence definition editor"
    >
      <div className="studio-pane-heading">
        <div className="studio-author-tabs" aria-label="Authoring view">
          <button
            type="button"
            data-active={mode === 'visual' ? 'true' : undefined}
            onClick={() => onModeChange('visual')}
          >
            <SlidersHorizontal size={13} />
            Visual
          </button>
          <button
            type="button"
            data-active={mode === 'code' ? 'true' : undefined}
            onClick={() => onModeChange('code')}
          >
            <Code2 size={13} />
            Code
          </button>
        </div>
        <DraftStatus issues={issues} dirty={dirty} />
      </div>
      {mode === 'visual' ? (
        <VisualDefinitionEditor
          definition={definition}
          onChange={onDefinitionChange}
          onSeek={onSeek}
        />
      ) : (
        <div className="studio-editor">
          <CodeMirror
            value={draft}
            extensions={editorExtensions}
            theme={studioEditorTheme}
            onChange={onDraftChange}
            basicSetup={{
              bracketMatching: true,
              closeBrackets: true,
              foldGutter: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              lineNumbers: true,
            }}
          />
        </div>
      )}
      <div className="studio-editor-footer">
        <span>
          {mode === 'visual'
            ? `${definition.duration}s sequence`
            : `${draft.split('\n').length} lines`}
        </span>
        <span>{dirty ? 'Draft not running' : 'Runtime in sync'}</span>
      </div>
    </section>
  );
}

function VisualDefinitionEditor({
  definition,
  onChange,
  onSeek,
}: {
  definition: AnySequenceDefinition;
  onChange: (definition: AnySequenceDefinition) => void;
  onSeek: (time: number) => void;
}) {
  const [section, setSection] = useState<VisualSection>('beats');
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [selectedBeat, setSelectedBeat] = useState(0);
  const [selectedCue, setSelectedCue] = useState(0);
  const [selectedCameraKey, setSelectedCameraKey] = useState(0);
  const mutable = cloneStudioDefinition(definition);
  const trackNames = Object.keys(mutable.tracks);
  const cameraKeys = mutable.camera ?? [];

  useEffect(() => {
    setSelectedTrack((index) => Math.min(index, Math.max(0, trackNames.length - 1)));
    setSelectedBeat((index) => Math.min(index, Math.max(0, mutable.beats.length - 1)));
    setSelectedCue((index) => Math.min(index, Math.max(0, mutable.cues.length - 1)));
    setSelectedCameraKey((index) => Math.min(index, Math.max(0, cameraKeys.length - 1)));
  }, [mutable.beats.length, mutable.cues.length, cameraKeys.length, trackNames.length]);

  const mutate = (update: (next: MutableStudioDefinition) => void): void => {
    const next = cloneStudioDefinition(definition);
    update(next);
    onChange(next as AnySequenceDefinition);
  };

  const addTrack = (): void => {
    const name = uniqueId('track', trackNames);
    mutate((next) => {
      next.tracks[name] = [
        { time: 0, value: 0 },
        { time: next.duration, value: 1, easing: 'easeOutCubic' },
      ];
    });
    setSelectedTrack(trackNames.length);
  };

  const addBeat = (): void => {
    const id = uniqueId(
      'beat',
      mutable.beats.map((beat) => beat.id)
    );
    mutate((next) => {
      next.beats.push({
        id,
        at: next.duration,
        title: 'New beat',
        shot: { anchor: 'studio-canvas', padding: 56, maxScale: 1.6 },
      });
    });
    setSelectedBeat(mutable.beats.length);
  };

  const addCue = (): void => {
    const id = uniqueId(
      'cue',
      mutable.cues.map((cue) => cue.id)
    );
    mutate((next) => {
      next.cues.push({ id, at: next.duration, anchor: 'studio-canvas', kind: 'marker' });
    });
    setSelectedCue(mutable.cues.length);
  };

  const addCameraKey = (): void => {
    mutate((next) => {
      const camera = next.camera ?? (next.camera = []);
      const last = camera.at(-1);
      camera.push({
        time: last ? Math.min(next.duration, last.time + 2) : 0,
        anchor: last?.anchor ?? 'studio-canvas',
        easing: 'easeInOutCubic',
      });
    });
    setSelectedCameraKey(cameraKeys.length);
  };

  const selectBeat = (index: number): void => {
    setSection('beats');
    setSelectedBeat(index);
    const beat = mutable.beats[index];
    if (beat) onSeek(beat.at);
  };

  const selectCue = (index: number): void => {
    setSection('cues');
    setSelectedCue(index);
    const cue = mutable.cues[index];
    if (cue) onSeek(cue.at);
  };

  const selectCameraKey = (index: number): void => {
    setSection('camera');
    setSelectedCameraKey(index);
    const keyframe = cameraKeys[index];
    if (keyframe) onSeek(keyframe.time);
  };

  return (
    <div className="visual-editor">
      <div className="visual-duration-row">
        <label>
          <span>Sequence duration</span>
          <input
            aria-label="Sequence duration"
            type="number"
            min={0.1}
            step={0.5}
            value={mutable.duration}
            onChange={(event) =>
              mutate((next) => {
                next.duration = Math.max(
                  0.1,
                  inputNumber(event.currentTarget.value, next.duration)
                );
              })
            }
          />
          <small>sec</small>
        </label>
        <span>
          {trackNames.length + mutable.beats.length + mutable.cues.length + cameraKeys.length}{' '}
          authored items
        </span>
      </div>

      <VisualTimeline
        definition={mutable}
        onSelectBeat={selectBeat}
        onSelectCue={selectCue}
        onSelectCameraKey={selectCameraKey}
      />

      <div className="visual-section-tabs" aria-label="Definition section">
        <button
          type="button"
          data-active={section === 'tracks' ? 'true' : undefined}
          onClick={() => setSection('tracks')}
        >
          <SlidersHorizontal size={13} /> Tracks <span>{trackNames.length}</span>
        </button>
        <button
          type="button"
          data-active={section === 'beats' ? 'true' : undefined}
          onClick={() => setSection('beats')}
        >
          <ListVideo size={13} /> Beats <span>{mutable.beats.length}</span>
        </button>
        <button
          type="button"
          data-active={section === 'cues' ? 'true' : undefined}
          onClick={() => setSection('cues')}
        >
          <MousePointerClick size={13} /> Cues <span>{mutable.cues.length}</span>
        </button>
        <button
          type="button"
          data-active={section === 'camera' ? 'true' : undefined}
          onClick={() => setSection('camera')}
        >
          <Orbit size={13} /> Camera <span>{cameraKeys.length}</span>
        </button>
      </div>

      {section === 'tracks' ? (
        <TrackVisualEditor
          definition={mutable}
          selected={selectedTrack}
          onSelect={setSelectedTrack}
          onMutate={mutate}
          onAdd={addTrack}
        />
      ) : section === 'beats' ? (
        <BeatVisualEditor
          definition={mutable}
          selected={selectedBeat}
          onSelect={selectBeat}
          onMutate={mutate}
          onAdd={addBeat}
          cameraLaneActive={cameraKeys.length > 0}
        />
      ) : section === 'cues' ? (
        <CueVisualEditor
          definition={mutable}
          selected={selectedCue}
          onSelect={selectCue}
          onMutate={mutate}
          onAdd={addCue}
        />
      ) : (
        <CameraVisualEditor
          definition={mutable}
          selected={selectedCameraKey}
          onSelect={selectCameraKey}
          onMutate={mutate}
          onAdd={addCameraKey}
        />
      )}
    </div>
  );
}

function VisualTimeline({
  definition,
  onSelectBeat,
  onSelectCue,
  onSelectCameraKey,
}: {
  definition: MutableStudioDefinition;
  onSelectBeat: (index: number) => void;
  onSelectCue: (index: number) => void;
  onSelectCameraKey: (index: number) => void;
}) {
  const position = (time: number): string =>
    `${Math.max(1.5, Math.min(98.5, (time / definition.duration) * 100))}%`;
  return (
    <div className="visual-timeline">
      <div className="visual-timeline-ruler">
        <span>0</span>
        <span>{(definition.duration / 2).toFixed(1)}</span>
        <span>{definition.duration}s</span>
      </div>
      <div className="visual-timeline-lane" data-lane="beats">
        <span>BEAT</span>
        {definition.beats.map((beat, index) => (
          <button
            key={`${beat.id}-${index}`}
            type="button"
            style={{ left: position(beat.at) }}
            aria-label={`Edit beat ${beat.title ?? beat.id} at ${beat.at} seconds`}
            title={`${beat.title ?? beat.id} · ${beat.at}s`}
            onClick={() => onSelectBeat(index)}
          />
        ))}
      </div>
      <div className="visual-timeline-lane" data-lane="cues">
        <span>CUE</span>
        {definition.cues.map((cue, index) => (
          <button
            key={`${cue.id}-${index}`}
            type="button"
            style={{ left: position(cue.at) }}
            aria-label={`Edit cue ${cue.id} at ${cue.at} seconds`}
            title={`${cue.id} · ${cue.at}s`}
            onClick={() => onSelectCue(index)}
          />
        ))}
      </div>
      <div className="visual-timeline-lane" data-lane="camera">
        <span>CAM</span>
        {(definition.camera ?? []).map((keyframe, index) => (
          <button
            key={`${keyframe.anchor}-${index}`}
            type="button"
            style={{ left: position(keyframe.time) }}
            aria-label={`Edit camera keyframe at ${keyframe.time} seconds`}
            title={`${keyframe.anchor} · ${keyframe.time}s`}
            onClick={() => onSelectCameraKey(index)}
          />
        ))}
      </div>
    </div>
  );
}

type VisualEditorProps = {
  definition: MutableStudioDefinition;
  selected: number;
  onSelect: (index: number) => void;
  onMutate: (update: (definition: MutableStudioDefinition) => void) => void;
  onAdd: () => void;
};

function TrackVisualEditor({ definition, selected, onSelect, onMutate, onAdd }: VisualEditorProps) {
  const names = Object.keys(definition.tracks);
  const name = names[selected];
  const keyframes = name ? definition.tracks[name] : undefined;
  return (
    <div className="visual-browser">
      <VisualItemList
        label="Tracks"
        items={names.map((trackName) => ({
          title: trackName,
          meta: `${definition.tracks[trackName]!.length} keys`,
        }))}
        selected={selected}
        onSelect={onSelect}
        onAdd={onAdd}
      />
      <div className="visual-inspector">
        {name && keyframes ? (
          <>
            <VisualInspectorHeader
              eyebrow="Numeric track"
              title={name}
              deleteDisabled={names.length <= 1}
              onDelete={() =>
                onMutate((next) => {
                  delete next.tracks[name];
                })
              }
            />
            <div className="keyframe-list">
              {keyframes.map((keyframe, index) => (
                <div className="keyframe-row" key={`${index}-${keyframe.time}`}>
                  <span className="keyframe-diamond" aria-hidden />
                  <label>
                    <span>Time</span>
                    <input
                      aria-label={`${name} keyframe ${index + 1} time`}
                      type="number"
                      step={0.1}
                      value={keyframe.time}
                      onChange={(event) =>
                        onMutate((next) => {
                          next.tracks[name]![index]!.time = inputNumber(event.currentTarget.value);
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Value</span>
                    <input
                      aria-label={`${name} keyframe ${index + 1} value`}
                      type="number"
                      step={0.05}
                      value={keyframe.value}
                      onChange={(event) =>
                        onMutate((next) => {
                          next.tracks[name]![index]!.value = inputNumber(event.currentTarget.value);
                        })
                      }
                    />
                  </label>
                  <label className="keyframe-easing">
                    <span>Easing</span>
                    <select
                      aria-label={`${name} keyframe ${index + 1} easing`}
                      value={keyframe.easing ?? 'linear'}
                      onChange={(event) =>
                        onMutate((next) => {
                          const frame = next.tracks[name]![index]!;
                          frame.easing = event.currentTarget.value;
                        })
                      }
                    >
                      {Array.from(EASING_NAMES).map((easing) => (
                        <option key={easing} value={easing}>
                          {easing}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Delete ${name} keyframe ${index + 1}`}
                    title="Delete keyframe"
                    disabled={keyframes.length <= 1}
                    onClick={() =>
                      onMutate((next) => {
                        next.tracks[name]!.splice(index, 1);
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="visual-add-row"
              onClick={() =>
                onMutate((next) => {
                  const frames = next.tracks[name]!;
                  frames.push({
                    time: next.duration,
                    value: frames.at(-1)?.value ?? 0,
                    easing: 'easeOutCubic',
                  });
                })
              }
            >
              <Plus size={13} /> Add keyframe
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Shared shot inspector fields used by both beat shots and camera keyframes. */
function ShotFields({
  shot,
  onChange,
}: {
  shot: CameraShot;
  onChange: (shot: CameraShot) => void;
}) {
  const set = (patch: Partial<CameraShot>): void => onChange({ ...shot, ...patch });
  return (
    <>
      <VisualTextField
        label="Camera anchor"
        value={shot.anchor}
        mono
        wide
        onChange={(anchor) => set({ anchor })}
      />
      <VisualNumberField
        label="Padding"
        value={shot.padding ?? 56}
        suffix="px"
        onChange={(padding) => set({ padding })}
      />
      <VisualNumberField
        label="Max scale"
        value={shot.maxScale ?? 2.6}
        step={0.1}
        suffix="x"
        onChange={(maxScale) => set({ maxScale })}
      />
      <VisualNumberField
        label="Focus X"
        value={shot.focusX ?? 0.5}
        step={0.05}
        onChange={(focusX) => set({ focusX })}
      />
      <VisualNumberField
        label="Focus Y"
        value={shot.focusY ?? 0.5}
        step={0.05}
        onChange={(focusY) => set({ focusY })}
      />
      <VisualRangeField
        label="Yaw"
        value={shot.yaw ?? 0}
        min={-60}
        max={60}
        suffix="°"
        onChange={(yaw) => set({ yaw })}
      />
      <VisualRangeField
        label="Pitch"
        value={shot.pitch ?? 0}
        min={-60}
        max={60}
        suffix="°"
        onChange={(pitch) => set({ pitch })}
      />
      <VisualRangeField
        label="Roll"
        value={shot.roll ?? 0}
        min={-45}
        max={45}
        suffix="°"
        onChange={(roll) => set({ roll })}
      />
      <VisualRangeField
        label="Perspective"
        value={shot.perspective ?? 1200}
        min={300}
        max={3200}
        step={20}
        suffix="px"
        onChange={(perspective) => set({ perspective })}
      />
    </>
  );
}

function BeatVisualEditor({
  definition,
  selected,
  onSelect,
  onMutate,
  onAdd,
  cameraLaneActive,
}: VisualEditorProps & { cameraLaneActive: boolean }) {
  const beat = definition.beats[selected];
  const shot = beat?.shot ?? { anchor: 'studio-canvas' };
  return (
    <div className="visual-browser">
      <VisualItemList
        label="Beats"
        items={definition.beats.map((item) => ({
          title: item.title ?? item.id,
          meta: `${item.at}s · ${item.shot?.anchor ?? 'no shot'}`,
        }))}
        selected={selected}
        onSelect={onSelect}
        onAdd={onAdd}
      />
      <div className="visual-inspector">
        {beat ? (
          <>
            <VisualInspectorHeader
              eyebrow={`Beat ${selected + 1}`}
              title={beat.title ?? beat.id}
              onDelete={() =>
                onMutate((next) => {
                  next.beats.splice(selected, 1);
                })
              }
            />
            {cameraLaneActive ? (
              <p className="visual-lane-note">
                <Orbit size={11} /> The camera lane is driving shots; this shot is parked.
              </p>
            ) : null}
            <div className="visual-field-grid">
              <VisualTextField
                label="Title"
                value={beat.title ?? ''}
                onChange={(value) =>
                  onMutate((next) => {
                    next.beats[selected]!.title = value;
                  })
                }
              />
              <VisualTextField
                label="ID"
                value={beat.id}
                mono
                onChange={(value) =>
                  onMutate((next) => {
                    next.beats[selected]!.id = value;
                  })
                }
              />
              <VisualNumberField
                label="Start time"
                value={beat.at}
                step={0.1}
                suffix="sec"
                onChange={(value) =>
                  onMutate((next) => {
                    next.beats[selected]!.at = value;
                  })
                }
              />
              <ShotFields
                shot={shot}
                onChange={(nextShot) =>
                  onMutate((next) => {
                    next.beats[selected]!.shot = nextShot;
                  })
                }
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function CameraVisualEditor({
  definition,
  selected,
  onSelect,
  onMutate,
  onAdd,
}: VisualEditorProps) {
  const camera = definition.camera ?? [];
  const keyframe = camera[selected];
  return (
    <div className="visual-browser">
      <VisualItemList
        label="Camera keys"
        items={camera.map((item) => ({
          title: `${item.time}s`,
          meta: item.anchor,
        }))}
        selected={selected}
        onSelect={onSelect}
        onAdd={onAdd}
      />
      <div className="visual-inspector">
        {keyframe ? (
          <>
            <VisualInspectorHeader
              eyebrow={`Camera key ${selected + 1}`}
              title={keyframe.anchor}
              onDelete={() =>
                onMutate((next) => {
                  next.camera?.splice(selected, 1);
                })
              }
            />
            <p className="visual-lane-note">
              <Orbit size={11} /> Camera keyframes drive the shot; beat shots are parked.
            </p>
            <div className="visual-field-grid">
              <VisualNumberField
                label="Time"
                value={keyframe.time}
                step={0.1}
                suffix="sec"
                onChange={(value) =>
                  onMutate((next) => {
                    next.camera![selected]!.time = value;
                  })
                }
              />
              <label className="visual-field">
                <span>Easing</span>
                <div>
                  <select
                    aria-label="Camera keyframe easing"
                    value={keyframe.easing ?? 'linear'}
                    onChange={(event) =>
                      onMutate((next) => {
                        next.camera![selected]!.easing = event.currentTarget.value;
                      })
                    }
                  >
                    {Array.from(EASING_NAMES).map((easing) => (
                      <option key={easing} value={easing}>
                        {easing}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <ShotFields
                shot={keyframe}
                onChange={(nextShot) =>
                  onMutate((next) => {
                    const current = next.camera![selected]!;
                    next.camera![selected] = {
                      ...nextShot,
                      time: current.time,
                      easing: current.easing,
                    };
                  })
                }
              />
            </div>
          </>
        ) : (
          <p className="visual-lane-note">
            <Orbit size={11} /> No camera keyframes yet — add one to keep the camera moving inside a
            beat.
          </p>
        )}
      </div>
    </div>
  );
}

function CueVisualEditor({ definition, selected, onSelect, onMutate, onAdd }: VisualEditorProps) {
  const cue = definition.cues[selected];
  return (
    <div className="visual-browser">
      <VisualItemList
        label="Cues"
        items={definition.cues.map((item) => ({
          title: item.id,
          meta: `${item.at}s · ${item.kind ?? 'event'}`,
        }))}
        selected={selected}
        onSelect={onSelect}
        onAdd={onAdd}
      />
      <div className="visual-inspector">
        {cue ? (
          <>
            <VisualInspectorHeader
              eyebrow={`Cue ${selected + 1}`}
              title={cue.id}
              onDelete={() =>
                onMutate((next) => {
                  next.cues.splice(selected, 1);
                })
              }
            />
            <div className="visual-field-grid">
              <VisualTextField
                label="ID"
                value={cue.id}
                mono
                onChange={(value) =>
                  onMutate((next) => {
                    next.cues[selected]!.id = value;
                  })
                }
              />
              <VisualNumberField
                label="Fire at"
                value={cue.at}
                step={0.1}
                suffix="sec"
                onChange={(value) =>
                  onMutate((next) => {
                    next.cues[selected]!.at = value;
                  })
                }
              />
              <VisualTextField
                label="Anchor"
                value={cue.anchor}
                mono
                wide
                onChange={(value) =>
                  onMutate((next) => {
                    next.cues[selected]!.anchor = value;
                  })
                }
              />
              <VisualTextField
                label="Kind"
                value={cue.kind ?? ''}
                onChange={(value) =>
                  onMutate((next) => {
                    next.cues[selected]!.kind = value;
                  })
                }
              />
              <VisualNumberField
                label="Lead"
                value={cue.lead ?? 0}
                step={0.1}
                suffix="sec"
                onChange={(value) =>
                  onMutate((next) => {
                    next.cues[selected]!.lead = value;
                  })
                }
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function VisualItemList({
  label,
  items,
  selected,
  onSelect,
  onAdd,
}: {
  label: string;
  items: Array<{ title: string; meta: string }>;
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="visual-item-list">
      <div className="visual-list-heading">
        <span>{label}</span>
        <button
          type="button"
          aria-label={`Add ${label.toLowerCase().slice(0, -1)}`}
          title={`Add ${label.toLowerCase().slice(0, -1)}`}
          onClick={onAdd}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="visual-list-scroll">
        {items.map((item, index) => (
          <button
            key={`${item.title}-${index}`}
            type="button"
            data-active={index === selected ? 'true' : undefined}
            onClick={() => onSelect(index)}
          >
            <strong>{item.title || 'Untitled'}</strong>
            <span>{item.meta}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VisualInspectorHeader({
  eyebrow,
  title,
  deleteDisabled,
  onDelete,
}: {
  eyebrow: string;
  title: string;
  deleteDisabled?: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="visual-inspector-header">
      <div>
        <span>{eyebrow}</span>
        <strong>{title || 'Untitled'}</strong>
      </div>
      <button
        type="button"
        aria-label={`Delete ${title}`}
        title="Delete"
        disabled={deleteDisabled}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function VisualTextField({
  label,
  value,
  mono,
  wide,
  onChange,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className="visual-field"
      data-wide={wide ? 'true' : undefined}
      data-mono={mono ? 'true' : undefined}
    >
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function VisualNumberField({
  label,
  value,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="visual-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          step={step}
          value={value}
          onChange={(event) => onChange(inputNumber(event.currentTarget.value, value))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function VisualRangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="visual-field visual-range-field" data-wide="true">
      <span>{label}</span>
      <div>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={Math.max(min, Math.min(max, value))}
          onChange={(event) => onChange(inputNumber(event.currentTarget.value, value))}
        />
        <input
          type="number"
          aria-label={label}
          step={step}
          value={value}
          onChange={(event) => onChange(inputNumber(event.currentTarget.value, value))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function StudioToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="studio-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span aria-hidden />
      {label}
    </label>
  );
}

function DraftStatus({ issues, dirty }: { issues: StudioIssue[]; dirty: boolean }) {
  if (issues.length > 0) {
    return (
      <span className="studio-draft-status" data-state="error">
        <AlertTriangle size={13} />
        {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
      </span>
    );
  }
  return (
    <span className="studio-draft-status" data-state={dirty ? 'dirty' : 'valid'}>
      <Check size={13} />
      {dirty ? 'Ready to apply' : 'Valid'}
    </span>
  );
}

function StudioRuntime({
  definition,
  resolverEnabled,
  depthLayers,
  completionCount,
  draftIssues,
  seekRequest,
  fallbackRect,
  onFallbackRectChange,
}: {
  definition: AnySequenceDefinition;
  resolverEnabled: boolean;
  depthLayers: boolean;
  completionCount: number;
  draftIssues: StudioIssue[];
  seekRequest: StudioSeekRequest;
  fallbackRect: Rect;
  onFallbackRectChange: (rect: Rect) => void;
}) {
  const clock = useSequenceClock();
  const snapshot = useSequenceClockSnapshot();
  const frame = useSequenceFrame();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [cueLog, setCueLog] = useState<Array<{ id: string; at: number }>>([]);
  const handledSeekRevisionRef = useRef(seekRequest.revision);
  const fallbackRef = useRef(fallbackRect);
  fallbackRef.current = fallbackRect;

  const resolveAnchor = useCallback((stage: HTMLElement, anchor: string) => {
    return anchor === 'virtual-focus'
      ? stage.querySelector<HTMLElement>('[data-studio-resolver="true"]')
      : null;
  }, []);
  const resolveFallback = useCallback(() => fallbackRef.current, []);
  const onReady = useCallback(() => setReady(true), []);

  const camera = useSequenceCamera({
    viewportRef,
    stageRef,
    resolveAnchor: resolverEnabled ? resolveAnchor : undefined,
    fallbackRect: resolveFallback,
    hideUntilReady: true,
    depthLayers,
    onReady,
  });

  useEffect(() => {
    if (handledSeekRevisionRef.current === seekRequest.revision) return;
    handledSeekRevisionRef.current = seekRequest.revision;
    clock.pause();
    clock.seek(seekRequest.time);
  }, [clock, seekRequest]);

  useSequenceCues({
    onCue: (cue) => setCueLog((current) => [{ id: cue.id, at: cue.at }, ...current].slice(0, 4)),
  });

  const accent = frame.values.accent ?? 0;
  const lift = frame.values.lift ?? 0;
  const spread = frame.values.spread ?? 0;
  const stageStyle = {
    '--studio-accent': Math.max(0, Math.min(1, accent)),
    '--studio-border-width': `${2 + Math.max(0, Math.min(1, accent)) * 3}px`,
    '--studio-copy-offset': `${(1 - Math.max(0, Math.min(1, accent))) * 14}px`,
    '--studio-lift': `${Math.round(lift * 34)}px`,
    '--studio-spread': `${Math.round(spread * 88)}px`,
    '--studio-fallback-x': `${fallbackRect.x}px`,
    '--studio-fallback-y': `${fallbackRect.y}px`,
    '--studio-fallback-width': `${fallbackRect.width}px`,
    '--studio-fallback-height': `${fallbackRect.height}px`,
  } as CSSProperties;

  return (
    <>
      <section className="studio-preview-pane" aria-label="Live sequence runtime">
        <div className="studio-preview-heading">
          <div>
            <CircleDot size={14} />
            <strong>{frame.beat?.title ?? 'Pre-roll'}</strong>
          </div>
          <span data-ready={ready ? 'true' : undefined}>
            {ready ? 'Camera ready' : 'Composing'}
          </span>
          <button type="button" aria-label="Re-measure studio camera" onClick={camera.refresh}>
            <Crosshair size={15} />
          </button>
        </div>
        <div className="studio-preview-canvas">
          <div ref={viewportRef} className="studio-camera-viewport">
            <div ref={stageRef} className="studio-stage" style={stageStyle}>
              <div className="studio-stage-backdrop" aria-hidden {...cameraLayerProps(-140)} />
              <CameraAnchor anchor="studio-canvas" className="studio-canvas-anchor">
                <header className="studio-film-header">
                  <div>
                    <span>NF / 04</span>
                    <strong>Northstar field notes</strong>
                  </div>
                  <span>{Math.round(frame.progress * 100)}%</span>
                </header>
                <div className="studio-film-grid">
                  <div className="studio-film-image">
                    <img src="/storyboard-road.jpg" alt="Desert road between red rock cliffs" />
                    <span>Sequence 04</span>
                  </div>
                  <div className="studio-film-copy">
                    <small>LIVE COMPOSITION</small>
                    <strong>Make motion answer to meaning.</strong>
                    <p>One definition. Real DOM. A camera that can be inspected.</p>
                    <div className="studio-progress-track">
                      <span style={{ width: `${Math.max(4, frame.progress * 100)}%` }} />
                    </div>
                  </div>
                </div>
                <div className="studio-keyframe-rail" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </CameraAnchor>
              <div
                className="studio-resolver-target"
                data-studio-resolver="true"
                {...cameraLayerProps(150)}
              >
                <Crosshair size={26} />
                <span>virtual-focus</span>
              </div>
              <div className="studio-fallback-ghost" aria-hidden {...cameraLayerProps(40)}>
                function fallback
              </div>
            </div>
          </div>
        </div>
        <StudioTransport />
      </section>

      <aside className="studio-inspector-pane">
        <StudioInspector
          definition={definition}
          frameValues={frame.values}
          activeShot={frame.shot}
          activeAnchor={frame.shot?.anchor ?? 'none'}
          completionCount={completionCount}
          cueLog={cueLog}
          draftIssues={draftIssues}
          fallbackRect={fallbackRect}
          onFallbackRectChange={onFallbackRectChange}
        />
      </aside>
    </>
  );
}

function StudioTransport() {
  const clock = useSequenceClock();
  const snapshot = useSequenceClockSnapshot();
  return (
    <div className="studio-transport">
      <button type="button" aria-label="Restart studio sequence" onClick={clock.restart}>
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        className="studio-play-button"
        aria-label={snapshot.playing ? 'Pause studio sequence' : 'Play studio sequence'}
        onClick={snapshot.playing ? clock.pause : clock.play}
      >
        {snapshot.playing ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" />
        )}
      </button>
      <span>{formatTime(snapshot.time)}</span>
      <input
        aria-label="Studio sequence time"
        type="range"
        min={0}
        max={snapshot.duration}
        step={0.01}
        value={snapshot.time}
        style={
          { '--studio-time': `${(snapshot.time / snapshot.duration) * 100}%` } as CSSProperties
        }
        onChange={(event) => clock.seek(Number(event.currentTarget.value))}
      />
      <span>{formatTime(snapshot.duration)}</span>
      <select
        aria-label="Studio playback rate"
        value={snapshot.playbackRate}
        onChange={(event) => clock.setPlaybackRate(Number(event.currentTarget.value))}
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={1.5}>1.5x</option>
        <option value={2}>2x</option>
      </select>
    </div>
  );
}

function StudioInspector({
  definition,
  frameValues,
  activeShot,
  activeAnchor,
  completionCount,
  cueLog,
  draftIssues,
  fallbackRect,
  onFallbackRectChange,
}: {
  definition: AnySequenceDefinition;
  frameValues: Record<string, number>;
  activeShot: CameraShot | null;
  activeAnchor: string;
  completionCount: number;
  cueLog: Array<{ id: string; at: number }>;
  draftIssues: StudioIssue[];
  fallbackRect: Rect;
  onFallbackRectChange: (rect: Rect) => void;
}) {
  const pose = solveCameraPose(fallbackRect, STUDIO_VIEWPORT, activeShot ?? {});

  return (
    <div className="studio-inspector-scroll">
      <section className="studio-inspector-section">
        <div className="studio-inspector-heading">
          <span>Validation</span>
          <small>{draftIssues.length === 0 ? 'PASS' : `${draftIssues.length} OPEN`}</small>
        </div>
        {draftIssues.length === 0 ? (
          <p className="studio-valid-line">
            <Check size={14} /> Definition is runnable
          </p>
        ) : (
          <div className="studio-issue-list">
            {draftIssues.slice(0, 4).map((issue, index) => (
              <div key={`${issue.path}-${index}`}>
                <strong>{issue.path}</strong>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="studio-inspector-section">
        <div className="studio-inspector-heading">
          <span>Live frame</span>
          <small>{activeAnchor}</small>
        </div>
        <div className="studio-value-grid">
          {Object.entries(frameValues).map(([name, value]) => (
            <div key={name}>
              <span>{name}</span>
              <strong>{value.toFixed(3)}</strong>
            </div>
          ))}
        </div>
        <TrackPlot definition={definition} />
      </section>

      <section className="studio-inspector-section">
        <div className="studio-inspector-heading">
          <span>Fallback geometry</span>
          <small>FUNCTION</small>
        </div>
        <div className="studio-rect-grid">
          {(Object.keys(fallbackRect) as Array<keyof Rect>).map((field) => (
            <label key={field}>
              <span>{field}</span>
              <input
                type="number"
                value={fallbackRect[field]}
                onChange={(event) =>
                  onFallbackRectChange({
                    ...fallbackRect,
                    [field]: Number(event.currentTarget.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="studio-pose-result">
          <span>x {pose.x.toFixed(1)}</span>
          <span>y {pose.y.toFixed(1)}</span>
          <strong>{pose.scale.toFixed(3)}x</strong>
        </div>
        <div className="studio-pose-result">
          <span>yaw {(activeShot?.yaw ?? 0).toFixed(1)}°</span>
          <span>pitch {(activeShot?.pitch ?? 0).toFixed(1)}°</span>
          <span>roll {(activeShot?.roll ?? 0).toFixed(1)}°</span>
          <strong>
            {((activeShot?.perspective ??
            ((activeShot?.yaw ?? 0) !== 0 ||
              (activeShot?.pitch ?? 0) !== 0 ||
              (activeShot?.roll ?? 0) !== 0))
              ? (activeShot?.perspective ?? 1200)
              : 0
            ).toFixed(0)}
            px
          </strong>
        </div>
      </section>

      <section className="studio-inspector-section">
        <div className="studio-inspector-heading">
          <span>Runtime events</span>
          <small>{completionCount} COMPLETE</small>
        </div>
        <div className="studio-event-log" aria-live="polite">
          {cueLog.length === 0 ? (
            <span>No cue crossings</span>
          ) : (
            cueLog.map((cue, index) => (
              <div key={`${cue.id}-${index}`}>
                <CircleDot size={11} />
                <strong>{cue.id}</strong>
                <span>{cue.at.toFixed(2)}s</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function TrackPlot({ definition }: { definition: AnySequenceDefinition }) {
  return (
    <div className="studio-track-plot">
      {Object.entries(definition.tracks)
        .slice(0, 3)
        .map(([name, keyframes], trackIndex) => {
          const samples = Array.from({ length: 25 }, (_, index) =>
            evaluateTrack(keyframes, (index / 24) * definition.duration)
          );
          const minimum = Math.min(...samples);
          const maximum = Math.max(...samples);
          const span = Math.max(0.0001, maximum - minimum);
          const points = samples
            .map((value, index) => `${(index / 24) * 120},${24 - ((value - minimum) / span) * 20}`)
            .join(' ');
          return (
            <div key={name}>
              <span>{name}</span>
              <svg viewBox="0 0 120 28" role="img" aria-label={`${name} easing curve`}>
                <line x1="0" y1="24" x2="120" y2="24" />
                <polyline data-track={trackIndex} points={points} />
              </svg>
            </div>
          );
        })}
    </div>
  );
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
