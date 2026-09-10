/**
 * Stripe billing helpers (soft-fail when STRIPE_SECRET_KEY is unset).
 *
 * Env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRICE_ORG_SEATS
 *   STRIPE_PRICE_INDIVIDUAL
 *
 * Webhook events to enable:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid
 *   invoice.payment_failed
 *   invoice.payment_action_required
 */
import { log } from './log.mjs'
import {
  getOrg,
  setSeats,
  setStripeIds,
  setBillingStatus,
  findOrgByStripeCustomerId,
  findOrgByStripeSubscriptionId,
} from './orgStore.mjs'

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

/** Map Stripe subscription.status → our billing_status. */
export function mapSubscriptionStatus(stripeStatus) {
  switch (String(stripeStatus || '')) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'incomplete':
    case 'paused':
      return 'pending'
    case 'incomplete_expired':
    case 'canceled':
      return 'canceled'
    default:
      return 'pending'
  }
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

  // Mark pending until checkout + first invoice succeed (or webhook updates).
  await setBillingStatus(orgId, 'pending')

  const session = await stripe.checkout.sessions.create(sessionParams)
  return {
    ok: true,
    id: session.id,
    url: session.url,
    session,
  }
}

/**
 * Stripe Customer Portal — cancel, update card, view invoices.
 * @param {{ orgId: string, returnUrl: string }} opts
 */
export async function createBillingPortalSession(opts = {}) {
  const stripe = await getStripe()
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured' }
  }
  const orgId = String(opts.orgId || '').trim()
  const returnUrl = String(opts.returnUrl || '').trim()
  if (!orgId || !returnUrl) return { ok: false, error: 'orgId and returnUrl required' }
  const org = await getOrg(orgId)
  if (!org?.stripeCustomerId) {
    return { ok: false, error: 'No Stripe customer on this organisation yet — buy seats first' }
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  })
  return { ok: true, url: session.url }
}

/**
 * Cancel at period end (user keeps access until paid period ends).
 * @param {{ orgId: string, immediately?: boolean }} opts
 */
export async function cancelOrgSubscription(opts = {}) {
  const stripe = await getStripe()
  if (!stripe) return { ok: false, error: 'Stripe is not configured' }
  const orgId = String(opts.orgId || '').trim()
  const org = await getOrg(orgId)
  if (!org?.stripeSubscriptionId) {
    return { ok: false, error: 'No active Stripe subscription on this organisation' }
  }
  if (opts.immediately) {
    const sub = await stripe.subscriptions.cancel(org.stripeSubscriptionId)
    await setBillingStatus(orgId, mapSubscriptionStatus(sub.status))
    if (sub.status === 'canceled') {
      await setSeats(orgId, 0)
      await setStripeIds(orgId, { stripeSubscriptionId: null })
    }
    return { ok: true, status: sub.status, cancelAtPeriodEnd: false }
  }
  const sub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
    cancel_at_period_end: true,
  })
  await setBillingStatus(orgId, mapSubscriptionStatus(sub.status))
  return {
    ok: true,
    status: sub.status,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodEnd: sub.current_period_end,
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

async function resolveOrgIdFromStripeObject(obj) {
  const metaOrg = String(obj?.metadata?.orgId || '').trim()
  if (metaOrg) return metaOrg
  const subId =
    typeof obj?.subscription === 'string'
      ? obj.subscription
      : obj?.subscription?.id || (obj?.object === 'subscription' ? obj.id : '')
  if (subId) {
    const bySub = await findOrgByStripeSubscriptionId(subId)
    if (bySub) return bySub.id
  }
  const customerId =
    typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id || ''
  if (customerId) {
    const byCust = await findOrgByStripeCustomerId(customerId)
    if (byCust) return byCust.id
  }
  return ''
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

  // Payment can still be processing (async methods) — treat unpaid checkout as pending.
  const payStatus = String(session.payment_status || '')
  if (payStatus === 'paid' || payStatus === 'no_payment_required') {
    await setBillingStatus(orgId, 'active')
  } else {
    await setBillingStatus(orgId, 'pending')
  }
  log('info', 'stripe.checkout_completed', {
    orgId,
    seats,
    sessionId: session.id,
    paymentStatus: payStatus,
  })
  return { ok: true, orgId, seats }
}

/**
 * @param {import('stripe').Stripe.Subscription} subscription
 */
export async function handleSubscriptionUpdated(subscription) {
  const orgId = await resolveOrgIdFromStripeObject(subscription)
  if (!orgId) {
    log('warn', 'stripe.subscription_updated.missing_org', { id: subscription?.id })
    return { ok: false }
  }
  const status = mapSubscriptionStatus(subscription.status)
  await setBillingStatus(orgId, status)
  const qty = Number(subscription.items?.data?.[0]?.quantity)
  if (Number.isFinite(qty) && qty >= 0) {
    if (status === 'canceled') await setSeats(orgId, 0)
    else await setSeats(orgId, Math.floor(qty))
  }
  const patch = { stripeSubscriptionId: subscription.id }
  if (subscription.customer) {
    patch.stripeCustomerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id
  }
  await setStripeIds(orgId, patch)
  log('info', 'stripe.subscription_updated', {
    orgId,
    status,
    stripeStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  })
  return { ok: true, orgId, status }
}

/**
 * @param {import('stripe').Stripe.Subscription} subscription
 */
export async function handleSubscriptionDeleted(subscription) {
  const orgId = await resolveOrgIdFromStripeObject(subscription)
  if (!orgId) {
    log('warn', 'stripe.subscription_deleted.missing_org', { id: subscription?.id })
    return { ok: false }
  }
  await setBillingStatus(orgId, 'canceled')
  await setSeats(orgId, 0)
  await setStripeIds(orgId, { stripeSubscriptionId: null })
  log('info', 'stripe.subscription_deleted', { orgId })
  return { ok: true, orgId }
}

/**
 * @param {import('stripe').Stripe.Invoice} invoice
 */
export async function handleInvoicePaid(invoice) {
  const orgId = await resolveOrgIdFromStripeObject(invoice)
  if (!orgId) return { ok: false }
  await setBillingStatus(orgId, 'active')
  log('info', 'stripe.invoice_paid', { orgId, invoiceId: invoice.id })
  return { ok: true, orgId }
}

/**
 * @param {import('stripe').Stripe.Invoice} invoice
 */
export async function handleInvoicePaymentFailed(invoice) {
  const orgId = await resolveOrgIdFromStripeObject(invoice)
  if (!orgId) return { ok: false }
  await setBillingStatus(orgId, 'past_due')
  log('warn', 'stripe.invoice_payment_failed', { orgId, invoiceId: invoice.id })
  return { ok: true, orgId }
}

/**
 * @param {import('stripe').Stripe.Invoice} invoice
 */
export async function handleInvoicePaymentActionRequired(invoice) {
  const orgId = await resolveOrgIdFromStripeObject(invoice)
  if (!orgId) return { ok: false }
  await setBillingStatus(orgId, 'pending')
  log('info', 'stripe.invoice_action_required', { orgId, invoiceId: invoice.id })
  return { ok: true, orgId }
}

/**
 * @param {import('stripe').Stripe.Event} event
 */
export async function handleStripeWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event.data.object)
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event.data.object)
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object)
    case 'invoice.paid':
      return handleInvoicePaid(event.data.object)
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event.data.object)
    case 'invoice.payment_action_required':
      return handleInvoicePaymentActionRequired(event.data.object)
    default:
      return { ok: true, ignored: event.type }
  }
}
