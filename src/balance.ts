/** Wallet tracker: polls the DeepSeek balance and turns every drop into a "bite". */

export interface WhaleState {
  /** Latest total balance, or null before the first successful poll. */
  balance: number | null
  currency: string | null
  /** Monotonic counter; the client plays one bite per increment. */
  bites: number
  /** Monotonic counter; bumped when the balance goes up (top-up). */
  refills: number
  /** Signed amount of the most recent change. */
  lastDelta: number
  updatedAt: number | null
  error: string | null
}

interface BalanceInfo {
  currency: string
  total_balance: string
}

export type KeyResolver = () => Promise<string | undefined>

export class BalanceTracker {
  readonly state: WhaleState = {
    balance: null, currency: null, bites: 0, refills: 0, lastDelta: 0, updatedAt: null, error: null,
  }

  private inflight: Promise<void> | undefined
  /** Called after every non-zero balance change. */
  onChange: (() => void) | undefined

  constructor(private readonly resolveKey: KeyResolver, private readonly baseUrl: string) {}

  /** Fetch once; concurrent callers share the same request. */
  poll(): Promise<void> {
    this.inflight ??= this.fetchOnce().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  private async fetchOnce(): Promise<void> {
    const key = await this.resolveKey()
    if (!key) {
      this.state.error = 'no-api-key'
      return
    }
    try {
      const res = await fetch(`${this.baseUrl}/user/balance`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { balance_infos?: BalanceInfo[] }
      const info = body.balance_infos?.find(b => b.currency === 'CNY') ?? body.balance_infos?.[0]
      if (!info) throw new Error('empty balance_infos')
      this.update(Number(info.total_balance), info.currency)
      this.state.error = null
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error)
    }
  }

  /** Exposed for tests: apply a freshly observed balance. */
  update(balance: number, currency: string): void {
    const prev = this.state.balance
    this.state.balance = balance
    this.state.currency = currency
    this.state.updatedAt = Date.now()
    if (prev === null || Number.isNaN(balance)) return
    const delta = Math.round((balance - prev) * 1e4) / 1e4
    if (delta === 0) return
    this.state.lastDelta = delta
    if (delta < 0) this.state.bites++
    else this.state.refills++
    this.onChange?.()
  }
}
