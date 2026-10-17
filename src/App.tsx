import { Component, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, PawPrint, Milk, Menu, Plus, HeartPulse, Baby, Wallet, FileBarChart, Settings as Cog, ArrowLeft,
  Syringe, ShoppingCart, Receipt, Scale, Tag, CircleDollarSign, Wheat, ClipboardList, GitCompare,
} from 'lucide-react';
import { useSettings } from './db/hooks';
import { FormHost, useForms } from './components/forms';
import { Sheet, ToastProvider } from './components/ui';
import { useSyncStatus } from './lib/sync';
import { startReminderLoop } from './lib/notify';
import { Logo } from './components/Logo';
import { FarmName } from './components/FarmSwitcher';
import Compare from './pages/Compare';
import Today from './pages/Today';
import Animals from './pages/Animals';
import AnimalDetail from './pages/AnimalDetail';
import AnimalForm from './pages/AnimalForm';
import MilkPage from './pages/Milk';
import MilkRecord from './pages/MilkRecord';
import HerdTotal from './pages/HerdTotal';
import Breeding from './pages/Breeding';
import Health from './pages/Health';
import Money from './pages/Money';
import FeedPage from './pages/Feed';
import Register from './pages/Register';
import Guide from './pages/Guide';
import Reports from './pages/Reports';
import More from './pages/More';
import SettingsPage from './pages/Settings';
import Onboarding from './pages/Onboarding';

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/animals', label: 'Animals', icon: PawPrint },
  { to: '/register', label: 'Herd register', icon: ClipboardList },
  { to: '/milk', label: 'Milk', icon: Milk },
  { to: '/breeding', label: 'Breeding', icon: Baby },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/feed', label: 'Feed', icon: Wheat },
  { to: '/money', label: 'Money', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/compare', label: 'Compare farms', icon: GitCompare },
  { to: '/settings', label: 'Settings', icon: Cog },
];

function useTheme(theme?: string) {
  useEffect(() => {
    const el = document.documentElement;
    if (!theme || theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);
}

function RecordSheet({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const open = useForms();
  const go = (to: string) => { onClose(); nav(to); };
  const form = (f: Parameters<typeof open>[0]) => { onClose(); open(f); };
  const groups: { title: string; items: { label: string; icon: any; run: () => void }[] }[] = [
    { title: 'Milk', items: [
      { label: 'Record milking, cow by cow', icon: Milk, run: () => go('/milk/record') },
      { label: 'Record herd total only', icon: Milk, run: () => go('/milk/herd') },
      { label: 'Milk sale', icon: CircleDollarSign, run: () => form({ kind: 'tx', type: 'income', category: 'Milk sales' }) },
    ] },
    { title: 'Breeding', items: [
      { label: 'Calving', icon: Baby, run: () => form({ kind: 'calving' }) },
      { label: 'Service / AI', icon: Baby, run: () => form({ kind: 'breeding', type: 'service' }) },
      { label: 'Heat, pregnancy check or dry off', icon: Baby, run: () => form({ kind: 'breeding', type: 'heat' }) },
    ] },
    { title: 'Health', items: [
      { label: 'Sick animal / treatment', icon: HeartPulse, run: () => form({ kind: 'health', healthKind: 'treatment' }) },
      { label: 'Vaccination or deworming', icon: Syringe, run: () => form({ kind: 'health', healthKind: 'vaccination' }) },
      { label: 'Weight', icon: Scale, run: () => form({ kind: 'weight' }) },
    ] },
    { title: 'Feed', items: [
      { label: 'Feed used today', icon: Wheat, run: () => go('/feed?do=use') },
      { label: 'Feed bought', icon: Wheat, run: () => go('/feed?do=in') },
    ] },
    { title: 'Herd & money', items: [
      { label: 'Add animal', icon: Tag, run: () => go('/animals/new') },
      { label: 'Animal sold or died', icon: ShoppingCart, run: () => form({ kind: 'exit' }) },
      { label: 'Expense', icon: Receipt, run: () => form({ kind: 'tx', type: 'expense' }) },
      { label: 'Other income', icon: Wallet, run: () => form({ kind: 'tx', type: 'income', category: 'Other income' }) },
    ] },
  ];
  return (
    <Sheet title="Record" onClose={onClose}>
      <div className="stack">
        {groups.map((g) => (
          <div className="section" key={g.title}>
            <h3 className="muted small">{g.title}</h3>
            <div className="list">
              {g.items.map((it) => (
                <button key={it.label} className="item" onClick={it.run}>
                  <it.icon size={20} aria-hidden /> <span className="main title">{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function TopBar({ farmName }: { farmName: string }) {
  const loc = useLocation();
  const nav = useNavigate();
  const sync = useSyncStatus();
  const deep = loc.pathname.split('/').filter(Boolean).length > 1;
  return (
    <header className="topbar">
      {deep ? <button className="iconbtn back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button> : <span className="rail-hide"><Logo size={28} /></span>}
      <FarmName name={farmName} />
      <NavLink to="/settings#sync" className="sync-pill" title={sync.detail}>
        <span className={`dot ${sync.tone}`} /> {sync.label}
      </NavLink>
    </header>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [recording, setRecording] = useState(false);
  useTheme(settings?.theme);
  useEffect(() => startReminderLoop(), []);
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand"><Logo size={30} /><b>FarmOS</b></div>
        <button className="btn primary record-btn" onClick={() => setRecording(true)}><Plus size={20} /> Record</button>
        {NAV.filter((n) => !(settings?.farm_role === 'worker' && n.to === '/money')).map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={20} aria-hidden />{n.label}</NavLink>)}
        <div className="grow" />
        <p className="tiny muted" style={{ padding: '0 12px' }}>{settings?.manager_name}</p>
      </nav>
      <div>
        <TopBar farmName={settings?.farm_name || ''} />
        <main className="content">{children}</main>
      </div>
      <nav className="bottomnav" aria-label="Main">
        <NavLink to="/" end><Home size={22} aria-hidden />Today</NavLink>
        <NavLink to="/animals"><PawPrint size={22} aria-hidden />Animals</NavLink>
        <button className="record" onClick={() => setRecording(true)} aria-label="Record"><Plus size={28} /><span>Record</span></button>
        <NavLink to="/milk"><Milk size={22} aria-hidden />Milk</NavLink>
        <NavLink to="/more" className={({ isActive }) => (isActive || ['/breeding', '/health', '/feed', '/register', '/money', '/reports', '/compare', '/guide', '/settings'].some((p) => location.hash.startsWith('#' + p)) ? 'active' : '')}><Menu size={22} aria-hidden />More</NavLink>
      </nav>
      {recording && <RecordSheet onClose={() => setRecording(false)} />}
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="panel pad stack-sm">
        <h2>This screen hit a problem</h2>
        <p className="muted">Your records are safe. Go back or reload the app. If it keeps happening, send this to support: <code>{this.state.err.message}</code></p>
        <div className="row"><button className="btn secondary" onClick={() => history.back()}>Go back</button><button className="btn primary" onClick={() => location.reload()}>Reload</button></div>
      </div>
    );
  }
}

function Routed({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <Boundary resetKey={loc.pathname}>{children}</Boundary>;
}

function Gate() {
  const settings = useSettings();
  if (!settings) return null;
  if (!settings.onboarded) return <Onboarding />;
  return (
    <FormHost>
      <Shell>
        <Routed><Routes>
          <Route path="/" element={<Today />} />
          <Route path="/animals" element={<Animals />} />
          <Route path="/animals/new" element={<AnimalForm />} />
          <Route path="/animals/:id" element={<AnimalDetail />} />
          <Route path="/animals/:id/edit" element={<AnimalForm />} />
          <Route path="/milk" element={<MilkPage />} />
          <Route path="/milk/record" element={<MilkRecord />} />
          <Route path="/milk/herd" element={<HerdTotal />} />
          <Route path="/breeding" element={<Breeding />} />
          <Route path="/health" element={<Health />} />
          <Route path="/money" element={<Money />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/register" element={<Register />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/more" element={<More />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Today />} />
        </Routes></Routed>
      </Shell>
    </FormHost>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </HashRouter>
  );
}
