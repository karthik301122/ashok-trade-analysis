import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  title?: string
  onRetry?: () => void
}

export class PanelErrorBoundary extends Component<
  Props,
  { error: Error | null; retryKey: number }
> {
  state = { error: null as Error | null, retryKey: 0 }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[panel]', error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: null, retryKey: this.state.retryKey + 1 })
    this.props.onRetry?.()
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="rounded-2xl border border-rose-300 bg-[var(--color-surface)] p-6 dark:border-rose-800">
          <h2 className="text-lg font-bold text-rose-700 dark:text-rose-300">
            {this.props.title ?? 'This panel failed to load'}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            The rest of the app should still work. Try again, or switch tabs and come back.
          </p>
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 font-mono text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {error.message}
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-4 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
          >
            Retry panel
          </button>
        </div>
      )
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}
