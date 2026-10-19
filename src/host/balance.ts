/**
 * Wallet tracker: polls the DeepSeek balance. Only the balance itself is reported, and only while
 * the latest read succeeded — per-reply costs or top-ups can't be derived reliably from balance
 * deltas (shared keys, delayed billing, grants), so they are not shown at all.
 */

export interface BalanceState {
  /** Latest total balance; null when unknown (no API key, or the last read failed). */
  balance: number | null
  currency: string | null
  error: string | null
}

interface BalanceInfo {
  currency: string
  total_balance: string
}

export type KeyResolver = () => Promise<string | undefined>

export class BalanceTracker {
  readonly state: BalanceState = { balance: null, currency: null, error: null }

  private inflight: Promise<void> | undefined
  /** Called whenever the reported balance changes (including becoming unknown). */
  onChange: (() => void) | undefined

  constructor(private readonly resolveKey: KeyResolver, private readonly baseUrl: string) {}

  /** Fetch once; concurrent callers share the same request. */
  poll(): Promise<void> {
    this.inflight ??= this.fetchOnce().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  private async fetchOnce(): Promise<void> {
    const key = await this.resolveKey()
    if (!key) return this.set(null, null, 'no-api-key')
    try {
      const res = await fetch(`${this.baseUrl}/user/balance`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { balance_infos?: BalanceInfo[] }
      const info = body.balance_infos?.find(b => b.currency === 'CNY') ?? body.balance_infos?.[0]
      const balance = Number(info?.total_balance)
      if (!info || !Number.isFinite(balance)) throw new Error('no usable balance_infos')
      this.set(balance, info.currency, null)
    } catch (error) {
      // Never keep showing a stale number.
      this.set(null, null, error instanceof Error ? error.message : String(error))
    }
  }

  private set(balance: number | null, currency: string | null, error: string | null): void {
    const changed = balance !== this.state.balance || currency !== this.state.currency
    Object.assign(this.state, { balance, currency, error })
    if (changed) this.onChange?.()
  }
}
