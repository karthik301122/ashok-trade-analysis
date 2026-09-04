import { describe, expect, it } from 'vitest'
import {
  directorFromHeadline,
  filingKindFromHeadline,
  isDirectorInterestAnnouncement,
  parseConsiderationAud,
  parseDirectorInterestPdf,
  parseShareCount,
} from './asxFilingsParse.mjs'

describe('asxFilingsParse', () => {
  it('parses share counts and skips N/A', () => {
    expect(parseShareCount('4,000,000 Fully Paid Ordinary Shares')).toBe(4_000_000)
    expect(parseShareCount('Not applicable')).toBeNull()
    expect(parseShareCount('Nil')).toBeNull()
  })

  it('parses consideration when cash', () => {
    expect(parseConsiderationAud('$12,500.00 cash')).toBe(12500)
    expect(parseConsiderationAud('Nil')).toBeNull()
  })

  it('reads director from headline', () => {
    expect(directorFromHeadline('Appendix 3Y - Matthew Comyn')).toBe('Matthew Comyn')
    expect(filingKindFromHeadline('Appendix 3Y - X')).toBe('3Y')
  })

  it('detects director interest announcements', () => {
    expect(
      isDirectorInterestAnnouncement({
        headline: 'Change of Director\'s Interest Notice - J Olsen',
        announcementTypes: ['Change of Director\'s Interest Notice'],
      }),
    ).toBe(true)
    expect(
      isDirectorInterestAnnouncement({
        headline: 'Date of AGM and Closing Date for Director Nominations',
        announcementTypes: ['Notice of Meeting - Other'],
      }),
    ).toBe(false)
  })

  it('parses ordinary share acquisition from 3Y text', () => {
    const text = `
Name of Director James Olsen
Date of last notice 19 June 2026
Date of change 3 September 2026
Number acquired 4,000,000 Fully Paid Ordinary Shares
Number disposed 4,000,000 Performance Rights
Value/Consideration
Nil
`
    const p = parseDirectorInterestPdf(text, {
      headline: "Change of Director's Interest Notice - J Olsen",
      ticker: 'XPN',
    })
    expect(p.director).toBe('James Olsen')
    expect(p.side).toBe('buy')
    expect(p.shares).toBe(4_000_000)
  })
})
