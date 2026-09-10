import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDb, resetDbForTests } from './db.mjs'
import { getDeskEntitlement, isComplimentaryFullDesk } from './deskEntitlement.mjs'

describe('complimentary full desk', () => {
  beforeEach(async () => {
    await resetDbForTests()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-ent-'))
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite')
    delete process.env.DATABASE_URL
    await initDb()
  })

  it('allowlists founder/test accounts', () => {
    expect(isComplimentaryFullDesk('rupakmolabanti18@gmail.com')).toBe(true)
    expect(isComplimentaryFullDesk('KarthikNagaraju77@gmail.com')).toBe(true)
    expect(isComplimentaryFullDesk('testtraderscope@gmail.com')).toBe(true)
    expect(isComplimentaryFullDesk('random@example.com')).toBe(false)
  })

  it('getDeskEntitlement grants full access without org or billing', async () => {
    const ent = await getDeskEntitlement('rupakmolabanti18@gmail.com')
    expect(ent.fullDeskAccess).toBe(true)
    expect(ent.complimentary).toBe(true)
    expect(ent.reason).toBe('complimentary')
  })
})
