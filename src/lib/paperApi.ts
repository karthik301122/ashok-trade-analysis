export type PaperFill = {
  ticker: string
  side: string
  qty: number
  price: number
  source?: string
  notional?: number
}

export type PaperOrderResult =
  | { ok: true; fill: PaperFill; portfolio?: unknown }
  | { ok: false; error: string }

export async function placePaperOrder(input: {
  ticker: string
  side: 'buy' | 'sell'
  qty: number
  source?: string
  fillPrice?: number
}): Promise<PaperOrderResult> {
  try {
    const res = await fetch('/api/paper/orders', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = (await res.json().catch(() => ({}))) as {
      error?: string
      fill?: PaperFill
      portfolio?: unknown
    }
    if (!res.ok || !json.fill) {
      return { ok: false, error: json.error || 'Order failed' }
    }
    return { ok: true, fill: json.fill, portfolio: json.portfolio }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export function formatAud(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
