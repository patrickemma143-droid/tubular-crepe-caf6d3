import type { Feed, FeedMove } from '../db/types';
import { addDays, daysBetween, todayISO } from './dates';

// Stock is worked out from movements: bought/received (+), used (−),
// and stock counts, which reset the level to what was actually counted.

export function movesFor(feedId: string, moves: FeedMove[]): FeedMove[] {
  return moves
    .filter((m) => m.feed_id === feedId)
    .sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
}
// On the same day: a count is taken first, then deliveries, then usage
const rank = (m: FeedMove) => (m.type === 'count' ? 0 : m.type === 'in' ? 1 : 2);

export function stockOn(feedId: string, moves: FeedMove[], on = todayISO()): number {
  let s = 0;
  for (const m of movesFor(feedId, moves)) {
    if (m.date > on) break;
    if (m.type === 'count') s = m.qty;
    else if (m.type === 'in') s += m.qty;
    else s -= m.qty;
  }
  return Math.max(0, Math.round(s * 100) / 100);
}

/** Average used per day over the last two weeks (or since the feed was first recorded). */
export function dailyUse(feed: Feed, moves: FeedMove[], on = todayISO()): { perDay: number; basis: 'recorded' | 'usual ration' | 'none' } {
  const ms = movesFor(feed.id, moves).filter((m) => m.date <= on);
  const from = addDays(on, -13);
  const used = ms.filter((m) => m.type === 'out' && m.date >= from);
  if (used.length >= 2) {
    const first = ms[0]?.date || from;
    const days = Math.min(14, daysBetween(first > from ? first : from, on) + 1);
    return { perDay: used.reduce((s, m) => s + m.qty, 0) / Math.max(1, days), basis: 'recorded' };
  }
  if (feed.daily_ration) return { perDay: feed.daily_ration, basis: 'usual ration' };
  return { perDay: 0, basis: 'none' };
}

export function costPerUnit(feedId: string, moves: FeedMove[]): number | null {
  const ins = moves.filter((m) => m.feed_id === feedId && m.type === 'in' && m.cost && m.qty > 0);
  const qty = ins.reduce((s, m) => s + m.qty, 0);
  return qty ? ins.reduce((s, m) => s + (m.cost || 0), 0) / qty : null;
}

export interface FeedStatus {
  feed: Feed;
  stock: number;
  perDay: number;
  basis: 'recorded' | 'usual ration' | 'none';
  daysLeft: number | null;
  low: boolean;
  out: boolean;
  unitCost: number | null;
}

export function feedStatus(feeds: Feed[], moves: FeedMove[], on = todayISO()): FeedStatus[] {
  return feeds.filter((f) => !f.archived).map((feed) => {
    const stock = stockOn(feed.id, moves, on);
    const { perDay, basis } = dailyUse(feed, moves, on);
    const daysLeft = perDay > 0 ? stock / perDay : null;
    const hasMoves = moves.some((m) => m.feed_id === feed.id);
    return {
      feed, stock, perDay, basis, daysLeft,
      out: hasMoves && stock <= 0,
      low: hasMoves && ((feed.low_level != null && stock <= feed.low_level) || (daysLeft != null && daysLeft < 7)),
      unitCost: costPerUnit(feed.id, moves),
    };
  });
}

export function fmtQty(n: number, unit: string): string {
  const v = Math.round(n * 10) / 10;
  return `${v.toLocaleString('en-US')} ${unit}`;
}
