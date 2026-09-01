/** Prefixes for pattern_scan_state IDs (special patterns use plain catalog ids). */
export const CHART_PATTERN_ALERT_PREFIX = 'chart:'
export const CUSTOM_PATTERN_ALERT_PREFIX = 'custom:'

export function chartPatternAlertId(name: string): string {
  return `${CHART_PATTERN_ALERT_PREFIX}${encodeURIComponent(name)}`
}

export function customPatternAlertId(customId: string): string {
  return `${CUSTOM_PATTERN_ALERT_PREFIX}${customId}`
}

export function decodePatternAlertId(patternId: string): string {
  if (patternId.startsWith(CHART_PATTERN_ALERT_PREFIX)) {
    try {
      return decodeURIComponent(patternId.slice(CHART_PATTERN_ALERT_PREFIX.length))
    } catch {
      return patternId.slice(CHART_PATTERN_ALERT_PREFIX.length)
    }
  }
  if (patternId.startsWith(CUSTOM_PATTERN_ALERT_PREFIX)) {
    return 'My pattern'
  }
  return patternId
}
