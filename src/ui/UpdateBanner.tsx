import { useRegisterSW } from 'virtual:pwa-register/react'
import { PALETTE } from './tokens'

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      style={{
        background: PALETTE.panel,
        borderBottom: `1px solid ${PALETTE.cardioBorder}`,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 50,
      }}
    >
      <span style={{ fontSize: 13, color: PALETTE.fg }}>New version available</span>
      <button
        onClick={() => void updateServiceWorker(true)}
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: PALETTE.cardioPillText,
          background: PALETTE.cardioPillBg,
          border: `1px solid ${PALETTE.cardioBorder}`,
          borderRadius: 20,
          padding: '4px 14px',
          minHeight: 32,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Update now
      </button>
    </div>
  )
}
