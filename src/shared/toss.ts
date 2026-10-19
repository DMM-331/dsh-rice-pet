/**
 * Small physics helpers for picking the whale up and throwing her.
 *   - PointerVelocity: release velocity from the last ~100 ms of pointer samples
 *   - Pendulum:        how far she swings while dangling from the pointer (spring-damper)
 *   - Flight:          ballistic flight with gravity, wall bounces and spin
 * Units: CSS px, seconds, degrees.
 */

export const GRAVITY = 2400            // px/s²
const MAX_THROW = 2600                 // px/s, so a wild flick doesn't launch her into orbit
const SAMPLE_MS = 100

export class PointerVelocity {
  private samples: Array<{ t: number; x: number; y: number }> = []

  add(x: number, y: number, t = performance.now()): void {
    this.samples.push({ t, x, y })
    while (this.samples.length > 2 && t - this.samples[0].t > SAMPLE_MS) this.samples.shift()
  }

  /** Velocity over the recent window; zero if the pointer has been still. */
  get(t = performance.now()): { vx: number; vy: number } {
    const recent = this.samples.filter(s => t - s.t <= SAMPLE_MS)
    if (recent.length < 2) return { vx: 0, vy: 0 }
    const a = recent[0], b = recent.at(-1)!
    const dt = Math.max(0.016, (b.t - a.t) / 1000)
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt
    const speed = Math.hypot(vx, vy)
    if (speed > MAX_THROW) { vx *= MAX_THROW / speed; vy *= MAX_THROW / speed }
    return { vx, vy }
  }

  reset(): void { this.samples = [] }
}

/**
 * Dangling from a pinch point: moving the pointer right makes her body lag behind (swing
 * clockwise, positive degrees); when the pointer stops she sways back and settles.
 */
export class Pendulum {
  angle = 0
  private rate = 0

  step(dt: number, pointerVx: number): number {
    const target = Math.max(-35, Math.min(35, pointerVx * 0.03))
    const accel = 140 * (target - this.angle) - 9 * this.rate
    this.rate += accel * dt
    this.angle += this.rate * dt
    return this.angle
  }

  reset(): void { this.angle = 0; this.rate = 0 }
}

export interface Bounds { left: number; top: number; right: number; ground: number }

/** Ballistic flight of the sprite box's top-left corner, with spin around her body. */
export class Flight {
  x: number; y: number; vx: number; vy: number
  angle: number
  spin: number                         // deg/s

  constructor(x: number, y: number, vx: number, vy: number, angle: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy
    this.angle = angle
    // A sideways throw sets her tumbling; the faster, the more.
    this.spin = vx * 0.35 + (Math.random() - 0.5) * 60
  }

  /** Advance by dt; returns true on the frame she touches the ground. */
  step(dt: number, b: Bounds): boolean {
    this.vy += GRAVITY * dt
    this.vx *= Math.exp(-0.15 * dt)        // a little air drag
    this.spin *= Math.exp(-0.5 * dt)
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.angle += this.spin * dt
    if (this.x < b.left) { this.x = b.left; this.vx = -this.vx * 0.45; this.spin = -this.spin * 0.6 }
    if (this.x > b.right) { this.x = b.right; this.vx = -this.vx * 0.45; this.spin = -this.spin * 0.6 }
    if (this.y < b.top) { this.y = b.top; this.vy = -this.vy * 0.3 }
    if (this.y >= b.ground && this.vy > 0) { this.y = b.ground; return true }
    return false
  }

  /** Body angle at impact folded into (-180, 180]; 0 = upright. */
  get uprightError(): number {
    return ((this.angle % 360) + 540) % 360 - 180
  }
}
