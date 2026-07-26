interface InstallGateProps {
  onDismiss: () => void
}

export function InstallGate({ onDismiss }: InstallGateProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-6">📲</div>
      <h2 className="text-2xl font-bold mb-3">Add to Home Screen</h2>
      <p className="text-slate-300 mb-4 leading-relaxed">
        Data only persists when launched from your Home Screen icon. In Safari,
        tap the <strong>Share</strong> button (box with arrow), then{' '}
        <strong>Add to Home Screen</strong>.
      </p>
      <p className="text-slate-400 text-sm mb-8">
        If you open this from a Safari tab your data may be deleted after 7 days of inactivity.
      </p>
      <button
        onClick={onDismiss}
        className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold px-8 py-4 rounded-2xl text-lg min-h-[56px]"
      >
        I understand, continue anyway
      </button>
    </div>
  )
}
