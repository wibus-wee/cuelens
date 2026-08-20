# Interactive Onboarding Film：当前接入、历史案例与 Creator 设计

本文说明 `@wibus/interactive-film` 的当前能力、它与 Lody 当前 onboarding 的对应关系，以及最初 continuous product tour 留下的设计经验。最后一部分描述未来怎样把 runtime 扩展成创建此类体验的工具。

文中所说的 film 不是视频文件。画面来自 host 的真实 React/DOM 组件，镜头来自 DOM 测量。Automatic mode 由统一 playhead 驱动；step mode 则由 host 的表单或向导状态驱动，同一 camera core 服务两种模式。

| 层                     | 当前状态                                                                                  | 代码所有者                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Lody onboarding        | 主 renderer 的 `/onboarding` route；四段 illustrated ceremony 后进入 phase-driven setup。 | Lody `packages/components/src/components/onboarding/`                                                                    |
| Lody product camera    | 持久 `OnboardingShellHost` 内的 `TourStill`；form state 决定真实产品 fixture 和 shot。    | Lody `onboarding-shell.tsx`、`tour/tour-still.tsx`、`tour/camera.ts`                                                     |
| Package step mode      | `FilmStepProvider`、`useFilmStep()`、`useFilmStepCamera()` 对应当前向导式驱动。           | [`src/steps.ts`](../../src/steps.ts)、[`src/react.tsx`](../../src/react.tsx)                                             |
| Package automatic mode | 保留最初 continuous tour 提炼出的 playhead、track、beat、cue 和 replay semantics。        | [`src/definition.ts`](../../src/definition.ts)、[`src/clock.ts`](../../src/clock.ts)、[`src/cues.ts`](../../src/cues.ts) |
| Shared camera core     | DOM anchor、transform-aware measurement、fit framing、log-scale spring。                  | [`src/camera.ts`](../../src/camera.ts)                                                                                   |
| Playground             | 独立 Vite app，验证 step、automatic camera 与 JSON authoring 的发布边界和视觉行为。       | [`playground/`](../../playground/)                                                                                       |

第 1、2、7、8、9、10 节保留 continuous film 的设计模型，它们解释 package automatic mode 的来源，不代表这些旧 tour 文件仍存在于当前 Lody 分支。

## 1. 一句话模型

整个系统可以压缩成这张图：

```text
                           one master playhead (seconds)
                                      |
                +---------------------+---------------------+
                |                     |                     |
          numeric tracks         narrative beats      imperative cues
      连续/离散产品状态         文案 + camera shot       点击/音效/命令
                |                     |                     |
                v                     v                     v
       fixture-backed real UI   DOM anchor camera     host-owned effect
                |                     |                     |
                +---------------------+---------------------+
                                      |
                              one visible stage
```

最重要的不是“scene 数组”，而是所有东西都能回答同一个问题：在时间 `t`，它应该是什么状态。

如果相机、文案、假 cursor、产品事件分别持有自己的 `setTimeout`，那么暂停、seek、replay、用户插手之后都无法重新对齐。最初的 continuous tour 因此收敛到一个 playhead；这个约束现在由 package automatic mode 保留。

## 2. 四种时间数据

最初的 Lody tour script 把故事拆成四类概念。原文件已不在当前 Lody onboarding 中，这些概念现在由 package 的 definition、clock 和 cue modules 持有。

### 2.1 Track：时间到数值

Track 是数值 keyframe 列表。例如：

```ts
panel: [
  { time: 0, value: 0 },
  { time: 56.6, value: 0 },
  { time: 58.2, value: 1, easing: 'easeInOutCubic' },
];
```

它表达的是“右侧 panel 在 `56.6s` 之前关闭，在 `58.2s` 完全打开”。同一套结构还驱动：

- agent run 已经出现多少条 event；
- composer 打字进度；
- sidebar 任务数量；
- 已归档任务数量；
- 第二台机器和手机是否入场；
- session 内 child tabs 数量；
- terminal dock 高度；
- preview annotation 的输入与提交进度；
- PR 从 opened、checked 到 merged 的阶段；
- 最终 handoff 的推进程度。

底层插值在 `packages/components/src/lib/motion/timeline.ts`。keyframe 上的 easing 表示“进入这个 keyframe 的那一段如何缓动”，与 After Effects/Framer 的理解一致。

Track 只负责事实，不负责 UI。例如 `tasks = 3.4` 不代表要画一个 40% 的第三行。host 可以选择 `Math.floor` 得到三行，也可以用小数控制第三行的入场进度。

### 2.2 Beat：这一段在讲什么

Beat 是按时间排序的叙事段：

```ts
{
  at: 72,
  id: 'preview',
  title: 'Point at the running app, not at the code',
  line: 'Open what it built...',
  shot: { anchor: 'side-panel', padding: 70, maxScale: 1.7 }
}
```

Beat 同时拥有：

- 稳定 ID，用于 i18n 和 transport marker；
- fallback 文案；
- 此时相机看的 DOM anchor；
- framing 参数，例如 padding、最小和最大放大倍率。

`beatAt(t)` 取 `at <= t` 的最后一个 beat。只要首个 beat 从 0 开始，任何时刻就都有文案，不会发生上一句已清空、下一句还没出现的空档。

### 2.3 Cue：这一刻真的做什么

Cue 是命令式事件：

```ts
{ at: 74.2, anchor: 'side-panel.tab.browser', lead: 1 }
{ at: 74.9, anchor: 'browser.target', lead: 0.6 }
```

`lead` 表示 ghost cursor 提前多久开始移动；`at` 才是按下的时刻。原 continuous tour 的 cue 会：

- 打开真实 run-config menu；
- 点击真实 permission allow；
- 切换真实 sidebar row；
- 切换真实 session tab；
- 打开真实 side-panel tab；
- 点 preview 中的目标；
- 打开 PR；
- 点击真实 merge control。

Cue 不直接说“把 panel state 改成 browser”。它把 pointer/mouse/click event 发给真实节点，后续状态由组件自身的 handler 产生。这条原则让 film 不会表演一个产品实际做不到的结果。

### 2.4 Shot：相机看哪里

Shot 不存手写 `x/y/scale`，只存“看哪个节点”和“留多少呼吸空间”：

```ts
{ anchor: 'permission', padding: 150, maxScale: 1.8 }
```

真实 pose 在运行时通过 DOM rect 和 viewport 求解。布局变了、panel 正在展开、sidebar 多了一行，镜头仍会追踪正确节点。

## 3. Lody 当前运行链路

### 3.1 一个 renderer，一条完成链路

Electron 在主产品 renderer 内打开 `/onboarding`。`OnboardingOverlay` 根据 platform capability、持久 phase 和 draft 选择下一屏；完成标记由 Electron main process 持有，renderer 只保存可恢复的 phase 和表单草稿。Onboarding 不创建第二个 window、renderer tree 或 runtime lease。

### 3.2 Ceremony 与配置页使用不同驱动

`ceremony/intro-sequence.tsx` 是四段 illustrated intro。前三段按 hold 时间推进，最后一段等待用户开始；图片、文案和音频 energy 使用离散 cut 与 CSS animation，不需要 continuous film playhead。

配置页由 host phase 驱动。`OnboardingShellHost` 在 login、workspace、providers、projects、first task 和 summary 之间保持 stage、产品窗口与 camera mounted。每个 screen 注册当前 copy、actions、fixture state 和可选 shot；camera 不拥有业务 navigation。

### 3.3 Form state 驱动同一台 camera

`onboarding-shell.tsx` 的 `STEP_FRAME` 为每个 phase 提供 anchor、padding、zoom 和 focus point。`TourStill` 投影当前 identity、agent、project 和 conversation state 到真实产品组件，再用 DOM anchor 求解 pose。

首个 pose 在 layout 阶段同步写入，stage 在此之前保持隐藏。后续 phase、form state 或 shot 变化沿用同一个 motion state，保留位置和速度；viewport resize 通过 `ResizeObserver` 重新触发测量。当前 Lody 没有 continuous cue、seek 或 ghost cursor，这些能力只存在于 package automatic mode。

## 4. 真实 UI，而不是重新画一个产品截图

`tour/tour-app.tsx` 是整个方案能长期成立的关键。

它不画一个“很像 Lody”的预览，而是直接 mount 产品组件：

- `LoroSidebar`；
- `DesktopSessionDetailLayout`；
- `SessionTabBar`；
- `SessionChatStreamView`；
- `PermissionRequestCard`；
- `SessionInfoBar`；
- `SessionChatInputArea`；
- `SessionSidePanelTabBar`；
- `SessionChangesSidebar`；
- `PrTabView`；
- `TerminalDock`。

为了不连接真实后端，`tour-fixtures.ts` 在数据边界提供确定性 fixture：

- 独立 Jotai store；
- 固定 workspace、machine、session、agent config；
- 固定 timestamp，避免 relative time 形成第二个偷偷运行的时钟；
- 非联网 auth/Convex context；
- scripted terminal channel；
- 真实组件需要的 session/history/PR/check 数据。

原则是：可以脚本化数据，不要复制 UI。

这里有两个合理例外：真实 diff viewer 依赖 CLI-local evidence store，真实 preview 依赖 Electron WebContentsView 或运行中的 dev server。onboarding 环境没有这些资源，所以它们使用明确的 placeholder/page fixture，不假装是生产 viewer；但 comment composer、annotation chip、PR controls 等可复用的产品组件仍然是真实的。

## 5. Stage：为什么需要比窗口更大的世界

当前 `TourStill` 的 authored product window 是 `1700 x 1080`。Camera viewport 铺满 onboarding stage；form 和 readability veil 是它上方的独立层。`focusX/focusY` 把 subject 放到 form 旁边的可读区域，而不是通过裁小 camera viewport 制造固定左右栏。

Package 不规定 stage 尺寸。Host 可以只放一个产品窗口，也可以建立包含多个设备的更大世界；camera 始终在 stage 的未变换坐标系内工作。

Viewport 必须用 `overflow: clip`，而不是 `overflow: hidden`。后者仍会创建 scroll container，巨大的 transformed stage 可能产生非零 scroll offset，导致计算正确的 camera pose 仍然被裁偏。

## 6. DOM Anchor Camera

Camera 逻辑分为：

- Lody `tour/camera.ts`：产品 selector、geometry 和 spring；
- Lody `tour/tour-still.tsx`：首帧、每帧测量、DOM 写入和 resize lifecycle；
- package [`src/camera.ts`](../../src/camera.ts)：中性的纯 camera core；
- package [`src/react.tsx`](../../src/react.tsx)：automatic 与 step camera hooks。

### 6.1 Anchor resolution

普通节点用 `data-tour-anchor`。已有稳定产品 selector 的节点不重复打 marker：

- sidebar row 从 `data-sidebar-session-id` 派生；
- session tab 从真实 `[role="tab"]` 顺序派生；
- PR merge 找当前可见的真实 merge button。

新 package 改为中性的 `data-film-anchor`，同时允许 host 注入 custom resolver。原因是动态 list、portal、虚拟化节点通常不适合只靠一个静态属性解决。

### 6.2 Measure 必须反推 transform

`getBoundingClientRect()` 返回的是已经被 stage scale 过的坐标。若直接拿它求下一帧 scale，相机会追逐自己的输出并持续漂移。

所以测量公式是：

```text
stageX = (anchorRect.left - stageRect.left) / appliedScale
stageY = (anchorRect.top  - stageRect.top)  / appliedScale
width  = anchorRect.width  / appliedScale
height = anchorRect.height / appliedScale
```

若节点宽高小于 1，说明它尚未 layout 或还没打开，此帧不产生新 target，相机保持上一次目标。

### 6.3 Pose 是 fit，不是 crop

可用 viewport 是去掉 padding 的矩形：

```text
fitScale = min(availableWidth / subjectWidth,
               availableHeight / subjectHeight)
```

之后再应用 `minScale/maxScale`。取较小轴意味着 subject 整体必定在画面里。maxScale 防止一个 24px icon 被放大到占满全屏、丢失上下文。

### 6.4 为什么用 spring，不用 tween

相机 state 包含位置和速度。target 改变时不重启动画，而是继续带着当前速度朝新目标积分。因此：

- panel 在镜头中展开时，相机会持续跟随；
- beat 在相机还没完全停下时切换，轨迹自然拐弯；
- pause 只停故事时间，相机仍可完成 settle；
- 用户或 layout 中途改变目标，不需要猜 transition 起点。

Scale 在 log space 积分。视觉上的 1x -> 2x 和 2x -> 1x 都是两倍变化，在线性 scale 空间却不是同样距离；log scale 让推进和拉远速度对称。

`dt` 最大限制为 50ms，防止 app 在后台停了几秒后回来，一帧把相机甩出画面。

## 7. Ghost Cursor 和真实控件

`ghost-cursor.tsx` 只负责画 cursor 和 click ring，不持有时间。位置、透明度、按压 scale、ripple 都由 `use-tour-motion.ts` 直接写 DOM。

每个 cue 的生命周期是：

```text
at - lead       cursor 从目标下方出现
     |
spring toward live DOM rect
     |
at              pressed state + cue callback
     |
queueMicrotask  dispatch pointer/mouse/click sequence
     |
hold briefly    用户能看清动作结果
     |
fade out
```

使用 microtask 而不是同步 dispatch，是为了避开 React commit 阶段内 Radix `flushSync` 的冲突；又比 `setTimeout(0)` 更及时，不会出现 cursor 已经按下、控件下一两帧才反应的迟钝感。

事件序列覆盖：

```text
pointerover -> pointerenter -> pointerdown
mousedown
pointerup
mouseup -> click
focus(preventScroll)
```

这是为了兼容不同产品控件各自监听的事件，而不是让 driver 知道每个组件内部如何实现。

### 历史实现没有完成的 pointer arbitration

原 `TourStage` 注释写明：用户真实点击时，film 不暂停，只让 ghost cursor 暂退几秒，并用 `event.isTrusted` 区分用户事件和脚本事件。但当时的代码最终仍传入：

```ts
cursorEnabled: playing;
```

它没有实际维护“用户接管到期时间”。旧 Lody source 已移除，package 也刻意不提供 ghost cursor；未来 creator runtime 若增加 cursor，必须先定义显式 pointer arbitration policy。

## 8. Seek、Replay 与状态重建

交互 film 和视频最大的区别是：seek 到 80 秒时，不能只换一张图片；真实 UI 的 active tab、selected task、permission answer、PR state 都必须正确。

原 continuous tour 采用双轨策略，这套规则随后进入 package automatic mode。

### 自然播放

自然播放时，cue 点击真实控件，组件 handler 更新真实 local state。画面因果链是完整的。

### 跳转

seek 不重放所有跨过的 cue。否则从 0 拖到 80 秒会瞬间点击十几个控件、播放十几个声音。`TourStage` 侦测大于 0.6 秒的时间 discontinuity，然后用：

- `sidePanelTabAt(time)`；
- `selectedTaskAt(time)`；
- `activeTabAt(time)`；

声明式重建关键 UI state。

倒退到 permission 之前还会清空 answer；annotation/composer chip 也根据 track 值撤回。`use-tour-motion.ts` 会删除新时间点之后的 fired cue，让重新自然播放时那些动作可以再次触发。

新 package 把通用 cue 规则固化为：

- natural tick crossing：执行一次；
- forward seek：静默；
- backward seek：重新武装目的时间之后的 cue；
- restart：全部重新武装；
- loop：先执行尾段，再清理并执行新一轮开头。

但具体“seek 后 active tab 应是什么”仍是 host 的 declarative projection。未来 creator 必须要求每个命令式 cue 对应一个可重建 snapshot，或明确标成 playback-only。

## 9. React 性能分层

系统刻意分成三种刷新频率。

### 高频：直接写 DOM

- camera transform；
- ghost cursor transform/opacity；
- click ripple。

这些每帧变化，但不会要求产品树重新 render。

### 中频：细粒度连续值

- typewriter；
- annotation progress。

它们先 quantize 到 0.02 步长，再通过小 subtree 或 component ref 写入。

### 低频：产品结构状态

- visible rows；
- archived rows；
- child tabs；
- panel open；
- terminal open；
- PR stage。

这些通过 `floor` 或很低 threshold 离散化。把 `{ reveal: 6.4213 }` 每帧传入完整的 Lody component tree，会让 sidebar、stream、composer、terminal 每秒 render 60 次，却没有任何用户可见收益。

其他性能不变量：

- expensive shader mount 一次，不按 scene remount；
- shader 用 transform scale，不动画 width/height，避免 canvas backing store 每帧重建；
- shader 明确限制 pixel count 和 DPR；
- blur 只在小面积、短时间使用，静止时写 `filter: none`；
- intro 的离散 cut 用 timer + CSS；
- 相机即便暂停也用独立 rAF 完成物理 settle；
- 固定 fixture timestamp，避免出现第二个不可控时钟。

## 10. 音频是两套系统

### Score

`ceremony/use-onboarding-audio.ts` 是 procedural Web Audio sequencer：

- pad / arp / bass 三个 layer；
- look-ahead scheduler，每 25ms 安排未来 250ms 音符；
- preset 决定 tempo、和弦、waveform、filter、delay 和 gain；
- intro shot 通过 `setEnergy` 和 `setLayers` 推动编曲变化。

它不是一个持续 drone，而是会按 bar 呼吸的轻量配乐系统。

### Foley

`ceremony/ui-sounds.ts` 用短促声音标记：hover、forward、back、cut、reveal、confirm、trouble、recover、finish。音高承载方向和意义，所有音效共享一个 master volume。

所有 `play*` 必须 fail-soft。Web Audio 被浏览器拒绝、context 未解锁或 API 不存在，都只能导致安静，不能让 click handler 抛异常后阻止按钮继续执行。

Automatic film host 的 sound crossing 只应在“自然、连续前进”时触发。seek 只播放 transport 自己的声音，不播放被跨过的所有 scene/cue sound。

Web Audio autoplay policy 要求用户手势，所以 window 会监听一次 `pointerdown/keydown` 来 unlock。未来 runtime 可以提供 audio event channel，但不能把具体合成器放进通用 package。

## 11. 当前文件职责图

```text
Lody desktop ownership
  routes/onboarding.tsx                   completion IPC + product navigation
  onboarding-overlay.tsx                 phase resolution + draft projection
  onboarding-shell.tsx                   persistent form/product composition
  ceremony/intro-sequence.tsx             four illustrated intro beats
  tour/tour-still.tsx                     step-driven camera lifecycle
  tour/camera.ts                          Lody anchor resolver + camera core
  tour/tour-app.tsx                       real product component composition
  tour/tour-fixtures.ts                   deterministic host adapters
  tour/tour-browser-preview.tsx           browser preview fixture

Standalone package ownership
  src/definition.ts                       automatic film data + frame derivation
  src/clock.ts / src/cues.ts              playhead + replay semantics
  src/steps.ts                            host-controlled step navigation
  src/camera.ts                           product-neutral camera core
  src/react.tsx                           automatic + step React adapters
```

## 12. 已抽出的 `@wibus/interactive-film`

这部分现在位于独立的 `interactive-film` 仓库根目录，不再属于 Lody workspace，也没有迁移或修改 Lody 现有 onboarding。这样可以独立稳定抽象边界、发布 runtime，再决定何时以低风险 adapter 接入任何产品。

### Core export

```text
src/easing.ts       easing registry
src/timeline.ts     keyframe interpolation
src/definition.ts   film/beat/cue/frame types + validation
src/clock.ts        external-store master clock
src/cues.ts         crossing/replay/seek semantics
src/camera.ts       generic data-film-anchor camera
src/index.ts        dependency-free exports
```

### React export

`@wibus/interactive-film/react` 提供：

- `FilmProvider`；
- `useFilmClock`；
- `useFilmClockSnapshot`；
- `useFilmFrame`；
- `useFilmCues`；
- `useFilmCamera`；
- `FilmStepProvider`、`useFilmStep`、`useFilmStepCamera`；
- `FilmAnchor`。

Clock 与 step controller 都是 external store，React 用 `useSyncExternalStore` 做窄订阅。Camera hook 不通过 React state 写逐帧 pose，而是同步组合首个 pose，之后在自己的 rAF 中直接写 stage transform，所以 pause 时 camera 仍可 settle。

Camera hooks 保留 motion 跨 render 连续性，观察 viewport、stage、anchor 和 DOM 变化，支持 anchor 未出现时的 `fallbackRect`，并可用 `hideUntilReady` 避免首帧闪出未定位 stage。缺失 anchor 的 paused step 不会持续空转 rAF；相关 DOM 或 resize 变化会重新唤醒测量。

### 为什么 package 没有这些东西

以下仍属于 host：

- Lody 产品组件；
- fixtures/provider composition；
- i18n；
- Web Audio score 和 Foley；
- ghost cursor 视觉；
- synthetic click 权限策略；
- Electron window；
- WebGL backdrop；
- PostHog。

一个通用 package 如果自带 fake sidebar、内置音色、Electron IPC 和 Lody selector，它就不是引擎，只是把当前 onboarding 搬了一个目录。

## 13. Package 的典型 host 结构

```text
my-film/
  film.ts                 defineFilm({...})
  FilmStage.tsx           viewport + stage + transport
  ProductFixture.tsx      真实产品组件 + 确定性数据
  film-projection.ts      track -> product props
  cue-executor.ts         cue -> allowed host command
  seek-snapshot.ts        time -> active tab / selection / answers
  audio-adapter.ts        beat/cue/state crossings -> sound
  anchors.ts              typed anchor names + dynamic resolver
  film.test.ts            authoring invariants
```

推荐 conductor 只做协调：

```ts
const snapshot = useFilmClockSnapshot();
const frame = frameAt(film, snapshot.time);

const productState = projectFilmFrame(frame);
useFilmCamera({ viewportRef, stageRef });
useFilmCues({ onCue: executeAllowedCue });
```

`ProductFixture` 只接收 quantized `productState`，不要直接接收原始 `time`。

## 14. 未来 Creator 应该是什么

目标不是生成 React animation code，而是生成可校验的 film definition 和少量 adapter skeleton。

当前 Playground 的 Studio mode 是这条路线的可运行前置验证：CodeMirror 持有 JSON 草稿，结构检查与 package validator 共同阻止无效 definition 替换 live runtime；同一画面展示 frame values、easing curves、cue crossing、camera resolver 和 fallback geometry。它验证 authoring 数据流，但没有项目持久化、schema migration、command history、host iframe 或 compiler，因此仍不是可发布的 Creator。

### 14.1 Creator 的五层架构

```text
1. Project adapter
   启动真实 app fixture，暴露可拍摄的 stage

2. Anchor inspector
   在页面上点选 DOM，生成稳定 anchor 或 custom resolver 提示

3. Timeline editor
   编辑 tracks / beats / shots / cues / audio events

4. Compiler + validator
   把编辑项目编译成 typed TS/JSON definition，并检查可重放性

5. Preview sandbox
   使用与生产相同 runtime 做 pause / seek / replay / viewport 验证
```

### 14.2 项目格式不要直接存 TSX

建议 Creator 内部先使用可版本化 JSON：

```json
{
  "schemaVersion": 1,
  "duration": 12,
  "tracks": {
    "panel": [
      { "time": 0, "value": 0 },
      { "time": 8, "value": 1, "easing": "easeInOutCubic" }
    ]
  },
  "beats": [
    {
      "id": "inspect",
      "at": 7,
      "copyKey": "tour.inspect",
      "shot": { "anchor": "side-panel", "padding": 80, "maxScale": 1.8 }
    }
  ],
  "cues": [
    {
      "id": "open-changes",
      "at": 7.4,
      "anchor": "changes-tab",
      "lead": 0.7,
      "command": "press"
    }
  ]
}
```

Compiler 再生成：

- `film.generated.ts`，保留 literal type；
- locale key stub；
- anchor type union；
- validation report；
- host adapter TODO；
- screenshot/checkpoint manifest。

JSON 易于可视化编辑、diff、schema migration 和 collaboration；TS 是运行时输出，不应成为编辑器数据库。

### 14.3 Timeline editor 最少需要的轨道

UI 不应一开始就模仿 After Effects。第一版只需要：

- Beat lane：标题、文案 key、开始时间；
- Camera lane：anchor、padding、min/max scale；
- Cue lane：anchor、lead、command；
- Numeric tracks：keyframe/value/easing；
- Marker lane：声音、checkpoint、handoff；
- Transport：play/pause、rate、beat jump、scrub；
- Inspector：当前 frame values 和 validation issue。

每个 beat 最好以“用户要理解什么”命名，而不是 `scene-12`。

### 14.4 Anchor Inspector

Creator 在 preview iframe/window 中进入 inspect mode：

1. hover 显示 DOM rect；
2. click 选中节点；
3. 若已有 `data-film-anchor`，直接使用；
4. 若有稳定 product identity selector，生成 resolver proposal；
5. 若只能得到脆弱的 nth-child/class selector，标红并要求开发者补 anchor；
6. 实时显示 camera fit preview；
7. 检查多个 viewport 下节点是否存在且非零尺寸。

不要自动保存 CSS class selector。设计系统和 Tailwind class 都会变，film anchor 应是明确契约。

### 14.5 Cue 安全模型

Creator 不应允许任意 selector + 任意 JavaScript。定义 command registry：

```ts
type CueCommand =
  | { kind: 'press'; anchor: Anchor }
  | { kind: 'point'; anchor: Anchor }
  | { kind: 'host-command'; name: AllowedCommand; input: JsonValue }
  | { kind: 'sound'; name: SoundToken };
```

Preview sandbox 只执行 allowlist。涉及删除、付款、网络 mutation 的真实产品 control 默认禁止 synthetic press，必须使用 fixture command 或纯展示状态。

### 14.6 每个命令式 Cue 都要有 Seek Strategy

Creator 在保存 cue 时要求选择：

- `snapshot`：seek 时由 declarative projection 恢复结果；
- `replay-safe`：可在 seek 时执行，但默认仍不执行；
- `playback-only`：只能自然播放，seek 后不保证中间 side effect；
- `host-reset`：倒退时调用明确 reset adapter。

没有 seek strategy 的 cue 不能通过 publish validation。否则编辑器里看起来能拖动，输出作品却不可重放。

### 14.7 Preview Sandbox

Preview 必须与 runtime 同构，而不是编辑器自己实现一套播放器。它要支持：

- 任意 time seek；
- 0.25x / 0.5x / 1x / 2x；
- 单 beat 循环；
- cue lead path 可视化；
- camera subject rect 和 safe padding overlay；
- desktop/mobile viewport；
- reduced-motion；
- audio muted/unlocked 两种状态；
- missing anchor 模拟；
- user pointer arbitration；
- screenshot checkpoint。

### 14.8 Compiler 验证规则

已经在 package 实现的基础规则：

- duration 有效；
- track keyframe 排序且不超 duration；
- beat/cue ID 唯一；
- beat/cue 排序且在范围内；
- cue lead 不早于 film 0 秒。

Creator 后续应增加：

- 第一条 beat 是否覆盖 0 秒；
- 每个 shot anchor 是否在 checkpoint viewport 存在；
- cue 到达时 target 是否存在且可见；
- camera 是否在目标出现前开始移动；
- track 是否造成大产品树 60fps rerender；
- 是否有超过阈值的无动作 dead air；
- 每个 cue 是否有 seek strategy；
- 文案 key 是否完整；
- audio event 是否只在 natural crossing 播放；
- 最终 handoff/exit 是否明确；
- reduced-motion 下是否可完成；
- focus/keyboard 是否被 ghost cursor 污染。

### 14.9 自动生成的测试

Creator 可以为每个项目生成：

```text
film.validation.test.ts
  定义结构和时间范围

film.seek.test.ts
  每个 beat marker seek 后 snapshot 正确

film.cues.test.ts
  cue crossing / rewind / no forward-seek burst

film.anchors.spec.ts
  多 viewport anchor 存在且非零

film.visual.spec.ts
  checkpoint screenshots + overlap/crop checks
```

其中核心时间测试用 fake driver，不用真实 sleep。视觉测试才使用 Playwright。

## 15. Creator 的分阶段实现建议

### Phase 1：Code-first scaffold

先做一个 CLI：

```text
interactive-film create my-tour
interactive-film validate film.json
interactive-film generate film.json
interactive-film preview
```

输出 definition、React conductor、fixture adapter、cue registry 和 tests。这个阶段最快验证 package API 是否真的适合多个产品。

### Phase 2：Anchor Inspector + Read-only Timeline

能打开 host preview、点 DOM 生成 anchor、读取 JSON 并显示 beat/cue/track，但编辑仍落到 code/JSON。先解决最痛的 framing 和定位问题。

### Phase 3：可编辑 Timeline

增加 drag beat、keyframe inspector、camera live preview、cue lead path 和 undo/redo。数据模型仍保持 JSON，所有写入通过 command history。

### Phase 4：Recorder-assisted Authoring

录制用户对 fixture UI 的操作，生成 cue 草稿和时间点，但不直接发布。录制 selector 必须经过 anchor inspector 稳定化，录制结果必须补 seek strategy。

### Phase 5：团队化和模板

增加 reusable templates：brand intro、feature tour、permission pause、multi-device desk、final handoff。模板应生成 definition 结构，不应复制视觉主题。

## 16. 哪些东西最适合模板化

可以模板化：

- `real -> mock -> real` 的叙事结构；
- entrance pre-roll；
- beat narration card；
- camera shot presets（wide/window/control/panel）；
- cue approach/press/hold/leave timing；
- transport；
- seek/replay policy；
- audio token crossing；
- screenshot checkpoint；
- handoff track。

不应该模板化成固定视觉：

- Lody 的 Aurora / GemSmoke；
- Lody sidebar/session UI；
- 固定暖色或固定字体；
- 固定 macOS cursor；
- Lody 的 Web Audio progression；
- Electron screen-saver overlay。

Creator 的价值应该是快速搭好导演系统，而不是让所有产品都长得像 Lody onboarding。

## 17. 当前 package 的完成度与限制

已经实现：

- typed definition；
- keyframe/easing；
- frame derivation；
- validation；
- deterministic external-store clock；
- play/pause/seek/restart/rate/loop；
- cue crossing/rearm/wrap；
- generic DOM anchor；
- fit-not-crop camera；
- log-scale spring；
- React provider/hooks/camera adapter；
- synchronous first camera pose、fallback framing 和 exact settle；
- resize/DOM-driven camera wake-up；
- Playground Studio 的 JSON 编辑、双层校验和 live runtime preview；
- 19 个无真实时间依赖的测试。

尚未实现：

- 可发布的 visual creator；
- CLI/compiler；
- schema migration；
- recorder；
- ghost cursor generic component；
- built-in synthetic press executor；
- audio event bus；
- Creator-generated screenshot checkpoint harness；
- Lody 现有 tour 的迁移 adapter。

这些限制是刻意边界，不是隐藏的“马上就会有”。下一步最合理的验证不是立刻迁移 Lody，而是用 package 从零做第二个 20-30 秒的小 film。只有第二个作品能证明抽象是否真的通用。

## 18. 设计检查清单

创建新 film 时，逐项确认：

- 只有一个 story playhead；
- 物理 camera 可以有独立 frame loop，但只读同一个 story time；
- 所有可见状态都能从时间重建；
- forward seek 不批量执行 cue；
- rewind 会重新武装未来 cue；
- cue 操作真实 host control 或明确的 adapter，不操作仿制 UI；
- 真实 UI 使用隔离 fixture store，不污染用户数据；
- anchor 是稳定契约，不是临时 CSS selector；
- camera 每帧测量 moving subject；
- measure 会除回 applied scale；
- framing fit subject，不裁 subject；
- 小控件有 maxScale；
- 大 React tree 只接收 quantized state；
- shader/canvas 不按 scene remount；
- 音频失败不会阻止交互；
- user pointer 和 scripted pointer 有仲裁；
- reduced-motion 和无音频仍可完成；
- 最终有明确 handoff，而不只是突然关掉 tutorial。

这套系统真正可复用的不是一组漂亮动画，而是一套可回答“任意时间点是什么、为什么是这样、用户插手后怎么继续”的导演模型。`@wibus/interactive-film` 现在把这部分从 Lody 的具体画面里剥离出来了；Creator 则应该围绕这个模型做可视化 authoring，而不是重新发明另一套播放器。
