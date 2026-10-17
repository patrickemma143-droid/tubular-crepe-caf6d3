import { db, saveMany } from '../db/db';
import type { Animal, Feeding, StockMonth } from '../db/types';
import { addMonths, todayISO } from './dates';
import { months, rowsFor } from './register';

// Turns the latest herd-register counts into one record per animal, so a ranch
// with no ear tags yet can start tracking individuals. Every record gets a
// temporary number (TMP-HF-012) that is replaced by the real ear tag later.
// Ages come from the register's own births: the newest births in each sex line
// go to the youngest class, older births to the next class up.

interface ClassRule { prefix: string; sex: 'F' | 'M'; line?: 'F' | 'M'; fallbackMonths?: number; maxMonths?: number; patch: Partial<Animal> }

const RULES: Record<string, ClassRule> = {
  'Female calves': { prefix: 'FC', sex: 'F', line: 'F', fallbackMonths: 8, maxMonths: 24, patch: {} },
  Heifers: { prefix: 'HF', sex: 'F', line: 'F', fallbackMonths: 24, patch: {} },
  Cows: { prefix: 'CW', sex: 'F', patch: { calved_before: true } },
  'Bull calves': { prefix: 'BC', sex: 'M', line: 'M', fallbackMonths: 8, maxMonths: 24, patch: {} },
  'Young bulls for breeding': { prefix: 'YB', sex: 'M', line: 'M', fallbackMonths: 18, maxMonths: 36, patch: {} },
  Castrates: { prefix: 'CS', sex: 'M', line: 'M', fallbackMonths: 30, patch: { castrated: true } },
  'Breeding bulls': { prefix: 'BB', sex: 'M', patch: { breeding_bull: true } },
};
// youngest first within each sex line
const LINE_ORDER = ['Female calves', 'Heifers', 'Bull calves', 'Young bulls for breeding', 'Castrates', 'Cows', 'Breeding bulls'];
const BIRTH_CLASS = { F: 'Female calves', M: 'Bull calves' } as const;

export interface PlanRow { cls: string; count: number; prefix: string; datedFromBirths: number; capped?: number; oldestDob?: string; newestDob?: string }
export interface Plan { month: string; rows: PlanRow[]; skipped: { cls: string; count: number }[]; total: number; animals: Omit<Animal, 'created_at' | 'updated_at' | 'deleted' | 'dirty'>[] }

export const bootId = (prefix: string, n: number) => `boot-${prefix.toLowerCase()}-${String(n).padStart(3, '0')}`;
export const bootTag = (prefix: string, n: number) => `TMP-${prefix}-${String(n).padStart(3, '0')}`;

export function plan(stock: StockMonth[], opts: { breed?: string; feeding?: Feeding; group?: (cls: string) => string | undefined } = {}, today = todayISO()): Plan | null {
  const ms = months(stock).filter((m) => m <= today.slice(0, 7));
  const month = ms[ms.length - 1];
  if (!month) return null;
  const latest = rowsFor(stock, month);
  // Birth dates, newest first, one per calf born, per sex line
  const births: Record<'F' | 'M', string[]> = { F: [], M: [] };
  for (const m of [...ms].reverse()) {
    for (const sex of ['F', 'M'] as const) {
      const row = rowsFor(stock, m).find((r) => r.cls === BIRTH_CLASS[sex]);
      const day = `${m}-15` > today ? today : `${m}-15`;
      for (let i = 0; i < (row?.births || 0); i++) births[sex].push(day);
    }
  }
  const cursor = { F: 0, M: 0 };
  const rows: PlanRow[] = [], skipped: Plan['skipped'] = [], animals: Plan['animals'] = [];
  const ordered = [...latest].sort((a, b) => (LINE_ORDER.indexOf(a.cls) + 99 * +!(a.cls in RULES)) - (LINE_ORDER.indexOf(b.cls) + 99 * +!(b.cls in RULES)));
  for (const r of ordered) {
    const rule = RULES[r.cls];
    if (!r.closing) continue;
    if (!rule) { skipped.push({ cls: r.cls, count: r.closing }); continue; }
    const pr: PlanRow = { cls: r.cls, count: r.closing, prefix: rule.prefix, datedFromBirths: 0 };
    for (let n = 1; n <= r.closing; n++) {
      let dob: string | undefined;
      if (rule.line) {
        dob = births[rule.line][cursor[rule.line]++];
        if (dob) pr.datedFromBirths++;
        else dob = addMonths(today, -(rule.fallbackMonths || 24));
        // Births missing from the ledger push the walk too far back; a calf class is graded up yearly
        const oldest = rule.maxMonths ? addMonths(today, -rule.maxMonths) : undefined;
        if (oldest && dob < oldest) { dob = oldest; pr.capped = (pr.capped || 0) + 1; }
        pr.newestDob ??= dob; pr.oldestDob = dob;
      }
      animals.push({
        id: bootId(rule.prefix, n), tag: bootTag(rule.prefix, n), sex: rule.sex, source: 'born', status: 'active',
        breed: opts.breed || undefined, feeding: opts.feeding, group: opts.group?.(r.cls),
        dob, dob_estimated: dob ? true : undefined, provisional: true,
        notes: `Started from the herd register (${r.cls}, ${month}). Replace the temporary number with the ear tag when tagged.`,
        ...rule.patch,
      } as Plan['animals'][number]);
    }
    rows.push(pr);
  }
  return { month, rows, skipped, total: animals.length, animals };
}

/** Creates the records that don't exist yet. Safe to run twice, and on two phones: ids are fixed. */
export async function apply(p: Plan): Promise<{ created: number; existed: number }> {
  const have = new Set((await db.animals.bulkGet(p.animals.map((a) => a.id))).filter(Boolean).map((a) => a!.id));
  const fresh = p.animals.filter((a) => !have.has(a.id));
  await saveMany('animals', fresh);
  return { created: fresh.length, existed: have.size };
}

export const startedFromRegister = (animals: Animal[]) => animals.filter((a) => a.id.startsWith('boot-'));
