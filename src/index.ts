/**
 * Node half of dsh-whale-rice.
 * - watches session events to know whether the model is generating (she eats while it does)
 * - polls the DeepSeek balance (when an API key is configured) to show what each meal cost
 * - on macOS, runs a desktop overlay so she can roam anywhere on screen (see overlay-host.ts)
 * - serves <base>/whale-rice/state (JSON), /events (SSE) and the sprite sheet under /assets/
 */
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { BalanceTracker } from './balance.ts'
import { GenerationTracker } from './generation.ts'
import { Hub } from './hub.ts'
import { OverlayHost } from './overlay-host.ts'

export const name = 'whale-rice'

export interface Config {
  /** Credential reference (env-var style name) holding the DeepSeek API key. */
  apiKeyRef?: string
  /** Background poll interval in seconds. */
  pollSeconds?: number
  baseUrl?: string
  /** macOS: show her on the desktop (anywhere on screen) instead of inside the DSH window. */
  desktop?: boolean
}

// Minimal structural types for the host services we touch; the real ones come from the DSH host.
interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
interface HostContext {
  inject(deps: string[], fn: (ctx: HostContext) => void): void
  get(name: string): any
  on(event: string, listener: (...args: any[]) => void): () => void
  effect(fn: () => () => void, label?: string): void
}

const ROUTE = '/whale-rice'
const ASSETS = new Map([
  ['whale-eat.webp', 'image/webp'],
  ['whale-eat.json', 'application/json'],
])
const ASSET_DIR = new URL('../assets/whale/', import.meta.url)
// Billing lands a little after the reply finishes, so re-check twice.
const AFTER_TURN_DELAYS_MS = [3_000, 15_000]

export function apply(ctx: HostContext, config: Config = {}): void {
  const keyRef = config.apiKeyRef ?? 'DEEPSEEK_API_KEY'
  const pollMs = Math.max(15, config.pollSeconds ?? 60) * 1000

  // The key is re-resolved on every poll (the credentials service forbids caching) and never leaves the host.
  let credentials: { resolve(ref: string): Promise<{ value: string } | undefined> } | undefined
  ctx.inject(['credentials'], (c) => {
    credentials = c.get('credentials')
    c.effect(() => () => { credentials = undefined }, 'whale-rice: credentials')
  })
  const tracker = new BalanceTracker(async () => {
    const resolved = await credentials?.resolve(keyRef).catch(() => undefined)
    return resolved?.value || process.env[keyRef]
  }, (config.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, ''))

  const generation = new GenerationTracker()
  let overlay: OverlayHost | undefined
  const snapshot = () => ({
    ...tracker.state,
    generating: generation.isGenerating,
    overlay: overlay?.running ?? false,
    region: overlay?.region ?? null,
    editing: overlay?.editing ?? false,
  })
  const hub = new Hub(snapshot)
  ctx.effect(() => {
    const unsubscribe = generation.subscribe(hub.emit)
    tracker.onChange = hub.emit
    return () => {
      unsubscribe()
      tracker.onChange = undefined
      generation.dispose()
      hub.dispose()
    }
  }, 'whale-rice: state hub')

  ctx.effect(() => {
    void tracker.poll()
    const timer = setInterval(() => void tracker.poll(), pollMs)
    return () => clearInterval(timer)
  }, 'whale-rice: balance poll')

  if (config.desktop !== false && OverlayHost.supported()) {
    ctx.effect(() => {
      const host = new OverlayHost(hub)
      overlay = host
      void host.start()
      return () => { host.stop(); overlay = undefined }
    }, 'whale-rice: desktop overlay')
  }

  const pending = new Set<ReturnType<typeof setTimeout>>()
  ctx.effect(() => () => pending.forEach(clearTimeout), 'whale-rice: after-turn timers')
  ctx.on('session/event', (session: { id?: string }, event: { type?: string }) => {
    generation.onSessionEvent(String(session?.id ?? 'default'), event?.type)
    if (event?.type !== 'turn/end') return
    for (const delay of AFTER_TURN_DELAYS_MS) {
      const t = setTimeout(() => { pending.delete(t); void tracker.poll() }, delay)
      pending.add(t)
    }
  })

  // Only mount the route where the web composition's connection fence exists.
  ctx.inject(['webServer', 'connection'], (web) => {
    const server = web.get('webServer')
    const connection = web.get('connection') as { requestRejection(req: IncomingMessage): 401 | 403 | undefined }
    web.effect(() => server.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (req, res) => {
        // Host/Origin fence + browser-session auth, same as the shipped host routes.
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) return void res.writeHead(rejection).end()
        if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405, { Allow: 'GET, HEAD' }).end()
        const path = new URL(req.url ?? '/', 'http://localhost').pathname.slice(ROUTE.length)
        if (path === '/state') return sendJson(res, snapshot())
        if (path === '/events') return hub.open(req, res)
        if (path.startsWith('/assets/')) return sendAsset(res, path.slice('/assets/'.length))
        res.writeHead(404).end()
      },
    } satisfies WebRoute), 'whale-rice: http route')
  })
}

function sendJson(res: ServerResponse, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(text)
}

async function sendAsset(res: ServerResponse, file: string): Promise<void> {
  const type = ASSETS.get(file)
  if (!type) return void res.writeHead(404).end()
  const bytes = await readFile(new URL(file, ASSET_DIR))
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600', 'Content-Length': bytes.length }).end(bytes)
}
