export function formatBytes(bytes: number): string {
  if (!bytes)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000)
    return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60)
    return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} m ${Math.round(seconds % 60)} s`
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}
