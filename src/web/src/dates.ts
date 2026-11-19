/** Whole local calendar days from `date` to `now` (0 = same day, 1 = the day before). */
export function calendarDaysBetween(date: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
}

/** "today 14:02", "yesterday 09:15", or the date, for a Set's last change. */
export function lastChangedLabel(iso: string, now: Date): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const days = calendarDaysBetween(date, now)
  if (days <= 0) return `today ${time}`
  if (days === 1) return `yesterday ${time}`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
