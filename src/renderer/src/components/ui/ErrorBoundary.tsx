import React from 'react'
import i18n from '../../i18n'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary — catches render errors to prevent full white-screen crashes.
 * Wraps the entire app so any component error shows a recovery UI instead of
 * an unmounted React tree.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '32px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: 'var(--color-ink, #1d1d1f)',
            background: 'var(--color-canvas, #ffffff)'
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            {i18n.t('error.title')}
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-ink-subtle, #6e6e73)',
              marginBottom: '16px',
              textAlign: 'center',
              maxWidth: '400px'
            }}
          >
            {this.state.error?.message ?? i18n.t('error.body')}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--color-accent, #002fa7)',
              color: '#ffffff',
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: '32px'
            }}
          >
            {i18n.t('error.reload')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
