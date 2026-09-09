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
