const ZERO_DECIMAL = new Set(['UGX', 'KES', 'TZS', 'RWF', 'BIF', 'JPY']);

export function money(n: number, currency = 'UGX', opts: { sign?: boolean; compact?: boolean } = {}): string {
  const dec = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const abs = Math.abs(n);
  let body: string;
  if (opts.compact && abs >= 1_000_000) body = (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + 'M';
  else if (opts.compact && abs >= 10_000) body = Math.round(abs / 1000) + 'k';
  else body = abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}${currency} ${body}`;
}

export function litres(n: number, dec = 1): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })} L`;
}

export function num(n: number, dec = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function pct(n: number | null, dec = 0): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dec)}%`;
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
