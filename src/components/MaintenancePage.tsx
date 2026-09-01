type Props = {
  message?: string
}

export function MaintenancePage({ message }: Props) {
  const text =
    message?.trim() ||
    'We are upgrading the market database. The desk will be back shortly.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 py-12">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-600/40 bg-slate-900/90 p-8 text-center shadow-2xl"
      >
        <span
          className="mb-5 inline-block rounded-full bg-teal-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-300"
        >
          Under maintenance
        </span>
        <h1 className="text-xl font-bold text-slate-50">TradersScope</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{text}</p>
        <p className="mt-5 text-xs text-slate-500">Thank you for your patience.</p>
      </div>
    </div>
  )
}
