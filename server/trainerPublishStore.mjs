import crypto from 'crypto'
import { sqlAll, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

/**
 * @param {string} orgId
 * @param {string} publisher
 * @param {{ kind: string, title: string, note?: string | null, cohort?: string | null, payload?: unknown }} doc
 */
export async function publish(orgId, publisher, doc = {}) {
  const oid = String(orgId || '').trim()
  const pub = normalizeUsername(publisher)
  if (!oid || !pub) throw new Error('orgId and publisher required')
  const kind = String(doc.kind || '').trim().slice(0, 64)
  const title = String(doc.title || '').trim().slice(0, 200)
  if (!kind || !title) throw new Error('kind and title required')
  const note = doc.note != null ? String(doc.note).slice(0, 2000) : null
  const cohort = doc.cohort != null ? String(doc.cohort).slice(0, 64) : null
  const id = crypto.randomUUID()
  const now = Date.now()
  await sqlRun(
    `INSERT INTO trainer_publications
       (id, org_id, cohort, publisher, kind, title, note, payload_json, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, oid, cohort, pub, kind, title, note, JSON.stringify(doc.payload ?? {}), now, now],
  )
  return {
    id,
    orgId: oid,
    cohort,
    publisher: pub,
    kind,
    title,
    note,
    payload: doc.payload ?? {},
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Latest publication of a kind for an org (any cohort).
 * @param {string} orgId
 * @param {string} kind
 */
export async function getLatestByKind(orgId, kind) {
  const oid = String(orgId || '').trim()
  const k = String(kind || '').trim()
  if (!oid || !k) return null
  const rows = await sqlAll(
    `SELECT id, org_id AS "orgId", cohort, publisher, kind, title, note,
            payload_json AS "payloadJson", version,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM trainer_publications
     WHERE org_id = ? AND kind = ?
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [oid, k],
  )
  const row = rows[0]
  if (!row) return null
  let payload = {}
  try {
    payload = JSON.parse(row.payloadJson || '{}')
  } catch {
    payload = {}
  }
  return {
    id: row.id,
    orgId: row.orgId,
    cohort: row.cohort || null,
    publisher: row.publisher,
    kind: row.kind,
    title: row.title,
    note: row.note || null,
    payload,
    version: Number(row.version) || 1,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

/**
 * Upsert org-wide daily-scan. Skips when incoming payload is empty and an
 * existing non-empty daily-scan would be overwritten.
 * @param {string} orgId
 * @param {string} publisher
 * @param {{ title: string, note?: string | null, payload?: object }} doc
 */
export async function upsertDailyScan(orgId, publisher, doc = {}) {
  const oid = String(orgId || '').trim()
  const pub = normalizeUsername(publisher)
  if (!oid || !pub) throw new Error('orgId and publisher required')
  const title = String(doc.title || '').trim().slice(0, 200) || 'Daily scan'
  const note = doc.note != null ? String(doc.note).slice(0, 2000) : null
  const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : {}
  const empty =
    !payload ||
    (typeof payload === 'object' &&
      !Object.keys(payload).length) ||
    (Array.isArray(payload.topPatterns) &&
      payload.topPatterns.length === 0 &&
      !payload.breadth &&
      !payload.summary)

  const existing = await getLatestByKind(oid, 'daily-scan')
  if (empty && existing) {
    const prev = existing.payload || {}
    const prevHas =
      (Array.isArray(prev.topPatterns) && prev.topPatterns.length > 0) ||
      Boolean(prev.breadth) ||
      Boolean(prev.summary)
    if (prevHas) {
      return { ...existing, skippedEmptyOverwrite: true }
    }
  }

  const now = Date.now()
  if (existing) {
    await sqlRun(
      `UPDATE trainer_publications
       SET title = ?, note = ?, payload_json = ?, version = version + 1,
           publisher = ?, updated_at = ?
       WHERE id = ?`,
      [title, note, JSON.stringify(payload), pub, now, existing.id],
    )
    return {
      ...existing,
      title,
      note,
      payload,
      publisher: pub,
      version: existing.version + 1,
      updatedAt: now,
      skippedEmptyOverwrite: false,
    }
  }

  return publish(oid, pub, {
    kind: 'daily-scan',
    title,
    note,
    cohort: null,
    payload,
  })
}

/**
 * List publications visible to a member. When cohort is set, includes org-wide
 * (NULL cohort) rows plus matching cohort rows.
 * @param {string} orgId
 * @param {string | null | undefined} cohort
 */
export async function listForMember(orgId, cohort) {
  const oid = String(orgId || '').trim()
  const c = cohort != null && String(cohort).trim() ? String(cohort).trim() : null
  let rows
  if (c) {
    rows = await sqlAll(
      `SELECT id, org_id AS "orgId", cohort, publisher, kind, title, note,
              payload_json AS "payloadJson", version,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM trainer_publications
       WHERE org_id = ? AND (cohort IS NULL OR cohort = ?)
       ORDER BY created_at DESC`,
      [oid, c],
    )
  } else {
    rows = await sqlAll(
      `SELECT id, org_id AS "orgId", cohort, publisher, kind, title, note,
              payload_json AS "payloadJson", version,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM trainer_publications
       WHERE org_id = ?
       ORDER BY created_at DESC`,
      [oid],
    )
  }
  return rows.map((row) => {
    let payload = {}
    try {
      payload = JSON.parse(row.payloadJson || '{}')
    } catch {
      payload = {}
    }
    return {
      id: row.id,
      orgId: row.orgId,
      cohort: row.cohort || null,
      publisher: row.publisher,
      kind: row.kind,
      title: row.title,
      note: row.note || null,
      payload,
      version: Number(row.version) || 1,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
    }
  })
}
