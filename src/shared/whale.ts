/**
 * The whale maid, a small desktop pet.
 *
 * What she does is decided in one place (`decide()`), in priority order:
 *   1. being carried / region editing  – the user is holding her
 *   2. agent activity                  – eat while generating, take notes while tools run, wave for approvals
 *   3. queued reactions                – choke on errors, stuffed on max-tokens, cheer on long turns, pokes
 *   4. idle life                       – walk or somersault around her area, little idle gestures, nap after a while
 * Every behaviour runs as a cancellable task: starting a new one bumps `task`, and older loops stop
 * at their next await.
 */
import type { Activity } from './feed.ts'
import type { RegionSource } from './region.ts'
import { anim, CELL, POSE, ROLL_FACING, SPIN, Sprite, WALK_FACING, type AnimName, type Steps } from './sprite.ts'

const SCALE = 0.42
const W = CELL.w * SCALE, H = CELL.h * SCALE
const WALK_SPEED = 55                    // px per second
const ROLL_TURNS = 1                     // full turns of the ball per somersault
const QUARTER_MS = 170                   // time per quarter turn (one drawn angle)
const ROLL_DISTANCE = ROLL_TURNS * 2 * Math.PI * SPIN.radius * SCALE   // wheel: distance = angle × radius
const ROLL_CHANCE = 0.35                 // share of strolls done as a somersault, when there's room
const SLEEP_AFTER_MS = 5 * 60_000        // no activity or interaction for this long → nap
const ASK_IMPATIENT_MS = 8_000           // after this, waving turns into pleading / knocking
const IDLE_GESTURES: AnimName[] = ['idle_look', 'idle_tap', 'idle_peek', 'idle_swish']

const LINES = {
  poke: ['饭饭！', '再来一碗~', '摸鱼中…', '今天也要好好吃饭', '嗷呜！', '哼，才不是在等你'],
  busy: ['在吃饭呢，等一下下~', '嚼嚼嚼…'],
  ask: '要你确认一下哦~',
  askPoke: '去 DeepSeek 里点确认呀',
  oops: '咳咳…噎住了',
  full: '吃、吃撑了…',
  cheer: '做完啦！快回来看看~',
} as const

type Mode = 'idle' | 'walking' | 'busy' | 'activity' | 'asleep' | 'dragging' | 'editing'
type Reaction = { anim: AnimName; line?: string }

export class Whale {
  readonly root = document.createElement('div')
  private readonly sprite: Sprite
  private pos = { x: 0, y: 0 }          // top-left of the sprite box, CSS px
  private mode: Mode = 'idle'
  private activity: Activity = 'idle'
  private readonly reactions: Reaction[] = []
  private task = 0
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private raf = 0
  private lastAttention = Date.now()
  private spinDeg = 0                   // extra rotation while somersaulting (around the ball's centre)
  private disposed = false
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(layer: HTMLElement, imageUrl: string, private readonly regions: RegionSource) {
    this.root.className = 'wr-whale wr-idle'
    const inner = document.createElement('div')
    inner.className = 'wr-sprite'
    this.root.append(inner)
    this.sprite = new Sprite(inner, imageUrl, SCALE)
    this.sprite.show(POSE.rest)
    layer.append(this.root)

    const r = this.regions.rect()
    this.place(r.right - W - 8, r.bottom - H)
    this.bindPointer()
    window.addEventListener('resize', this.onResize)
    this.decide()
  }

  dispose(): void {
    this.disposed = true
    this.task++
    clearTimeout(this.idleTimer)
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

  /** The region moved or resized: walk back inside it. */
  regionChanged(): void {
    const r = this.regions.rect()
    if (this.mode === 'idle' || this.mode === 'walking') this.walkTo(r.left + Math.max(0, r.width - W) / 2, r.bottom - H)
    else this.place(this.pos.x, this.pos.y)
  }

  // ---- inputs ----------------------------------------------------------------------------------

  setActivity(next: Activity): void {
    if (next === this.activity) return
    this.activity = next
    if (next !== 'idle') this.lastAttention = Date.now()
    this.decide()
  }

  react(kind: 'oops' | 'full' | 'cheer'): void {
    this.queue({ anim: kind, line: LINES[kind] })
  }

  say(text: string): void {
    const b = document.createElement('div')
    b.className = 'wr-bubble'
    b.textContent = text
    this.root.append(b)
    b.addEventListener('animationend', () => b.remove())
  }

  // ---- the director ----------------------------------------------------------------------------

  private decide(): void {
    if (this.disposed || this.mode === 'dragging' || this.mode === 'editing') return
    if (this.activity !== 'idle') {
      if (this.mode !== 'activity') void this.runActivity()
      return
    }
    if (this.mode === 'activity' || this.mode === 'busy') return   // they hand back via toIdle()
    const reaction = this.reactions.shift()
    if (reaction) return void this.runReaction(reaction)
    if (this.mode === 'idle') this.scheduleIdleLife()
  }

  private queue(r: Reaction): void {
    this.lastAttention = Date.now()
    this.reactions.push(r)
    this.decide()
  }

  /** Start a new behaviour: cancel the old one and report whether she has to wake up first. */
  private begin(mode: Mode): { token: number; wasAsleep: boolean } {
    const wasAsleep = this.mode === 'asleep'
    this.task++
    this.sprite.stop()
    cancelAnimationFrame(this.raf)
    clearTimeout(this.idleTimer)
    this.mode = mode
    this.root.classList.toggle('wr-idle', mode === 'idle')
    this.render(0)
    return { token: this.task, wasAsleep }
  }

  private alive(token: number): boolean { return token === this.task && !this.disposed }

  private async play(token: number, steps: Steps): Promise<boolean> {
    await this.sprite.play(steps)
    return this.alive(token)
  }

  private toIdle(): void {
    if (this.disposed) return
    this.begin('idle')
    this.sprite.show(POSE.rest)
    this.decide()
  }

  // ---- behaviours ------------------------------------------------------------------------------

  private async runActivity(): Promise<void> {
    const { token, wasAsleep } = this.begin('activity')
    if (wasAsleep && !(await this.play(token, anim('wake')))) return
    let current: Activity = 'idle'
    let askSince = 0
    while (this.alive(token) && this.activity !== 'idle') {
      const a = this.activity
      if (a !== current) {
        current = a
        if (a === 'generating' && !(await this.play(token, anim('eat_start')))) return
        if (a === 'tool' && !(await this.play(token, anim('tool_start')))) return
        if (a === 'ask') { askSince = Date.now(); this.say(LINES.ask) }
        continue
      }
      // Each loop is one full cycle, so a change always lands on a finished bite / note.
      const loop: AnimName = a === 'generating' ? 'eat_loop'
        : a === 'tool' ? 'tool_loop'
        : Date.now() - askSince > ASK_IMPATIENT_MS ? 'ask_more' : 'ask'
      if (!(await this.play(token, anim(loop)))) return
    }
    if (!this.alive(token)) return
    if (current === 'generating' && !(await this.play(token, anim('eat_done')))) return
    this.toIdle()
  }

  private async runReaction(r: Reaction): Promise<void> {
    const { token, wasAsleep } = this.begin('busy')
    if (wasAsleep && !(await this.play(token, anim('wake')))) return
    if (r.line) this.say(r.line)
    if (await this.play(token, anim(r.anim))) this.toIdle()
  }

  private async fallAsleep(): Promise<void> {
    const { token } = this.begin('asleep')
    if (!(await this.play(token, anim('sleep_in')))) return
    while (await this.play(token, anim('sleep', 4))) { /* breathe */ }
  }

  // ---- idle life -------------------------------------------------------------------------------

  private scheduleIdleLife(): void {
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (this.mode !== 'idle') return
      if (document.hidden) return this.scheduleIdleLife()
      if (Date.now() - this.lastAttention > SLEEP_AFTER_MS) return void this.fallAsleep()
      if (!this.reducedMotion && Math.random() < 0.55) {
        if (Math.random() < ROLL_CHANCE && this.roll()) return
        const r = this.regions.rect()
        return this.walkTo(r.left + Math.random() * Math.max(0, r.width - W), r.top + Math.random() * Math.max(0, r.height - H))
      }
      void this.runReaction({ anim: IDLE_GESTURES[Math.floor(Math.random() * IDLE_GESTURES.length)] })
    }, 6000 + Math.random() * 8000)
  }

  private walkTo(tx: number, ty: number): void {
    const { token } = this.begin('walking')
    const from = { ...this.pos }
    const dist = Math.hypot(tx - from.x, ty - from.y)
    if (dist < 4) return this.toIdle()
    // Mirror the walk frames when she heads the other way from how they were drawn.
    const goingLeft = tx < from.x
    this.root.classList.toggle('wr-flip', WALK_FACING === 'left' ? !goingLeft : goingLeft)
    void (async () => { while (await this.play(token, anim('walk'))) { /* keep stepping */ } })()
    const duration = (dist / WALK_SPEED) * 1000
    const t0 = performance.now()
    const frame = (now: number): void => {
      if (!this.alive(token)) return
      const t = Math.min(1, (now - t0) / duration)
      this.pos.x = from.x + (tx - from.x) * t
      this.pos.y = from.y + (ty - from.y) * t
      this.render(0)
      if (t < 1) this.raf = requestAnimationFrame(frame)
      else this.toIdle()
    }
    this.raf = requestAnimationFrame(frame)
  }

  /** Somersault sideways (given or random direction) if the region has room; false if she can't. */
  roll(direction?: 'left' | 'right'): boolean {
    if (this.mode !== 'idle' && this.mode !== 'walking') return false
    const r = this.regions.rect()
    const room = { left: this.pos.x - r.left, right: r.right - W - this.pos.x }
    const dirs = (direction ? [direction] : ['left', 'right'] as const).filter(d => room[d] >= ROLL_DISTANCE)
    if (!dirs.length) return false
    void this.somersault(dirs[Math.floor(Math.random() * dirs.length)])
    return true
  }

  private async somersault(dir: 'left' | 'right'): Promise<void> {
    const { token } = this.begin('walking')
    const left = dir === 'left'
    this.root.classList.toggle('wr-flip', ROLL_FACING === 'left' ? !left : left)
    if (!(await this.play(token, anim('sault_in')))) return
    if (!(await this.spin(token, left ? -1 : 1))) return
    if (await this.play(token, anim('sault_out'))) this.toIdle()
  }

  /**
   * Roll the curled-up ball like a wheel. The four drawn angles are swapped every quarter turn and
   * the ball is rotated smoothly in between; the position always equals angle × radius, so the
   * point touching the floor never slides. `sign` −1 rolls left (counter-clockwise), +1 right.
   */
  private spin(token: number, sign: -1 | 1): Promise<boolean> {
    const flipped = this.root.classList.contains('wr-flip')
    const pivotX = (flipped ? CELL.w - SPIN.cx : SPIN.cx) * SCALE
    this.root.style.transformOrigin = `${pivotX}px ${SPIN.cy * SCALE}px`
    const radius = SPIN.radius * SCALE
    const quarters = ROLL_TURNS * 4
    const fromX = this.pos.x
    const t0 = performance.now()
    let shown = -1
    return new Promise(resolve => {
      const done = (ok: boolean): void => {
        this.spinDeg = 0
        this.root.style.transformOrigin = ''
        if (ok) this.render(0)
        resolve(ok)
      }
      const tick = (now: number): void => {
        if (!this.alive(token)) return done(false)
        const q = Math.min((now - t0) / QUARTER_MS, quarters)     // quarter turns completed
        const k = Math.min(Math.floor(q), quarters - 1)
        if (k % 4 !== shown) { shown = k % 4; this.sprite.show(SPIN.frames[shown]) }
        this.spinDeg = sign * (q - k) * 90
        this.pos.x = fromX + sign * radius * q * (Math.PI / 2)
        this.render(0)
        if (q < quarters) this.raf = requestAnimationFrame(tick)
        else done(true)
      }
      this.raf = requestAnimationFrame(tick)
    })
  }

  // ---- placement -------------------------------------------------------------------------------

  private place(x: number, y: number): void {
    const r = this.regions.rect()
    // Keep the feet inside the region; the sprite box may poke above it.
    this.pos.x = Math.min(Math.max(x, r.left), r.right - W)
    this.pos.y = Math.min(Math.max(y, r.top), r.bottom - H)
    this.render(0)
  }

  private render(lift: number): void {
    const turn = this.spinDeg ? ` rotate(${this.spinDeg}deg)` : ''
    this.root.style.transform = `translate(${this.pos.x}px, ${this.pos.y - lift}px)${turn}`
  }

  private readonly onResize = (): void => this.place(this.pos.x, this.pos.y)

  // ---- pointer: click = poke, drag = carry, double-click = edit region -------------------------

  private onClick(): void {
    this.lastAttention = Date.now()
    if (this.mode === 'asleep') return void this.runReaction({ anim: 'wake', line: '唔…早上好？' })
    if (this.mode === 'activity') return this.say(this.activity === 'ask' ? LINES.askPoke : LINES.busy[Math.floor(Math.random() * LINES.busy.length)])
    if (this.mode === 'idle' || this.mode === 'walking') {
      this.runReaction({ anim: 'poke', line: LINES.poke[Math.floor(Math.random() * LINES.poke.length)] })
    }
  }

  private bindPointer(): void {
    let start: { x: number; y: number; ox: number; oy: number } | null = null
    let dragged = false

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
        this.lastAttention = Date.now()
        this.begin('dragging')
        this.sprite.show(POSE.carried)
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
      if (!dragged) return this.onClick()
      this.place(this.pos.x, this.pos.y)   // drop back inside the region
      this.toIdle()
    })
    this.root.addEventListener('dblclick', () => void this.editArea())
  }

  private async editArea(): Promise<void> {
    const { token } = this.begin('editing')
    this.sprite.show(POSE.rest)
    await this.regions.edit()
    if (!this.alive(token)) return
    this.place(this.pos.x, this.pos.y)
    this.toIdle()
  }
}
