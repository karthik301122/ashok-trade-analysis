/**
 * Worker: parse large stocks_perf JSON off the main thread so HTTP stays responsive.
 */
import { parentPort, workerData } from 'worker_threads'

try {
  const builtAt = Number(workerData?.builtAt || 0)
  const raw = workerData?.json
  if (typeof raw !== 'string' || !raw) {
    parentPort?.postMessage({ ok: false, error: 'missing json' })
  } else {
    const map = JSON.parse(raw)
    parentPort?.postMessage({ ok: true, builtAt, map })
  }
} catch (err) {
  parentPort?.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  })
}
