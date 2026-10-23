// "Today, 09:15", "Yesterday, 16:42", "Monday, 11:03" or "12 Oct, 14:20": the
// day words people use, so a history reads as a story and not as a log.
const DAY_MS = 24 * 3600 * 1000

function midnight(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
}

export function dayTime(ms: number, now: number = Date.now()): string {
  const at = new Date(ms)
  const clock = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  const days = Math.round((midnight(new Date(now)) - midnight(at)) / DAY_MS)
  if (days === 0) return `Today, ${clock}`
  if (days === 1) return `Yesterday, ${clock}`
  if (days > 1 && days < 7) return `${at.toLocaleDateString(undefined, { weekday: 'long' })}, ${clock}`
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${clock}`
}
