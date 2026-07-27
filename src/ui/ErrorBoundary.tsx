import { Component, type ReactNode } from 'react'
import { exportDatabase, downloadBackup } from '../data/backup'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  async handleExport() {
    try {
      const data = await exportDatabase()
      downloadBackup(data)
    } catch {
      alert('Export failed — try again or clear app data.')
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#e8ecf1', background: '#0f1216', minHeight: '100dvh' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e05252', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <pre
            style={{
              background: '#1a1d24',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              color: '#9ca3af',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              marginBottom: 20,
            }}
          >
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.handleExport()}
            style={{
              display: 'block',
              width: '100%',
              background: '#2d5a3d',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              padding: '14px 20px',
              fontSize: 16,
              cursor: 'pointer',
              marginBottom: 12,
              minHeight: 50,
            }}
          >
            Export backup
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              display: 'block',
              width: '100%',
              background: '#1a1d24',
              color: '#9ca3af',
              border: 'none',
              borderRadius: 12,
              padding: '12px 20px',
              fontSize: 14,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
