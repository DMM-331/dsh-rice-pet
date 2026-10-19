/** Sprite-atlas playback on a single element via background-position. */
import meta from '../../assets/sprites/whale.json'

export type AnimName = keyof typeof meta.animations
export type PoseName = keyof typeof meta.poses
export type Steps = Array<[frame: number, ms: number]>

export const CELL = meta.cell
/** Atlas file name with its content hash, e.g. `whale.webp?v=1a2b3c…` (cache-busting). */
export const ATLAS = `${meta.image}?v=${meta.version}`
export const POSE = meta.poses
/** Which way the walk frames face as drawn; the other direction is mirrored. */
export const WALK_FACING = meta.walkFacing as 'left' | 'right'
/** Which way the somersault travels as drawn. */
export const ROLL_FACING = meta.rollFacing as 'left' | 'right'
/** The curled-up ball at 0/90/180/270° (rolling direction), its shared pivot and rolling radius (cell px). */
export const SPIN = meta.spin as { frames: number[]; cx: number; cy: number; radius: number }

export class Sprite {
  private timer: ReturnType<typeof setTimeout> | undefined
  private cancel: (() => void) | undefined

  constructor(readonly el: HTMLElement, imageUrl: string, private readonly scale: number) {
    el.style.width = `${CELL.w * scale}px`
    el.style.height = `${CELL.h * scale}px`
    el.style.backgroundImage = `url("${imageUrl}")`
    el.style.backgroundSize = `${CELL.w * meta.columns * scale}px auto`
  }

  show(index: number): void {
    const x = (index % meta.columns) * CELL.w * this.scale
    const y = Math.floor(index / meta.columns) * CELL.h * this.scale
    this.el.style.backgroundPosition = `${-x}px ${-y}px`
  }

  /** Play [frame, ms] steps; resolves when finished or when interrupted by stop()/another play(). */
  play(steps: Steps): Promise<void> {
    this.stop()
    return new Promise(resolve => {
      this.cancel = resolve
      const step = (k: number): void => {
        if (k >= steps.length) return resolve()
        this.show(steps[k][0])
        this.timer = setTimeout(() => step(k + 1), steps[k][1])
      }
      step(0)
    })
  }

  stop(): void {
    clearTimeout(this.timer)
    this.cancel?.()
    this.cancel = undefined
  }
}

/** Expand a named animation into steps, optionally repeated. */
export function anim(name: AnimName, times = 1): Steps {
  const a = meta.animations[name]
  return Array.from({ length: times }, () => a.frames.map((f, i) => [f, a.durations[i]] as [number, number])).flat()
}
