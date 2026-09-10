import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDb, resetDbForTests, sqlRun } from './db.mjs'
import {
  createOrg,
  createInvite,
  getInviteByToken,
  activateInvite,
  acceptInvite,
  setSeats,
  listMembers,
} from './orgStore.mjs'

describe('org invite seat join', () => {
  beforeEach(async () => {
    await resetDbForTests()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-invite-'))
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite')
    delete process.env.DATABASE_URL
    await initDb()
    await sqlRun('DELETE FROM org_invites')
    await sqlRun('DELETE FROM org_members')
    await sqlRun('DELETE FROM organisations')
  })

  it('creates invite and previews by token', async () => {
    const org = await createOrg('Test School', 'owner@school.edu')
    const invite = await createInvite(org.id, { email: 'student@school.edu', role: 'student' })
    expect(invite.token).toBeTruthy()
    expect(invite.inviteUrlPath).toContain('/invite?token=')

    const preview = await getInviteByToken(invite.token)
    expect(preview).toBeTruthy()
    expect(preview.email).toBe('student@school.edu')
    expect(preview.orgName).toBe('Test School')
    expect(preview.status).toBe('pending')
  })

  it('activateInvite rejects when seats are full', async () => {
    const org = await createOrg('Full School', 'owner@school.edu')
    await setSeats(org.id, 1)
    // owner already occupies the only seat
    const invite = await createInvite(org.id, { email: 'student@school.edu' })
    await expect(activateInvite(invite.token, 'student@school.edu')).rejects.toThrow(
      /No seats available/i,
    )
  })

  it('acceptInvite joins under org seat when seats available', async () => {
    const org = await createOrg('Open School', 'owner@school.edu')
    await setSeats(org.id, 5)
    const invite = await createInvite(org.id, { email: 'student@school.edu', role: 'student' })
    const result = await acceptInvite(invite.token, 'student@school.edu')
    expect(result.ok).toBe(true)
    expect(result.orgId).toBe(org.id)
    const members = await listMembers(org.id)
    expect(members.some((m) => m.username === 'student@school.edu')).toBe(true)

    const again = await activateInvite(invite.token, 'student@school.edu')
    expect(again.already).toBe(true)
  })

  it('rejects wrong email', async () => {
    const org = await createOrg('Open School', 'owner@school.edu')
    await setSeats(org.id, 5)
    const invite = await createInvite(org.id, { email: 'student@school.edu' })
    await expect(acceptInvite(invite.token, 'other@school.edu')).rejects.toThrow(/invited email/i)
  })
})
