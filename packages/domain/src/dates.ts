const SPAIN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in peninsular Spain as YYYY-MM-DD: the only issue date VeriFactu accepts. */
export function todayInSpain(now = new Date()): string {
  return SPAIN_DATE.format(now);
}
