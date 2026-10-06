export const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const DAY_MS = 86_400_000;

// BookLeaf policy: royalties are calculated quarterly and paid within 45 days of quarter end.
// Assumes calendar quarters (documented assumption). Returns the most recent *completed* quarter,
// so the value is stable for ~3 months (keeps the draft cache key stable).
export function latestQuarterPayout(now: Date): { quarterEnd: Date; deadline: Date; deadlinePassed: boolean } {
  const quarterIndex = Math.floor(now.getUTCMonth() / 3);
  const currentQuarterStart = Date.UTC(now.getUTCFullYear(), quarterIndex * 3, 1);
  const quarterEnd = new Date(currentQuarterStart - DAY_MS);
  const deadline = new Date(quarterEnd.getTime() + 45 * DAY_MS);
  return { quarterEnd, deadline, deadlinePassed: now.getTime() > deadline.getTime() };
}
