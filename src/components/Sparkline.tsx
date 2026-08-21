type Props = {
  values: number[]
  width?: number
  height?: number
  positive?: boolean
}

export function Sparkline({ values, width = 64, height = 22, positive }: Props) {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / span) * (height - 2) - 1
      return `${x},${y}`
    })
    .join(' ')
  const up = positive ?? values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={up ? '#16a34a' : '#dc2626'}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  )
}
