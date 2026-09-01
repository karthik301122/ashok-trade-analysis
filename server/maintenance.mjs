function envBool(name, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return defaultValue
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return defaultValue
}

export function maintenanceEnabled() {
  return envBool('MAINTENANCE_MODE', false)
}

export function maintenanceMessage() {
  const custom = process.env.MAINTENANCE_MESSAGE?.trim()
  if (custom) return custom
  return 'We are upgrading the market database. The desk will be back shortly.'
}

function maintenanceHtml() {
  const message = maintenanceMessage()
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TradersScope — Maintenance</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(160deg, #0f172a 0%, #1e293b 45%, #0f766e 100%);
      color: #e2e8f0;
      padding: 24px;
    }
    .card {
      max-width: 520px;
      width: 100%;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 16px;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 8px; font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
    .badge {
      display: inline-block;
      margin-bottom: 20px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(20, 184, 166, 0.15);
      color: #5eead4;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    p { margin: 0; line-height: 1.6; color: #94a3b8; font-size: 0.95rem; }
    .hint { margin-top: 20px; font-size: 0.8rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Under maintenance</div>
    <h1>TradersScope</h1>
    <p>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    <p class="hint">Thank you for your patience.</p>
  </div>
</body>
</html>`
}

/** Paths that stay available while maintenance mode is on. */
function maintenanceBypass(pathname, req) {
  if (pathname === '/api/ping' || pathname === '/api/health') return true
  // Let cached SPAs load assets so the client can show the maintenance screen.
  if (pathname.startsWith('/assets/')) return true
  if (pathname === '/favicon.ico' || pathname === '/vite.svg') return true
  const adminKey = process.env.ADMIN_API_KEY?.trim()
  if (adminKey && req.headers?.['x-admin-key'] === adminKey) {
    if (pathname.startsWith('/api/snapshot/')) return true
    if (pathname === '/api/live-quotes/refresh') return true
  }
  return false
}

/**
 * Block the public site during maintenance; background jobs keep running.
 */
export function maintenanceMiddleware(req, res, next) {
  if (!maintenanceEnabled()) return next()
  const pathname = req.path || req.url?.split('?')[0] || ''
  if (maintenanceBypass(pathname, req)) return next()
  if (pathname.startsWith('/api/')) {
    return res.status(503).json({
      maintenance: true,
      error: 'Site under maintenance',
      message: maintenanceMessage(),
    })
  }
  res.status(503).type('html').send(maintenanceHtml())
}
