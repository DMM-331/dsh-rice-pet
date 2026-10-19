/** Sprite-sheet playback on a single element via background-position. */
import meta from '../../assets/whale/whale-eat.json'

export type AnimName = keyof typeof meta.animations

/** Named single frames (indices into the sheet) used outside the eat animations. */
export const FRAME = {
  excited: 0,   // 开饭: fist up, full bowl
  full: 5,      // 吃完: content smile, empty bowl — doubles as idle
  more: 6,      // 再来一碗: sparkles, bowl held out
} as const

export const CELL = meta.cell

export class Sprite {
  private timer: ReturnType<typeof setTimeout> | undefined

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

  /** Play frames [index, ms][]; resolves when finished, or immediately-ish if stopped. */
  play(steps: Array<[number, number]>): Promise<void> {
    this.stop()
    return new Promise(resolve => {
      const step = (k: number): void => {
        if (k >= steps.length) return resolve()
        this.show(steps[k][0])
        this.timer = setTimeout(() => step(k + 1), steps[k][1])
      }
      this.cancel = resolve
      step(0)
    })
  }

  private cancel: (() => void) | undefined

  stop(): void {
    clearTimeout(this.timer)
    this.cancel?.()
    this.cancel = undefined
  }
}

/** Expand a named animation into [frame, ms] steps. */
export function anim(name: AnimName, times = 1): Array<[number, number]> {
  const a: { frames: number[]; fps?: number; durations?: number[] } = meta.animations[name]
  const ms = (i: number): number => a.durations?.[i] ?? 1000 / (a.fps ?? 5)
  return Array.from({ length: times }, () => a.frames.map((f, i) => [f, ms(i)] as [number, number])).flat()
}
