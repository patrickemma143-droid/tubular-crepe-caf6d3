import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_SETTINGS, withCloud } from './settings';
import type { Settings } from './types';
import type { Farm } from '../lib/herd';

const live = <T extends { deleted: 0 | 1 }>(rows: T[]) => rows.filter((r) => !r.deleted);

const EMPTY: Farm = { animals: [], milk: [], breeding: [], health: [], weights: [], transactions: [], feeds: [], feed_moves: [], stock: [] };

/** Whole farm snapshot, re-rendered whenever any record changes. */
export function useFarm(): Farm & { loading: boolean } {
  const data = useLiveQuery(async () => {
    const [animals, milk, breeding, health, weights, transactions, feeds, feed_moves, stock] = await Promise.all([
      db.animals.toArray(), db.milk.toArray(), db.breeding.toArray(), db.health.toArray(), db.weights.toArray(), db.transactions.toArray(), db.feeds.toArray(), db.feed_moves.toArray(), db.stock.toArray(),
    ]);
    return {
      animals: live(animals).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })),
      milk: live(milk), breeding: live(breeding), health: live(health), weights: live(weights), transactions: live(transactions),
      feeds: live(feeds).sort((a, b) => a.name.localeCompare(b.name)), feed_moves: live(feed_moves), stock: live(stock),
    };
  }, []);
  return { ...(data || EMPTY), loading: !data };
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => withCloud({ ...DEFAULT_SETTINGS, ...((await db.meta.get('settings')) || {}) }), []);
}
