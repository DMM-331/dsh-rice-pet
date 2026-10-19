/** Shared mapping from host state snapshots to whale reactions (in-app and desktop overlay). */
import type { Whale } from './whale.ts'

export interface ScreenRect { x: number; y: number; w: number; h: number }

export type Activity = 'idle' | 'generating' | 'tool' | 'ask'

export interface WhaleState {
  activity: Activity
  /** Last one-shot turn outcome; `seq` increments every time a new one happens. */
  outcome: { kind: 'oops' | 'full' | 'cheer'; seq: number } | null
  /** Real balance from the DeepSeek API; null when it can't be read (then nothing is shown). */
  balance: number | null
  currency: string | null
  error: string | null
  /** The desktop overlay is running (the in-app whale steps aside). */
  overlay: boolean
  region: ScreenRect | null
  editing: boolean
}

/** Apply one snapshot. `last` is the previous one, or null right after (re)connecting. */
export function feed(whale: Whale, s: WhaleState, last: WhaleState | null): void {
  whale.setActivity(s.activity)
  whale.setTooltip(s.balance !== null
    ? `余额 ${s.currency === 'USD' ? '$' : '¥'}${s.balance.toFixed(2)} · 双击修改活动范围`
    : '双击修改活动范围')
  // The first snapshot is only a baseline: never replay older events.
  if (!last) return
  if (s.outcome && s.outcome.seq !== last.outcome?.seq) whale.react(s.outcome.kind)
}
