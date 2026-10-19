/** The whale maid: roams inside the region, eats while the model generates, reacts to clicks and drags. */
import { anim, CELL, FRAME, Sprite } from './sprite.ts'
import type { RegionSource } from './region.ts'

const SCALE = 0.42
const W = CELL.w * SCALE, H = CELL.h * SCALE
const CLICK_LINES = ['饭饭！', '再来一碗~', '摸鱼中…', '今天也要好好吃饭', '嗷呜！']

type Mode = 'idle' | 'hopping' | 'eating' | 'busy' | 'dragging' | 'editing'

export class Whale {
  readonly root = document.createElement('div')
  private readonly sprite: Sprite
  private pos = { x: 0, y: 0 }          // top-left of the sprite box, CSS px
  private mode: Mode = 'idle'
  private generating = false
  private roamTimer: ReturnType<typeof setTimeout> | undefined
  private raf = 0
  private disposed = false
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(layer: HTMLElement, imageUrl: string, private readonly regions: RegionSource) {
    this.root.className = 'wr-whale wr-idle'
    const inner = document.createElement('div')
    inner.className = 'wr-sprite'
    this.root.append(inner)
    this.sprite = new Sprite(inner, imageUrl, SCALE)
    this.sprite.show(FRAME.full)
    layer.append(this.root)

    const r = this.regions.rect()
    this.place(r.right - W - 8, r.bottom - H)
    this.bindPointer()
    window.addEventListener('resize', this.onResize)
    this.scheduleRoam()
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.roamTimer)
    cancelAnimationFrame(this.raf)
    this.sprite.stop()
    window.removeEventListener('resize', this.onResize)
    this.root.remove()
  }

  setTooltip(text: string): void { this.root.title = text }

  /** A drag or an edit is in progress (the desktop overlay must keep receiving the mouse). */
  get interacting(): boolean { return this.mode === 'dragging' || this.mode === 'editing' }

  /** Screen-space bounds of everything clickable (the desktop overlay lets clicks through elsewhere). */
  hitRect(): DOMRect { return this.root.getBoundingClientRect() }

  /** The region moved or resized: hop back inside it. */
  regionChanged(): void {
    const r = this.regions.rect()
    if (this.mode === 'idle' || this.mode === 'hopping') this.hopTo(r.left + Math.max(0, r.width - W) / 2, r.bottom - H)
    else this.place(this.pos.x, this.pos.y)
  }

  // ---- reactions -------------------------------------------------------------------------------

  /** While the model is generating she keeps eating; when it stops she finishes the bite and puts the bowl down. */
  setGenerating(on: boolean): void {
    this.generating = on
    if (on && (this.mode === 'idle' || this.mode === 'hopping' || this.mode === 'busy')) void this.runMeal()
  }

  /** Balance dropped (reported a little after the reply): just show what the meal cost. */
  spent(amount: number): void {
    this.say(`-¥${Math.abs(amount).toFixed(Math.abs(amount) < 0.01 ? 4 : 2)}`)
  }

  async refill(amount: number): Promise<void> {
    if (this.mode !== 'idle' && this.mode !== 'hopping') return
    this.enter('busy')
    this.say(`+¥${amount.toFixed(2)} 开饭啦！`)
    await this.sprite.play([[FRAME.excited, 1400]])
    if (this.still('busy')) this.backToIdle()
  }

  say(text: string): void {
    const b = document.createElement('div')
    b.className = 'wr-bubble'
    b.textContent = text
    this.root.append(b)
    b.addEventListener('animationend', () => b.remove())
  }

  private async runMeal(): Promise<void> {
    this.enter('eating')
    await this.sprite.play(anim('eat_start'))
    // Each loop is one full bite, so stopping always lands on a finished chew.
    while (this.generating && !this.disposed) await this.sprite.play(anim('eat_loop'))
    if (this.disposed) return
    await this.sprite.play(anim('eat_done'))
    this.backToIdle()
  }

  private async poke(): Promise<void> {
    if (this.mode !== 'idle' && this.mode !== 'hopping') return
    this.enter('busy')
    this.say(CLICK_LINES[Math.floor(Math.random() * CLICK_LINES.length)])
    await this.sprite.play([[FRAME.more, 1100]])
    if (this.still('busy')) this.backToIdle()
  }

  // ---- state helpers ---------------------------------------------------------------------------

  /** Mode check that survives awaits (TS would otherwise keep the pre-await narrowing). */
  private still(mode: Mode): boolean { return this.mode === mode }

  private enter(mode: Mode): void {
    this.mode = mode
    cancelAnimationFrame(this.raf)
    clearTimeout(this.roamTimer)
    this.root.classList.toggle('wr-idle', mode === 'idle')
  }

  private backToIdle(): void {
    if (this.disposed) return
    this.enter('idle')
    this.sprite.show(FRAME.full)
    if (this.generating) return void this.runMeal()
    this.scheduleRoam()
  }

  private place(x: number, y: number): void {
    const r = this.regions.rect()
    // Keep the feet inside the region; the sprite box may poke above it.
    this.pos.x = Math.min(Math.max(x, r.left), r.right - W)
    this.pos.y = Math.min(Math.max(y, r.top), r.bottom - H)
    this.render(0)
  }

  private render(lift: number): void {
    this.root.style.transform = `translate(${this.pos.x}px, ${this.pos.y - lift}px)`
  }

  private readonly onResize = (): void => this.place(this.pos.x, this.pos.y)

  // ---- roaming (hops until walk frames exist) --------------------------------------------------

  private scheduleRoam(): void {
    clearTimeout(this.roamTimer)
    if (this.reducedMotion) return
    this.roamTimer = setTimeout(() => this.roam(), 6000 + Math.random() * 9000)
  }

  private roam(): void {
    if (this.mode !== 'idle' || document.hidden) return this.scheduleRoam()
    const r = this.regions.rect()
    const tx = r.left + Math.random() * Math.max(0, r.width - W)
    const ty = r.top + Math.random() * Math.max(0, r.height - H)
    this.hopTo(tx, ty)
  }

  private hopTo(tx: number, ty: number): void {
    this.enter('hopping')
    const from = { ...this.pos }
    const dist = Math.hypot(tx - from.x, ty - from.y)
    const hops = Math.max(1, Math.round(dist / 70))
    const duration = hops * 380
    this.root.classList.toggle('wr-flip', tx < from.x)
    const t0 = performance.now()
    const frame = (now: number): void => {
      const t = Math.min(1, (now - t0) / duration)
      this.pos.x = from.x + (tx - from.x) * t
      this.pos.y = from.y + (ty - from.y) * t
      this.render(Math.abs(Math.sin(t * hops * Math.PI)) * 14)
      if (t < 1) this.raf = requestAnimationFrame(frame)
      else if (this.mode === 'hopping') this.backToIdle()
    }
    this.raf = requestAnimationFrame(frame)
  }

  // ---- pointer: click = poke, drag = carry, double-click = edit region -------------------------

  private bindPointer(): void {
    let start: { x: number; y: number; ox: number; oy: number } | null = null
    let dragged = false
    const prevMode = { value: 'idle' as Mode }

    this.root.addEventListener('pointerdown', e => {
      if (this.mode === 'editing') return
      start = { x: e.clientX, y: e.clientY, ox: this.pos.x, oy: this.pos.y }
      dragged = false
      this.root.setPointerCapture(e.pointerId)
      e.preventDefault()
    })
    this.root.addEventListener('pointermove', e => {
      if (!start) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (!dragged && Math.hypot(dx, dy) < 5) return
      if (!dragged) {
        dragged = true
        prevMode.value = this.mode
        if (this.mode !== 'eating') { this.sprite.stop(); this.enter('dragging'); this.sprite.show(FRAME.excited) }
        this.root.classList.add('wr-dragging')
      }
      this.pos.x = start.ox + dx
      this.pos.y = start.oy + dy
      this.render(0)
    })
    this.root.addEventListener('pointerup', () => {
      if (!start) return
      start = null
      this.root.classList.remove('wr-dragging')
      if (!dragged) return void this.poke()
      this.place(this.pos.x, this.pos.y)   // drop back inside the region
      if (this.mode === 'dragging') this.backToIdle()
    })
    this.root.addEventListener('dblclick', () => void this.editArea())
  }

  private async editArea(): Promise<void> {
    if (this.mode === 'eating') return
    this.sprite.stop()
    this.enter('editing')
    await this.regions.edit()
    if (this.disposed) return
    this.place(this.pos.x, this.pos.y)
    this.backToIdle()
  }
}
