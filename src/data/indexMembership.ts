import type { UniverseId } from '../components/breadth/breadthMath'
import raw from '../data/indexMembers.json'

export type IndexMembersFile = {
  asOf: string
  source: 'weight-rank-proxy' | 'official-csv' | string
  note: string
  asx200: string[]
  asx500: string[]
  mid: string[]
  small: string[]
}

export const INDEX_MEMBERS = raw as IndexMembersFile

function memberList(key: keyof Pick<IndexMembersFile, 'asx200' | 'asx500' | 'mid' | 'small'>): string[] {
  const list = INDEX_MEMBERS[key]
  return Array.isArray(list) ? list : []
}

const SETS: Record<UniverseId, Set<string>> = {
  asx200: new Set(memberList('asx200')),
  mid: new Set(memberList('mid')),
  small: new Set(memberList('small')),
}

export function membershipSet(id: UniverseId): Set<string> {
  return SETS[id]
}

export function membershipSourceLabel(): string {
  if (INDEX_MEMBERS.source === 'eodhd-fundamentals') {
    return `Index constituents · as of ${INDEX_MEMBERS.asOf}`
  }
  if (INDEX_MEMBERS.source === 'official-csv') {
    return `ASX200 from official CSV · as of ${INDEX_MEMBERS.asOf}`
  }
  if (INDEX_MEMBERS.source === 'ioz-etf-holdings') {
    return `ASX200 via free iShares IOZ holdings · as of ${INDEX_MEMBERS.asOf}`
  }
  return `Weight-rank proxy sets · as of ${INDEX_MEMBERS.asOf} (run npm run refresh:index-members)`
}
