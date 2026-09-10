import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDb, resetDbForTests } from './db.mjs'
import {
  getDeskEntitlement,
  isComplimentaryFullDesk,
  isLaunchPromoFullDeskActive,
} from './deskEntitlement.mjs'

describe('complimentary full desk', () => {
  beforeEach(async () => {
    await resetDbForTests()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-ent-'))
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite')
    delete process.env.DATABASE_URL
    delete process.env.FULL_DESK_PROMO
    delete process.env.FULL_DESK_PROMO_UNTIL
    await initDb()
  })

  it('allowlists founder/test accounts', () => {
    expect(isComplimentaryFullDesk('rupakmolabanti18@gmail.com')).toBe(true)
    expect(isComplimentaryFullDesk('KarthikNagaraju77@gmail.com')).toBe(true)
    expect(isComplimentaryFullDesk('testtraderscope@gmail.com')).toBe(true)
    expect(isComplimentaryFullDesk('random@example.com')).toBe(false)
  })

  it('launch promo is active through end of September 2026', () => {
    expect(isLaunchPromoFullDeskActive(new Date('2026-09-15T12:00:00+10:00'))).toBe(true)
    expect(isLaunchPromoFullDeskActive(new Date('2026-09-30T23:59:59+10:00'))).toBe(true)
    expect(isLaunchPromoFullDeskActive(new Date('2026-10-01T00:00:00+10:00'))).toBe(false)
  })

  it('getDeskEntitlement grants full access to any signed-in user during promo', async () => {
    const ent = await getDeskEntitlement('anyone@example.com')
    expect(ent.fullDeskAccess).toBe(true)
    expect(ent.launchPromo).toBe(true)
    expect(ent.reason).toBe('launch_promo')
  })

  it('getDeskEntitlement grants complimentary without org or billing', async () => {
    process.env.FULL_DESK_PROMO = '0'
    const ent = await getDeskEntitlement('rupakmolabanti18@gmail.com')
    expect(ent.fullDeskAccess).toBe(true)
    expect(ent.complimentary).toBe(true)
    expect(ent.reason).toBe('complimentary')
  })
})
