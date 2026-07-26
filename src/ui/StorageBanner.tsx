export function StorageBanner() {
  return (
    <div className="bg-red-600 text-white px-4 py-3 text-sm font-medium text-center">
      Not saving to this device — export a backup now.{' '}
      <span className="underline">
        Go to Settings → Export.
      </span>
    </div>
  )
}
