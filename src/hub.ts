/** Fan-out of state snapshots to any number of server-sent-event streams. */
import type { IncomingMessage, ServerResponse } from 'node:http'

const HEARTBEAT_MS = 25_000

export class Hub {
  private readonly streams = new Set<ServerResponse>()
  private readonly heartbeat = setInterval(() => { for (const res of this.streams) res.write(': ping\n\n') }, HEARTBEAT_MS)

  constructor(private readonly snapshot: () => unknown) {}

  readonly emit = (): void => {
    const frame = `data: ${JSON.stringify(this.snapshot())}\n\n`
    for (const res of this.streams) res.write(frame)
  }

  /** Hold the response open as an SSE stream: one snapshot now, then one per emit(). */
  open(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(`retry: 3000\ndata: ${JSON.stringify(this.snapshot())}\n\n`)
    this.streams.add(res)
    req.on('close', () => this.streams.delete(res))
  }

  dispose(): void {
    clearInterval(this.heartbeat)
    for (const res of this.streams) res.end()
    this.streams.clear()
  }
}
