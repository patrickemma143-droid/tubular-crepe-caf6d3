import { Link } from 'react-router-dom';
import { Baby, FileBarChart, HeartPulse, Settings, Wallet, Download, Wheat, ClipboardList } from 'lucide-react';
import { months, rowsFor, totals } from '../lib/register';
import { feedStatus } from '../lib/feed';
import { useMemo } from 'react';
import { useFarm, useSettings } from '../db/hooks';
import { needsAttention, repro } from '../lib/herd';
import { useInstall } from '../lib/install';

export default function More() {
  const farm = useFarm();
  const s = useSettings();
  const { installed } = useInstall();
  const counts = useMemo(() => ({
    sick: needsAttention(farm).size,
    lowFeed: feedStatus(farm.feeds, farm.feed_moves).filter((f) => f.low || f.out).length,
    preg: farm.animals.filter((a) => a.status === 'active' && a.sex === 'F' && repro(a, farm.breeding, farm.milk).state === 'pregnant').length,
  }), [farm]);
  const worker = s?.farm_role === 'worker';
  const ms = months(farm.stock); const lastM = ms[ms.length - 1];
  const items = [
    { to: '/register', icon: ClipboardList, t: 'Herd register', d: lastM ? `${totals(rowsFor(farm.stock, lastM)).closing} head · monthly stock by class` : 'Monthly stock count by class, for ranches' },
    { to: '/breeding', icon: Baby, t: 'Breeding & calving', d: `${counts.preg} pregnant · services, pregnancy checks, calvings` },
    { to: '/health', icon: HeartPulse, t: 'Health', d: `${counts.sick} need attention · treatments, vaccines, deworming` },
    { to: '/feed', icon: Wheat, t: 'Feed', d: `${counts.lowFeed ? `${counts.lowFeed} running low · ` : ''}stock in store, purchases, daily use` },
    ...(worker ? [] : [{ to: '/money', icon: Wallet, t: 'Money', d: 'Milk sales, animal sales, expenses, profit' }]),
    { to: '/reports', icon: FileBarChart, t: 'Reports', d: 'Weekly and monthly reports · PDF and Excel' },
    { to: '/settings', icon: Settings, t: 'Settings', d: 'Farm details, reminders, backup and team' },
    ...(installed ? [] : [{ to: '/settings', icon: Download, t: 'Install on this phone', d: 'Works offline from your home screen' }]),
  ];
  return (
    <div className="stack">
      <h1>More</h1>
      <div className="list">
        {items.map((i) => (
          <Link key={i.t} to={i.to} className="item"><i.icon size={22} aria-hidden /><div className="main"><div className="title">{i.t}</div><div className="sub">{i.d}</div></div></Link>
        ))}
      </div>
    </div>
  );
}
