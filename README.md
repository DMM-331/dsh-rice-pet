# 鲸鱼娘吃白饭 · DeepSeek 桌宠插件（dsh-whale-rice）

**DeepSeek 的桌宠插件**：一只 chibi 鲸鱼娘住进 DeepSeek Harness（DSH）。模型生成时她一口一口吃白饭，
工具调用时放下碗记笔记，等你审批时朝你挥手；在 macOS 和 Windows 上她还能走出 DSH 窗口，待在桌面任意角落。
每完成一轮对话她攒一颗饵，右键就能下海捞宝。

A **DeepSeek desktop pet** plugin for DeepSeek Harness (DSH): a chibi whale maid keeps eating white
rice while the model is generating, and puts her bowl down when it stops. On macOS and Windows she
lives on your desktop, anywhere on any screen; elsewhere she stays inside the DSH window.

![DeepSeek 桌宠插件：鲸鱼娘在桌面上吃白饭](art/previews/eat.gif)

```bash
dsh plugin --profile web add github:linner331/dsh-whale-rice
```

## 目录 · Contents

- [这是什么](#这是什么--what-it-is)
- [功能特性](#features)
- [安装](#installation)
- [常见问题](#常见问题--faq)
- [开发](#development)
- [许可](#license)

## 这是什么 · What it is

一个开源的 **DeepSeek 桌宠（desktop pet）插件**：她不是独立程序，而是 DeepSeek Harness 的一个插件，
装进 DSH 后同时出现在两处——DSH 窗口里的浮层，以及（macOS / Windows）桌面上的透明置顶窗口。
桌宠状态跟着 Agent 的真实进度走：`step/start` 到 `assistant/message` 之间她在吃，工具在跑时她记笔记，
`approval/asked` 时她挥手等你点确认，出错时她会噎住。她有自己的情绪模型，会闹别扭、会犯困，也会自己溜达。

## Features

- **Eats while tokens flow**: from `step/start` until the model's `assistant/message` she loops the eating animation; gaps under 1.5s between steps don't interrupt her. When generation stops she finishes the bite and puts the bowl down.
- **Balance on hover**: with an API key configured, the host reads `GET https://api.deepseek.com/user/balance` and the tooltip shows the current balance. Nothing is shown when it can't be read (e.g. DeepSeek-account sign-in), and per-reply costs / top-ups are deliberately not displayed: balance deltas can't be attributed to a single reply reliably.
- **Desktop mode (macOS, Windows)**: she leaves the DSH window. Double-click her → every screen dims → drag a rectangle on any screen to set her area (Esc / right-click cancels). Saved in `~/.dsh/whale-rice/overlay.json`.
- **Interactions**: click to poke, drag to carry her (she snaps back inside her area), and she hops around her area on her own.
- **Treasure diving**: every finished turn earns her a bait (two for a long one, up to 5). Right-click her → 下海捞宝: she smashes a hole in the screen, dives into the sea behind it and comes back up with a random treasure (36 items in 5 rarities, pity at 10 pulls for epic and 50 for legendary). The catch is drawn and saved by the host before the dive is acted out, in `~/.dsh/whale-rice/bag.json`. Right-click → 背包 shows the bag and the collection; pick one and she takes it out to show you. Now and then she takes one out by herself to admire it. Nothing on screen is captured: the glass is drawn, so no permissions are needed.

## Installation

```bash
dsh plugin --profile web add github:linner331/dsh-whale-rice
```

The key is read from the DSH credentials service under the name `DEEPSEEK_API_KEY` (the same one DSH itself uses), with the environment variable as a fallback.
The key is only used on the host side and never sent to the browser.

Optional config (`cordis.patch.yml`):

```yaml
config:
  apiKeyRef: DEEPSEEK_API_KEY  # credential / env var name
  pollSeconds: 60              # polling interval, minimum 15
  desktop: true                # false keeps her inside the DSH window
```

Desktop mode runs a small native helper, `lib/whale-overlay` / `lib/whale-overlay.exe` (sources in
`native/`, compiled at build time): one transparent always-on-top window per screen, click-through
everywhere except the whale. It only talks to a private `127.0.0.1` port opened by the plugin
(random token per launch) and exits when DSH does.

- **macOS**: Swift + WKWebView, compiled with `swiftc`. No extra runtime needed.
- **Windows**: .NET Framework 4.8 + WebView2 (composition hosting, so the page's transparent
  background is really transparent), in `native/windows/`. Building it needs the .NET SDK
  (`dotnet build`); the WebView2 runtime ships with Windows 10/11's Edge. Without the SDK the helper
  is simply skipped and she stays inside the DSH window. Hit-testing, DPI scaling and the region
  picker's Esc key are handled by the helper; `~/.dsh/whale-rice/overlay.log` records what it did.

## Development

```bash
pnpm install
pnpm dev          # build + start the local harness at http://127.0.0.1:8770 (DESKTOP=1 to also run the desktop overlay)
```

The harness (`dev/`) runs the real host-side code with a mock DeepSeek balance API, so you can simulate charges, top-ups, and unloading without installing DSH.

Director mode (off by default; on in the harness) triggers behaviours that otherwise only happen by chance or after a wait, for demos and debugging. Enable it with `director: true` in the plugin config, then:

```bash
curl 'http://127.0.0.1:8771/?act=run&arg=left'     # run|walk|roll left/right, sleep, oops, full, cheer
curl 'http://127.0.0.1:8771/?act=grab&arg=5,-650,-450'   # hold 5 s (she struggles), then throw
curl 'http://127.0.0.1:8771/?act=feel&arg=praise'  # nudge her mood; calm resets it
curl 'http://127.0.0.1:8771/?act=dive&arg=legendary'   # dive now, no bait spent; arg: a rarity, an item id, or nothing
curl 'http://127.0.0.1:8771/?act=admire'           # take a treasure out of the bag to look at
```

It only listens on 127.0.0.1 and plays the real animations and state machine; only the trigger is manual.

```
src/
  host/        Node half: agent activity (activity.ts), balance, SSE hub, desktop overlay host
  shared/      The whale itself: behaviour state machine, sprite playback, regions, styles
  client/      In-app entry (inside the DSH window)
  overlay/     Desktop overlay page (one per screen, inside the native helper)
native/macos/  Swift helper: transparent click-through windows
native/windows/  C# helper: the same, on .NET Framework 4.8 + composition-hosted WebView2
assets/        Shipped runtime assets: sprites/whale.webp + whale.json, artwork license
art/           Source artwork (not shipped): generated grids, reference, prompts, sprites.json manifest
scripts/       build.mjs (all artifacts → lib/), sprites/build_sprites.py (art → atlas)
dev/           Local harness with mock events and a mock balance API
```

Sprites: edit `art/sprites.json` (sources, frame ids, animations, durations) and run `pnpm sprites`
(needs Python 3 with Pillow and NumPy). It splits the grids, removes the white background, aligns
every frame on the feet / face axis and writes `assets/sprites/whale.{webp,json}`, a labelled contact
sheet (`art/previews/atlas.png`) and every behaviour laid out in playback order with measured head
sizes (`art/previews/flows.png`).

Sizing rule: inside a sheet, standing frames are normalised to the same body height; across sheets,
each sheet gets one factor so its median head height (top of the hair to the chin) matches the other
sheets, so switching between behaviours drawn in different sheets never changes her head size
(`faceMatch`: 1 = equal heads, 0 = equal heights). Per-frame `frameScale` is only for panels the
image model drew at a different size within one grid.

| Agent state (session events) | What she does |
|---|---|
| generating (`step/start` → `assistant/message`) | eats, bite after bite |
| tools running (`assistant/message` → `step/end`) | takes notes, bowl on the floor |
| approval pending (`approval/asked` → `approval/decided`) | waves at you; after 8s pleads and knocks on her bowl |
| turn ends with `error` / `max-tokens` | chokes / holds her full belly |
| a turn of 20s+ completes | jumps and gives a thumbs-up |
| idle | walks, happily runs with her rice bowl (mostly when she's in a good mood), or somersaults (rolls like a wheel: distance = angle × radius) around her area, little gestures, naps after 5 minutes |
| picked up (drag) | dangles from the scruff under a pinching cursor and swings like a pendulum; struggles after 2.5 s, then goes limp |
| afterwards (moods) | an emotion model (`src/shared/emotion.ts`): every event adds a fixed impulse to *valence* (unhappy…happy), *arousal* (drained…worked up) and *need* (wants attention), which decay on their own; the mood is the region she is in — sulk, wary, gloom, smug, expect (praise me), sleepy. Repeated events stack, nice events only soften a bad mood, and happy endings (gymnast pose, cheering) are skipped if she ends up upset. New behaviour = one row in the event table |
| thrown (release while moving) | flies under gravity, bounces off screen edges and tumbles; lands like a gymnast if she comes down upright, otherwise face-plants; walks back if she lands outside her area |

## 常见问题 · FAQ

**这是 DeepSeek 官方出的桌宠吗？**
不是。这是一个社区开源的 **DeepSeek 桌宠插件**，通过 DeepSeek Harness（DSH）的插件机制加载；
代码 MIT、美术 CC BY-NC-SA，和 DeepSeek 官方没有关系。

**怎么安装这个 DeepSeek 桌宠插件？**
一条命令：`dsh plugin --profile web add github:linner331/dsh-whale-rice`，然后重启 DeepSeek Harness。
装好后她就待在 DSH 窗口里；桌面模式默认开启（`desktop: true`），她会走到桌面上，想要只留在窗口里就设成 `false`。

**支持 Windows 吗？支持 macOS 吗？**
两个平台都支持，包括多屏和高 DPI。macOS 用 Swift + WKWebView，Windows 用 .NET Framework 4.8 +
WebView2（组合宿主，页面背景真透明）。Windows 构建 helper 需要 .NET SDK，缺了会自动退回「只在窗口里」的模式。

**她会挡住鼠标、影响我点桌面图标吗？**
不会。她的窗口只覆盖自己身边那一小块，其余区域的点击原样透传；按住左键拖动时窗口才临时扩大到她经过的地方。

**需要 DeepSeek API Key 吗？**
只有想看「余额气泡」才需要（读 `DEEPSEEK_API_KEY`）。吃白饭、下海捞宝、情绪和行为都只依赖 DSH 的会话事件，
不联网也不需要 Key。

**会收集数据吗？**
不会。唯一的网络请求是余额查询，Key 只在主进程使用，从不下发到浏览器端。

## License

- Code: MIT (`LICENSE`)
- Artwork: CC BY-NC-SA 4.0 (`assets/LICENSE-ARTWORK`), no commercial use; see `NOTICE` for sources

Unofficial fan work, not affiliated with DeepSeek.

## 关键词 · Keywords

DeepSeek 桌宠、DeepSeek 桌宠插件、DeepSeek 桌面宠物、DSH 插件、DeepSeek Harness 插件、鲸鱼娘、
二次元桌宠、Windows 桌宠、macOS 桌宠、开源桌宠；
DeepSeek desktop pet、DeepSeek desktop pet plugin、DeepSeek Harness plugin、DSH plugin、
whale maid desktop mascot、virtual pet、anime desktop pet、open source desktop pet.
