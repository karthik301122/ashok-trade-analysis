/**
 * Stripe billing helpers (soft-fail when STRIPE_SECRET_KEY is unset).
 *
 * Install: `npm i stripe`
 *
 * Express webhook must receive the raw body for signature verification:
 *   app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handler)
 * Mount that route *before* `express.json()`, or skip the global JSON parser for this path.
 * Vite/connect middleware may skip the webhook (no reliable raw body).
 *
 * Env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRICE_ORG_SEATS
 *   STRIPE_PRICE_INDIVIDUAL
 */
import { log } from './log.mjs'
import { getOrg, setSeats, setStripeIds } from './orgStore.mjs'

let stripeClient = null
let stripeLoadAttempted = false

function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() || ''
}

/**
 * @returns {Promise<import('stripe').default | null>}
 */
async function getStripe() {
  const key = stripeSecretKey()
  if (!key) return null
  if (stripeClient) return stripeClient
  if (stripeLoadAttempted && !stripeClient) return null
  stripeLoadAttempted = true
  try {
    const mod = await import('stripe')
    const Stripe = mod.default || mod
    stripeClient = new Stripe(key)
    return stripeClient
  } catch (err) {
    log('warn', 'stripe.import_failed', {
      message: err instanceof Error ? err.message : String(err),
      hint: 'Run: npm i stripe',
    })
    return null
  }
}

export function stripeConfigured() {
  return Boolean(stripeSecretKey())
}

/**
 * @param {{ orgId: string, priceId?: string, seats?: number, successUrl: string, cancelUrl: string, customerEmail?: string }} opts
 */
export async function createCheckoutSession(opts = {}) {
  const stripe = await getStripe()
  if (!stripe) {
    return {
      ok: false,
      error: 'Stripe is not configured (set STRIPE_SECRET_KEY and npm i stripe)',
    }
  }
  const orgId = String(opts.orgId || '').trim()
  if (!orgId) return { ok: false, error: 'orgId required' }
  const org = await getOrg(orgId)
  if (!org) return { ok: false, error: 'Org not found' }

  const seats = Math.max(1, Math.floor(Number(opts.seats) || 1))
  const priceId =
    String(opts.priceId || '').trim() ||
    process.env.STRIPE_PRICE_ORG_SEATS?.trim() ||
    process.env.STRIPE_PRICE_INDIVIDUAL?.trim() ||
    ''
  if (!priceId) {
    return {
      ok: false,
      error: 'priceId required (or set STRIPE_PRICE_ORG_SEATS / STRIPE_PRICE_INDIVIDUAL)',
    }
  }
  const successUrl = String(opts.successUrl || '').trim()
  const cancelUrl = String(opts.cancelUrl || '').trim()
  if (!successUrl || !cancelUrl) {
    return { ok: false, error: 'successUrl and cancelUrl required' }
  }

  const sessionParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: seats }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      orgId,
      seats: String(seats),
    },
    subscription_data: {
      metadata: { orgId, seats: String(seats) },
    },
  }
  if (opts.customerEmail) {
    sessionParams.customer_email = String(opts.customerEmail).trim()
  }
  if (org.stripeCustomerId) {
    sessionParams.customer = org.stripeCustomerId
    delete sessionParams.customer_email
  }

  const session = await stripe.checkout.sessions.create(sessionParams)
  return {
    ok: true,
    id: session.id,
    url: session.url,
    session,
  }
}

/**
 * @param {Buffer | string} rawBody
 * @param {string} signature
 */
export async function constructWebhookEvent(rawBody, signature) {
  const stripe = await getStripe()
  if (!stripe) throw new Error('Stripe is not configured')
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}

/**
 * @param {import('stripe').Stripe.Checkout.Session} session
 */
export async function handleCheckoutCompleted(session) {
  const orgId = String(session?.metadata?.orgId || '').trim()
  if (!orgId) {
    log('warn', 'stripe.checkout_completed.missing_org', { sessionId: session?.id })
    return { ok: false, error: 'missing orgId metadata' }
  }
  const seats = Math.max(
    1,
    Math.floor(Number(session?.metadata?.seats) || Number(session?.quantity) || 1),
  )
  await setSeats(orgId, seats)
  const patch = {}
  if (session.customer) {
    patch.stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer.id
  }
  if (session.subscription) {
    patch.stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id
  }
  if (Object.keys(patch).length) await setStripeIds(orgId, patch)
  log('info', 'stripe.checkout_completed', { orgId, seats, sessionId: session.id })
  return { ok: true, orgId, seats }
}
