export const APP_NAME = 'Traders Scope'
export const APP_TAGLINE = 'ASX market desk'
export const APP_TITLE = `${APP_NAME} · ASX`

export type OrgBranding = {
  productName?: string
  primaryColor?: string
  logoUrl?: string
  supportEmail?: string
}

let override: OrgBranding | null = null

/** Apply org branding (header/login). Keeps a powered-by mark in UI separately. */
export function resolveBrand(branding?: OrgBranding | null) {
  override = branding && typeof branding === 'object' ? branding : null
  if (override?.primaryColor && typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--brand-primary', override.primaryColor)
  }
  return getBrand()
}

export function getBrand() {
  return {
    name: override?.productName?.trim() || APP_NAME,
    tagline: APP_TAGLINE,
    logoUrl: (override?.logoUrl && String(override.logoUrl).trim()) || '/favicon.svg',
    primaryColor: override?.primaryColor || '#0f766e',
    supportEmail: override?.supportEmail || '',
    poweredBy: Boolean(override?.productName),
  }
}
