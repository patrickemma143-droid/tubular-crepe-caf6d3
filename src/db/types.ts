// Every synced record carries these fields.
export interface Base {
  id: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp, set on every local change
  deleted: 0 | 1; // soft delete so deletions sync to other phones
  dirty: 0 | 1; // 1 = changed locally, not yet uploaded
  demo?: boolean; // part of the sample farm
}

export type Sex = 'F' | 'M';
export type AnimalStatus = 'active' | 'sold' | 'dead' | 'culled';

export interface Animal extends Base {
  tag: string;
  name?: string;
  sex: Sex;
  breed?: string;
  dob?: string; // YYYY-MM-DD
  source: 'born' | 'purchased';
  acquired_on?: string;
  purchase_price?: number;
  dam_id?: string; // mother (animal id)
  sire?: string; // bull name / semen code
  status: AnimalStatus;
  exit_date?: string;
  exit_reason?: string;
  sale_price?: number;
  buyer?: string;
  notes?: string;
  // Ranch tracking
  provisional?: boolean; // temporary ID until the animal is ear-tagged
  dob_estimated?: boolean; // birth date estimated (from ledger history or teeth)
  calved_before?: boolean; // known to have calved before records began
  castrated?: boolean;
  breeding_bull?: boolean; // kept for breeding (vs young bull / for sale)
  group?: string; // herd group or paddock
  feeding?: Feeding; // overrides the farm default
}

export type Feeding = 'grazing' | 'grazing_supplement' | 'zero_grazing';
export const FEEDING_LABEL: Record<Feeding, string> = {
  grazing: 'Grazing only',
  grazing_supplement: 'Grazing + supplements',
  zero_grazing: 'Zero-grazing with concentrates',
};

export type Session = 'AM' | 'PM';

export interface MilkLog extends Base {
  animal_id: string;
  date: string; // YYYY-MM-DD (local farm date)
  session: Session;
  litres: number;
  method: 'measured' | 'estimated';
  notes?: string;
}

export type BreedingType = 'heat' | 'service' | 'preg_check' | 'calving' | 'dry_off' | 'abortion';

export interface BreedingEvent extends Base {
  animal_id: string;
  date: string;
  type: BreedingType;
  method?: 'AI' | 'natural'; // for service
  sire?: string; // bull or semen code
  technician?: string;
  result?: 'pregnant' | 'open'; // for preg_check
  calf_ids?: string[]; // for calving
  calving_ease?: 'normal' | 'assisted' | 'difficult';
  cost?: number;
  notes?: string;
}

export type HealthKind = 'treatment' | 'vaccination' | 'deworming' | 'tick_control' | 'checkup';

export interface HealthRecord extends Base {
  animal_id: string; // '' for whole-herd vaccinations is not allowed; one record per animal
  date: string;
  kind: HealthKind;
  condition: string; // diagnosis or vaccine/product name
  medicine?: string;
  dose?: string;
  vet?: string;
  cost?: number;
  status: 'open' | 'recovered' | 'chronic' | 'done';
  resolved_on?: string;
  milk_withdrawal_until?: string; // do not sell this cow's milk until
  next_due?: string; // next vaccination / deworming / follow-up
  notes?: string;
}

export interface WeightRecord extends Base {
  animal_id: string;
  date: string;
  kg: number;
}

export type TxType = 'income' | 'expense';

export interface Transaction extends Base {
  date: string;
  type: TxType;
  category: string;
  amount: number;
  litres?: number; // milk sales
  price_per_litre?: number;
  party?: string; // buyer / supplier
  payment?: string;
  animal_id?: string; // animal sale / purchase
  health_id?: string; // auto-created from a health record cost
  breeding_id?: string; // auto-created from AI service cost
  feed_move_id?: string; // auto-created from a feed purchase
  notes?: string;
}

export interface Feed extends Base {
  name: string; // e.g. Dairy meal
  unit: string; // kg, bag, bale, litre
  low_level?: number; // warn when stock falls to this
  daily_ration?: number; // usual amount used per day (pre-fills daily entry)
  notes?: string;
  archived?: boolean;
}

export interface FeedMove extends Base {
  feed_id: string;
  date: string;
  type: 'in' | 'out' | 'count'; // bought/received, used, stock count
  qty: number;
  cost?: number; // total paid (for 'in')
  supplier?: string;
  notes?: string;
}

/** One class of animal for one month in the herd register (ranch stock ledger). */
export interface StockMonth extends Base {
  month: string; // YYYY-MM
  cls: string; // Cows, Heifers, Breeding bulls, Castrates, Young bulls for breeding, Bull calves, Female calves
  opening: number; // brought forward
  births: number;
  grade_in: number; // moved in from another class (e.g. heifer → cow)
  purchased: number;
  deaths: number;
  grade_out: number;
  sold: number;
  closing: number;
  unit_value?: number; // value per head at close
  remarks?: string;
  flags?: string[]; // problems found when the figures were imported
  source?: string;
}

export const STOCK_CLASSES = ['Cows', 'Heifers', 'Breeding bulls', 'Castrates', 'Young bulls for breeding', 'Bull calves', 'Female calves'];

export interface Reminder {
  id: string;
  label: string;
  time: string; // HH:MM
  enabled: boolean;
}

export interface Settings {
  id: 'settings';
  onboarded: boolean;
  farm_name: string;
  manager_name: string;
  currency: string;
  milk_price: number;
  theme: 'system' | 'light' | 'dark';
  reminders: Reminder[];
  supabase_url?: string;
  supabase_key?: string;
  supabase_custom?: boolean; // true = this phone uses its own project instead of the built-in FarmOS cloud
  farm_id?: string;
  farm_role?: 'owner' | 'manager' | 'worker';
  user_email?: string;
  last_pull?: string;
  last_sync_at?: string;
  default_breed?: string;
  default_feeding?: Feeding;
  sale_weight_kg?: number; // target live weight for selling bulls/castrates
}

export const TABLES = ['animals', 'milk', 'breeding', 'health', 'weights', 'transactions', 'feeds', 'feed_moves', 'stock'] as const;
export type TableName = (typeof TABLES)[number];

export const INCOME_CATEGORIES = ['Milk sales', 'Animal sales', 'Manure sales', 'Other income'];
export const EXPENSE_CATEGORIES = [
  'Feed & supplements',
  'Veterinary & drugs',
  'Breeding / AI',
  'Labour',
  'Animal purchase',
  'Equipment & repairs',
  'Buildings & materials',
  'Garden & crops',
  'Staff welfare',
  'Transport',
  'Utilities',
  'Other',
];
