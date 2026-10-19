# dsh-whale-rice · 鲸鱼娘吃白饭

A DeepSeek Harness (DSH) plugin: a chibi whale maid keeps eating white rice while the model is
generating, and puts her bowl down when it stops. On macOS she lives on your desktop, anywhere on
any screen; elsewhere she stays inside the DSH window.

## Features

- **Eats while tokens flow**: from `step/start` until the model's `assistant/message` she loops the eating animation; gaps under 1.5s between steps don't interrupt her. When generation stops she finishes the bite and puts the bowl down.
- **Shows what it cost**: with an API key configured, the host polls `GET https://api.deepseek.com/user/balance` and a bubble shows each reply's cost (no bubble when you sign in with a DeepSeek account).
- **Desktop mode (macOS)**: she leaves the DSH window. Double-click her → every screen dims → drag a rectangle on any screen to set her area (Esc / right-click cancels). Saved in `~/.dsh/whale-rice/overlay.json`.
- **Interactions**: click to poke, drag to carry her (she snaps back inside her area), and she hops around her area on her own.

## Installation

```bash
dsh plugin --profile web add github:<you>/dsh-whale-rice
```

The key is read from the DSH credentials service under the name `DEEPSEEK_API_KEY` (the same one DSH itself uses), with the environment variable as a fallback.
The key is only used on the host side and never sent to the browser.

Optional config (`cordis.patch.yml`):

```yaml
config:
  apiKeyRef: DEEPSEEK_API_KEY  # credential / env var name
  pollSeconds: 60              # polling interval, minimum 15
  desktop: true                # macOS: false keeps her inside the DSH window
```

Desktop mode runs a small native helper, `lib/whale-overlay` (Swift, source in `native/`, compiled with `swiftc` at build time): one transparent always-on-top window per screen, click-through everywhere except the whale. It only talks to a private `127.0.0.1` port opened by the plugin (random token per launch) and exits when DSH does.

## Development

```bash
pnpm install
pnpm dev          # build + start the local harness at http://127.0.0.1:8770
```

The harness (`dev/`) runs the real host-side code with a mock DeepSeek balance API, so you can simulate charges, top-ups, and unloading without installing DSH.

| Path | Description |
|---|---|
| `src/index.ts` | Host side: generation state, balance polling, `/whale-rice/state`, `/events` (SSE) and asset routes |
| `src/overlay-host.ts`, `native/` | Desktop mode: private server + native transparent-window helper |
| `src/overlay/` | Desktop page: cross-screen area picking, reports the clickable area |
| `src/client/` | Web side: overlay layer, sprite playback, roaming/eating/drag state machine, area editing |
| `assets/whale/` | Sprite sheet `whale-eat.webp` + frame/animation definitions `whale-eat.json` |
| `tools/sprite/` | Scripts that turn the generated images into the sprite sheet (background removal, alignment, layout) |

## License

- Code: MIT (`LICENSE`)
- Artwork: CC BY-NC-SA 4.0 (`assets/whale/LICENSE-ARTWORK`), no commercial use; see `NOTICE` for sources

Unofficial fan work, not affiliated with DeepSeek.
