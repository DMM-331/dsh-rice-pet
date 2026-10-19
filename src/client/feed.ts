/** Shared mapping from host state snapshots to whale reactions (in-app and desktop overlay). */
import type { Whale } from './whale.ts'

export interface ScreenRect { x: number; y: number; w: number; h: number }

export interface WhaleState {
  generating: boolean
  balance: number | null
  currency: string | null
  bites: number
  refills: number
  lastDelta: number
  error: string | null
  /** The desktop overlay is running (the in-app whale steps aside). */
  overlay: boolean
  region: ScreenRect | null
  editing: boolean
}

/** Apply one snapshot. `last` is the previous one, or null right after (re)connecting. */
export function feed(whale: Whale, s: WhaleState, last: WhaleState | null): void {
  whale.setGenerating(s.generating)
  whale.setTooltip(s.balance !== null
    ? `余额 ${s.currency === 'USD' ? '$' : '¥'}${s.balance.toFixed(2)} · 双击修改活动范围`
    : '双击修改活动范围')
  // The first snapshot is only a baseline: never replay older balance moves.
  if (!last) return
  if (s.bites > last.bites) whale.spent(s.lastDelta)
  if (s.refills > last.refills) void whale.refill(s.lastDelta)
}
