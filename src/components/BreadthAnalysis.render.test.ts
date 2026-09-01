import { describe, it } from 'vitest'
import { createElement, StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { BreadthAnalysis } from './BreadthAnalysis'
import { buildMarketSnapshot } from '../lib/market'

describe('BreadthAnalysis render', () => {
  it('renders without throwing', () => {
    const snapshot = buildMarketSnapshot()
    renderToString(
      createElement(
        StrictMode,
        null,
        createElement(BreadthAnalysis, { snapshot, active: true }),
      ),
    )
  })
})
