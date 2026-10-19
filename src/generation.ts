/**
 * "Is the model spending tokens right now?" — derived from persisted session events.
 * A model call runs from `step/start` until its `assistant/message` lands; `step/end` and `turn/end`
 * also close it (aborts, errors). Tool execution after the message does not count as eating.
 */

const STOP_GRACE_MS = 1500   // gaps between steps shorter than this keep her eating

export class GenerationTracker {
  private readonly active = new Set<string>()
  private generating = false
  private stopTimer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners = new Set<(generating: boolean) => void>()

  get isGenerating(): boolean { return this.generating }

  subscribe(fn: (generating: boolean) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onSessionEvent(sessionId: string, type: string | undefined): void {
    if (type === 'step/start') this.active.add(sessionId)
    else if (type === 'assistant/message' || type === 'step/end' || type === 'turn/end') this.active.delete(sessionId)
    else return
    this.sync()
  }

  dispose(): void {
    clearTimeout(this.stopTimer)
    this.listeners.clear()
  }

  private sync(): void {
    if (this.active.size > 0) {
      clearTimeout(this.stopTimer)
      this.stopTimer = undefined
      this.set(true)
    } else if (this.generating && this.stopTimer === undefined) {
      this.stopTimer = setTimeout(() => { this.stopTimer = undefined; this.set(false) }, STOP_GRACE_MS)
    }
  }

  private set(on: boolean): void {
    if (this.generating === on) return
    this.generating = on
    for (const fn of this.listeners) fn(on)
  }
}
