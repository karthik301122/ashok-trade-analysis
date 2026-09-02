/** TradingView-style drawing tool catalog for PatternDrawOverlay. */

export type DrawToolCategoryId =
  | 'lines'
  | 'channels'
  | 'pitchforks'
  | 'fibonacci'
  | 'gann'
  | 'patterns'
  | 'elliott'
  | 'cycles'
  | 'forecasting'
  | 'volume'
  | 'measurers'
  | 'brushes'
  | 'arrows'
  | 'shapes'
  | 'text'

export type DrawToolKind =
  | 'level'
  | 'zone'
  | 'shape'
  | 'fib'
  | 'gann'
  | 'pattern'
  | 'annotation'
  | 'measure'
  | 'forecast'
  | 'brush'

export type DrawnToolType =
  | 'cursor'
  | 'eraser'
  | 'hline'
  | 'hray'
  | 'vline'
  | 'crossline'
  | 'trendline'
  | 'ray'
  | 'extended_line'
  | 'info_line'
  | 'trend_angle'
  | 'parallel_channel'
  | 'regression_channel'
  | 'flat_channel'
  | 'disjoint_channel'
  | 'pitchfork'
  | 'schiff_pitchfork'
  | 'modified_schiff_pitchfork'
  | 'inside_pitchfork'
  | 'fib_retracement'
  | 'fib_extension'
  | 'fib_channel'
  | 'fib_timezone'
  | 'fib_fan'
  | 'fib_circles'
  | 'fib_wedge'
  | 'pitchfan'
  | 'gann_box'
  | 'gann_square'
  | 'gann_fan'
  | 'xabcd'
  | 'cypher'
  | 'head_shoulders'
  | 'abcd'
  | 'triangle_pattern'
  | 'three_drives'
  | 'elliott_impulse'
  | 'elliott_correction'
  | 'elliott_triangle'
  | 'elliott_combo'
  | 'elliott_triple_combo'
  | 'cyclic_lines'
  | 'time_cycles'
  | 'sine_line'
  | 'long_position'
  | 'short_position'
  | 'forecast'
  | 'bars_pattern'
  | 'ghost_feed'
  | 'anchored_vwap'
  | 'volume_profile'
  | 'anchored_volume_profile'
  | 'price_range'
  | 'date_range'
  | 'date_price_range'
  | 'brush'
  | 'highlighter'
  | 'arrow'
  | 'arrow_marker'
  | 'arrow_up'
  | 'arrow_down'
  | 'zone'
  | 'rectangle'
  | 'rotated_rectangle'
  | 'path'
  | 'circle'
  | 'ellipse'
  | 'polyline'
  | 'triangle'
  | 'arc'
  | 'curve'
  | 'double_curve'
  | 'text'
  | 'note'
  | 'price_note'
  | 'pin'
  | 'callout'
  | 'comment'
  | 'price_label'
  | 'flag'

export type DrawToolDef = {
  id: DrawnToolType
  label: string
  category: DrawToolCategoryId
  kind: DrawToolKind
  /** Points needed to finish; -1 = polyline until double-click / Enter */
  clickCount: number
  shortcut?: string
}

export const DRAW_TOOL_CATEGORIES: { id: DrawToolCategoryId; label: string }[] = [
  { id: 'lines', label: 'Lines' },
  { id: 'channels', label: 'Channels' },
  { id: 'pitchforks', label: 'Pitchforks' },
  { id: 'fibonacci', label: 'Fibonacci' },
  { id: 'gann', label: 'Gann' },
  { id: 'patterns', label: 'Chart patterns' },
  { id: 'elliott', label: 'Elliott waves' },
  { id: 'cycles', label: 'Cycles' },
  { id: 'forecasting', label: 'Forecasting' },
  { id: 'volume', label: 'Volume-based' },
  { id: 'measurers', label: 'Measurers' },
  { id: 'brushes', label: 'Brushes' },
  { id: 'arrows', label: 'Arrows' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'text', label: 'Text & notes' },
]

export const DRAW_TOOL_DEFS: DrawToolDef[] = [
  // Lines
  { id: 'trendline', label: 'Trend line', category: 'lines', kind: 'level', clickCount: 2, shortcut: 'Alt+T' },
  { id: 'ray', label: 'Ray', category: 'lines', kind: 'level', clickCount: 2 },
  { id: 'info_line', label: 'Info line', category: 'lines', kind: 'level', clickCount: 2 },
  { id: 'extended_line', label: 'Extended line', category: 'lines', kind: 'level', clickCount: 2 },
  { id: 'trend_angle', label: 'Trend angle', category: 'lines', kind: 'level', clickCount: 2 },
  { id: 'hline', label: 'Horizontal line', category: 'lines', kind: 'level', clickCount: 1, shortcut: 'Alt+H' },
  { id: 'hray', label: 'Horizontal ray', category: 'lines', kind: 'level', clickCount: 1, shortcut: 'Alt+J' },
  { id: 'vline', label: 'Vertical line', category: 'lines', kind: 'level', clickCount: 1, shortcut: 'Alt+V' },
  { id: 'crossline', label: 'Cross line', category: 'lines', kind: 'level', clickCount: 1, shortcut: 'Alt+C' },
  // Channels
  { id: 'parallel_channel', label: 'Parallel channel', category: 'channels', kind: 'zone', clickCount: 3 },
  { id: 'regression_channel', label: 'Regression trend', category: 'channels', kind: 'zone', clickCount: 2 },
  { id: 'flat_channel', label: 'Flat top/bottom', category: 'channels', kind: 'zone', clickCount: 3 },
  { id: 'disjoint_channel', label: 'Disjoint channel', category: 'channels', kind: 'zone', clickCount: 4 },
  // Pitchforks
  { id: 'pitchfork', label: 'Pitchfork', category: 'pitchforks', kind: 'level', clickCount: 3 },
  { id: 'schiff_pitchfork', label: 'Schiff pitchfork', category: 'pitchforks', kind: 'level', clickCount: 3 },
  { id: 'modified_schiff_pitchfork', label: 'Modified Schiff pitchfork', category: 'pitchforks', kind: 'level', clickCount: 3 },
  { id: 'inside_pitchfork', label: 'Inside pitchfork', category: 'pitchforks', kind: 'level', clickCount: 3 },
  // Fibonacci
  { id: 'fib_retracement', label: 'Fib retracement', category: 'fibonacci', kind: 'fib', clickCount: 2, shortcut: 'Alt+F' },
  { id: 'fib_extension', label: 'Trend-based fib extension', category: 'fibonacci', kind: 'fib', clickCount: 3 },
  { id: 'fib_channel', label: 'Fib channel', category: 'fibonacci', kind: 'fib', clickCount: 3 },
  { id: 'fib_timezone', label: 'Fib time zone', category: 'fibonacci', kind: 'fib', clickCount: 2 },
  { id: 'fib_fan', label: 'Fib speed resistance fan', category: 'fibonacci', kind: 'fib', clickCount: 2 },
  { id: 'pitchfan', label: 'Pitchfan', category: 'fibonacci', kind: 'fib', clickCount: 3 },
  { id: 'fib_circles', label: 'Fib circles', category: 'fibonacci', kind: 'fib', clickCount: 2 },
  { id: 'fib_wedge', label: 'Fib wedge', category: 'fibonacci', kind: 'fib', clickCount: 3 },
  // Gann
  { id: 'gann_box', label: 'Gann box', category: 'gann', kind: 'gann', clickCount: 2 },
  { id: 'gann_square', label: 'Gann square', category: 'gann', kind: 'gann', clickCount: 2 },
  { id: 'gann_fan', label: 'Gann fan', category: 'gann', kind: 'gann', clickCount: 2 },
  // Chart patterns
  { id: 'xabcd', label: 'XABCD pattern', category: 'patterns', kind: 'pattern', clickCount: 5 },
  { id: 'cypher', label: 'Cypher pattern', category: 'patterns', kind: 'pattern', clickCount: 5 },
  { id: 'head_shoulders', label: 'Head and shoulders', category: 'patterns', kind: 'pattern', clickCount: 5 },
  { id: 'abcd', label: 'ABCD pattern', category: 'patterns', kind: 'pattern', clickCount: 4 },
  { id: 'triangle_pattern', label: 'Triangle pattern', category: 'patterns', kind: 'pattern', clickCount: 4 },
  { id: 'three_drives', label: 'Three drives pattern', category: 'patterns', kind: 'pattern', clickCount: 6 },
  // Elliott
  { id: 'elliott_impulse', label: 'Elliott impulse (1-5)', category: 'elliott', kind: 'pattern', clickCount: 6 },
  { id: 'elliott_correction', label: 'Elliott correction (A-B-C)', category: 'elliott', kind: 'pattern', clickCount: 4 },
  { id: 'elliott_triangle', label: 'Elliott triangle (A-E)', category: 'elliott', kind: 'pattern', clickCount: 5 },
  { id: 'elliott_combo', label: 'Elliott double combo (W-X-Y)', category: 'elliott', kind: 'pattern', clickCount: 5 },
  { id: 'elliott_triple_combo', label: 'Elliott triple combo', category: 'elliott', kind: 'pattern', clickCount: 7 },
  // Cycles
  { id: 'cyclic_lines', label: 'Cyclic lines', category: 'cycles', kind: 'shape', clickCount: 2 },
  { id: 'time_cycles', label: 'Time cycles', category: 'cycles', kind: 'shape', clickCount: 2 },
  { id: 'sine_line', label: 'Sine line', category: 'cycles', kind: 'shape', clickCount: 2 },
  // Forecasting
  { id: 'long_position', label: 'Long position', category: 'forecasting', kind: 'forecast', clickCount: 2 },
  { id: 'short_position', label: 'Short position', category: 'forecasting', kind: 'forecast', clickCount: 2 },
  { id: 'forecast', label: 'Position forecast', category: 'forecasting', kind: 'forecast', clickCount: 2 },
  { id: 'bars_pattern', label: 'Bars pattern', category: 'forecasting', kind: 'forecast', clickCount: 2 },
  { id: 'ghost_feed', label: 'Ghost feed', category: 'forecasting', kind: 'forecast', clickCount: 2 },
  // Volume
  { id: 'anchored_vwap', label: 'Anchored VWAP', category: 'volume', kind: 'level', clickCount: 1 },
  { id: 'volume_profile', label: 'Fixed range volume profile', category: 'volume', kind: 'zone', clickCount: 2 },
  { id: 'anchored_volume_profile', label: 'Anchored volume profile', category: 'volume', kind: 'zone', clickCount: 2 },
  // Measurers
  { id: 'price_range', label: 'Price range', category: 'measurers', kind: 'measure', clickCount: 2 },
  { id: 'date_range', label: 'Date range', category: 'measurers', kind: 'measure', clickCount: 2 },
  { id: 'date_price_range', label: 'Date and price range', category: 'measurers', kind: 'measure', clickCount: 2 },
  // Brushes
  { id: 'brush', label: 'Brush', category: 'brushes', kind: 'brush', clickCount: -1 },
  { id: 'highlighter', label: 'Highlighter', category: 'brushes', kind: 'brush', clickCount: -1 },
  // Arrows
  { id: 'arrow_marker', label: 'Arrow marker', category: 'arrows', kind: 'annotation', clickCount: 1 },
  { id: 'arrow', label: 'Arrow', category: 'arrows', kind: 'annotation', clickCount: 2 },
  { id: 'arrow_up', label: 'Arrow mark up', category: 'arrows', kind: 'annotation', clickCount: 1 },
  { id: 'arrow_down', label: 'Arrow mark down', category: 'arrows', kind: 'annotation', clickCount: 1 },
  // Shapes
  { id: 'rectangle', label: 'Rectangle', category: 'shapes', kind: 'zone', clickCount: 2, shortcut: 'Alt+Shift+R' },
  { id: 'zone', label: 'Zone (legacy)', category: 'shapes', kind: 'zone', clickCount: 2 },
  { id: 'rotated_rectangle', label: 'Rotated rectangle', category: 'shapes', kind: 'zone', clickCount: 3 },
  { id: 'path', label: 'Path', category: 'shapes', kind: 'shape', clickCount: -1 },
  { id: 'circle', label: 'Circle', category: 'shapes', kind: 'shape', clickCount: 2 },
  { id: 'ellipse', label: 'Ellipse', category: 'shapes', kind: 'shape', clickCount: 2 },
  { id: 'polyline', label: 'Polyline', category: 'shapes', kind: 'shape', clickCount: -1 },
  { id: 'triangle', label: 'Triangle', category: 'shapes', kind: 'shape', clickCount: 3 },
  { id: 'arc', label: 'Arc', category: 'shapes', kind: 'shape', clickCount: 3 },
  { id: 'curve', label: 'Curve', category: 'shapes', kind: 'shape', clickCount: 3 },
  { id: 'double_curve', label: 'Double curve', category: 'shapes', kind: 'shape', clickCount: 4 },
  // Text
  { id: 'text', label: 'Text', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'note', label: 'Note', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'price_note', label: 'Price note', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'pin', label: 'Pin', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'callout', label: 'Callout', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'comment', label: 'Comment', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'price_label', label: 'Price label', category: 'text', kind: 'annotation', clickCount: 1 },
  { id: 'flag', label: 'Flag mark', category: 'text', kind: 'annotation', clickCount: 1 },
]

const defMap = new Map(DRAW_TOOL_DEFS.map((d) => [d.id, d]))

export function getDrawToolDef(id: DrawnToolType): DrawToolDef | undefined {
  return defMap.get(id)
}

export function toolsForCategory(category: DrawToolCategoryId): DrawToolDef[] {
  return DRAW_TOOL_DEFS.filter((d) => d.category === category)
}

export function minPointsForTool(type: DrawnToolType): number {
  const def = getDrawToolDef(type)
  if (!def) return 1
  if (def.clickCount === -1) return 2
  return Math.max(1, def.clickCount)
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

export const PATTERN_POINT_LABELS: Partial<Record<DrawnToolType, string[]>> = {
  xabcd: ['X', 'A', 'B', 'C', 'D'],
  cypher: ['X', 'A', 'B', 'C', 'D'],
  head_shoulders: ['L', 'H', 'R', 'N', 'T'],
  abcd: ['A', 'B', 'C', 'D'],
  triangle_pattern: ['A', 'B', 'C', 'D'],
  three_drives: ['1', '2', '3', '4', '5', '6'],
  elliott_impulse: ['0', '1', '2', '3', '4', '5'],
  elliott_correction: ['A', 'B', 'C', 'D'],
  elliott_triangle: ['A', 'B', 'C', 'D', 'E'],
  elliott_combo: ['W', 'X', 'Y', 'Z', 'Q'],
  elliott_triple_combo: ['W', 'X', 'Y', 'X2', 'Z', 'X3', 'Q'],
}
