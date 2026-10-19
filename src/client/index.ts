/**
 * Web half of dsh-whale-rice. Mounts a fixed overlay with the whale maid inside the DSH window and
 * follows the node half's event stream. When the desktop overlay (macOS) is running she lives there
 * instead, and this one steps aside. Everything is removed when the plugin unloads.
 */
import css from './style.css'
import { feed, type WhaleState } from './feed.ts'
import { LocalRegion } from './region.ts'
import { Whale } from './whale.ts'

interface ClientContext {
  effect(fn: () => () => void, label?: string): void
}

const PLUGIN_ID = 'dsh-whale-rice'

const hostUrl = (path: string): string => new URL(`whale-rice/${path}`, document.baseURI).href

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = PLUGIN_ID
    style.textContent = css
    document.head.append(style)

    const layer = document.createElement('div')
    layer.className = 'wr-layer'
    document.body.append(layer)
    const whale = new Whale(layer, hostUrl('assets/whale-eat.webp'), new LocalRegion(layer))
    const stopFollowing = followState(whale, layer)

    return () => {
      stopFollowing()
      whale.dispose()
      layer.remove()
      style.remove()
    }
  }, `${PLUGIN_ID}: whale overlay`)
}

function followState(whale: Whale, layer: HTMLElement): () => void {
  let last: WhaleState | null = null
  const source = new EventSource(hostUrl('events'), { withCredentials: true })

  source.onmessage = (message) => {
    const s = JSON.parse(message.data) as WhaleState
    layer.hidden = s.overlay
    feed(whale, { ...s, generating: s.generating && !s.overlay }, last)
    last = s
  }
  // A dropped stream (host restart) reconnects by itself; stop eating until it is back.
  source.onerror = () => { last = null; whale.setGenerating(false) }

  return () => source.close()
}
