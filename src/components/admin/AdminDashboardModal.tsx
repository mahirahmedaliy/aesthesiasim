import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users,
  Award,
  CreditCard,
  Key,
  X,
  CheckCircle2,
  Lock,
  Unlock,
  DollarSign,
  Copy,
  ExternalLink,
  Save,
  Search,
  RefreshCw,
  Sparkles,
  Database,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  UserAccount,
  getAllUsersList,
  toggleUserProStatus,
  getWhopConfig,
  saveWhopConfig,
  fetchWhopConfigFromSupabase,
  WhopConfig,
  verifyAdminPasscode,
  saveAdminPasscode,
} from '../../lib/authService';
import {
  getSupabaseCredentials,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
  isSupabaseConfigured,
} from '../../lib/supabase';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  onRefreshData?: () => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRefreshData,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'whop' | 'database' | 'security'>('users');

  // Users Directory State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Whop Config State
  const [whopConfig, setWhopConfigState] = useState<WhopConfig>(getWhopConfig());
  const [copiedLink, setCopiedLink] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);

  // Supabase Database Config State
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseKey, setSupabaseKey] = useState<string>('');
  const [isTestingSupabase, setIsTestingSupabase] = useState<boolean>(false);
  const [supabaseTestResult, setSupabaseTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Admin Security / Passcode State
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinSuccessNotice, setPinSuccessNotice] = useState('');
  const [pinErrorNotice, setPinErrorNotice] = useState('');

  useEffect(() => {
    if (currentUser?.role === 'admin' || currentUser?.email?.toLowerCase().includes('admin')) {
      setIsAuthenticated(true);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadData();
      const creds = getSupabaseCredentials();
      setSupabaseUrl(creds.url);
      setSupabaseKey(creds.key);
      setSupabaseTestResult(null);
    }
  }, [isOpen, isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    const list = await getAllUsersList();
    setUsers(list);
    const remoteWhop = await fetchWhopConfigFromSupabase();
    setWhopConfigState(remoteWhop || getWhopConfig());
    setLoading(false);
  };

  if (!isOpen) return null;

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = await verifyAdminPasscode(passcode);
    if (isValid) {
      setIsAuthenticated(true);
      setPasscodeError(false);
      loadData();
      const creds = getSupabaseCredentials();
      setSupabaseUrl(creds.url);
      setSupabaseKey(creds.key);
    } else {
      setPasscodeError(true);
    }
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinErrorNotice('');
    setPinSuccessNotice('');

    const isCurrentValid = await verifyAdminPasscode(currentPinInput);
    if (!isCurrentValid) {
      setPinErrorNotice('Current passcode entered is incorrect.');
      return;
    }

    if (!newPinInput || newPinInput.trim().length < 4) {
      setPinErrorNotice('New passcode must be at least 4 characters long.');
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setPinErrorNotice('New passcode and confirmation do not match.');
      return;
    }

    const ok = await saveAdminPasscode(newPinInput);
    if (ok) {
      setPinSuccessNotice('Admin passcode successfully updated! Use your new passcode for future logins.');
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
    } else {
      setPinErrorNotice('Failed to update passcode.');
    }
  };

  const handleTogglePro = async (userId: string, currentStatus: boolean) => {
    const success = await toggleUserProStatus(userId, !currentStatus);
    if (success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isPro: !currentStatus } : u))
      );
      if (onRefreshData) onRefreshData();
    }
  };

  const handleSaveWhopConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveWhopConfig(whopConfig);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2000);
  };

  const whopRedirectUrl = `${window.location.origin}/?pro_token=${whopConfig.secretActivationTokens[0] || 'WHOP-PRO-2026'}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whopRedirectUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setIsTestingSupabase(true);
    const res = await testSupabaseConnection();
    setIsTestingSupabase(false);
    setSupabaseTestResult(res);
    if (onRefreshData) onRefreshData();
    loadData();
  };

  const handleClearSupabase = () => {
    clearSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseKey('');
    setSupabaseTestResult(null);
    if (onRefreshData) onRefreshData();
  };

  const copySqlSchema = () => {
    const sql = `-- Run in Supabase SQL Editor
create extension if not exists "uuid-ossp";

-- User Profiles (Accounts & Pro subscriptions)
create table if not exists public.profiles (
  id text primary key,
  email text not null,
  name text,
  role text default 'user',
  is_pro boolean default false,
  pro_token text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Case Completions & Performance Audit
create table if not exists public.case_completions (
  id uuid primary key default uuid_generate_v4(),
  user_id text,
  user_email text,
  case_id text not null,
  patient_name text not null,
  score numeric not null,
  grade text not null,
  completed boolean default true,
  elapsed_seconds integer default 0,
  mistakes_count integer default 0,
  mistakes_data jsonb default '[]'::jsonb,
  action_logs jsonb default '[]'::jsonb,
  vitals_history jsonb default '[]'::jsonb,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.patients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  age integer not null,
  gender text not null,
  weight_kg numeric not null,
  height_cm numeric not null,
  bmi numeric not null,
  asa_class text not null,
  surgical_procedure text not null,
  allergies text[] default '{}',
  medical_history text not null,
  baseline_vitals jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.case_sessions (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references public.patients(id) on delete set null,
  user_email text,
  status text not null default 'completed',
  elapsed_seconds integer default 0,
  final_score integer default 0,
  final_vitals jsonb,
  debrief_summary jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.action_logs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.case_sessions(id) on delete cascade,
  timestamp_seconds integer not null,
  action_type text not null,
  title text not null,
  detail text not null,
  impact text default 'neutral',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;
alter table public.case_completions enable row level security;
alter table public.patients enable row level security;
alter table public.case_sessions enable row level security;
alter table public.action_logs enable row level security;

create policy "Allow all to profiles" on public.profiles for all using (true) with check (true);
create policy "Allow all to case_completions" on public.case_completions for all using (true) with check (true);
create policy "Allow public read to patients" on public.patients for select using (true);
create policy "Allow public all to sessions" on public.case_sessions for all using (true) with check (true);
create policy "Allow public all to action_logs" on public.action_logs for all using (true) with check (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const isDbOnline = isSupabaseConfigured();
  const proCount = users.filter((u) => u.isPro).length;
  const basicCount = users.filter((u) => !u.isPro).length;
  const totalRevenue = proCount * whopConfig.priceUsd;

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200 select-none font-sans"
    >
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-5xl h-[92vh] max-h-[820px] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Owner &amp; Admin Management Portal</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  CONFIDENTIAL
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Manage accounts, Whop payment links, and cloud database synchronization
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master PIN Gate if not admin */}
        {!isAuthenticated ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <Lock className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Administrator Access Required</h3>
              <p className="text-xs text-slate-400">
                Please enter your administrator passcode or sign in with an authorized admin account.
              </p>
            </div>

            <form onSubmit={handleAdminAuth} className="w-full space-y-3">
              <input
                type="password"
                placeholder="Enter Admin Master Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono text-white tracking-widest placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />

              {passcodeError && (
                <p className="text-xs text-rose-400 font-mono">Incorrect admin passcode. Please check your credentials.</p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <span>Unlock Admin Portal</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Top Metric Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">Total Accounts</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-black font-mono text-white">{users.length}</span>
                  <Users className="w-4 h-4 text-sky-400" />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-amber-800/40">
                <span className="text-[10px] font-mono text-amber-400 uppercase block">Pro Users ($24.29)</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-black font-mono text-amber-400">{proCount}</span>
                  <Award className="w-4 h-4 text-amber-400" />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">Basic Users</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-black font-mono text-slate-300">{basicCount}</span>
                  <span className="text-[11px] font-mono text-slate-500">Tier 1</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-800/40">
                <span className="text-[10px] font-mono text-emerald-400 uppercase block">Gross Revenue</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-black font-mono text-emerald-400">${totalRevenue.toFixed(2)}</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Admin Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Registered Users ({users.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('whop')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'whop'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Whop Gateway ($24.29)</span>
              </button>

              <button
                onClick={() => setActiveTab('database')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'database'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Supabase Database ({isDbOnline ? 'Connected' : 'Offline'})</span>
              </button>

              <button
                onClick={() => setActiveTab('security')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'security'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Admin Passcode</span>
              </button>
            </div>

            {/* TAB 1: USER ACCOUNTS DIRECTORY */}
            {activeTab === 'users' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    <h3 className="font-bold text-white text-sm">User Directory &amp; Membership Overrides</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <button
                      onClick={loadData}
                      className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Refresh user list from Supabase"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400 font-bold">
                      <tr>
                        <th className="py-2.5 px-4">User / Email</th>
                        <th className="py-2.5 px-4">Role</th>
                        <th className="py-2.5 px-4">Current Plan</th>
                        <th className="py-2.5 px-4">Registered Date</th>
                        <th className="py-2.5 px-4 text-right">Action: Override Plan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            No users found matching query.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-2.5 px-4">
                              <span className="font-bold text-white block">{u.name}</span>
                              <span className="text-[11px] text-slate-400">{u.email}</span>
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  u.role === 'admin'
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              {u.isPro ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1 w-fit">
                                  <Sparkles className="w-3 h-3" />
                                  <span>PRO ($24.29)</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 w-fit block">
                                  BASIC (FREE)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                onClick={() => handleTogglePro(u.id, u.isPro)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                  u.isPro
                                    ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800'
                                    : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                                }`}
                              >
                                {u.isPro ? 'Revoke Pro' : 'Grant Pro Access'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: WHOP GATEWAY CONFIGURATION */}
            {activeTab === 'whop' && (
              <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-white text-sm">Whop Payment Gateway &amp; Redirect Setup</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300">$24.29 USD Tier</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Configure your Whop checkout link below. After users complete the payment on Whop, Whop will redirect them to your customized URL with the token, automatically upgrading them to Pro.
                </p>

                <form onSubmit={handleSaveWhopConfig} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="col-span-12 md:col-span-8">
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Your Whop Checkout Link:</label>
                    <input
                      type="url"
                      value={whopConfig.checkoutUrl}
                      onChange={(e) => setWhopConfigState({ ...whopConfig, checkoutUrl: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      placeholder="https://whop.com/checkout/..."
                    />
                  </div>

                  <div className="col-span-6 md:col-span-2">
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Price (USD):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={whopConfig.priceUsd}
                      onChange={(e) => setWhopConfigState({ ...whopConfig, priceUsd: parseFloat(e.target.value) || 24.29 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="col-span-6 md:col-span-2">
                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saveNotice ? 'Saved!' : 'Save Config'}</span>
                    </button>
                  </div>
                </form>

                {/* Ready-to-Copy Whop Success Redirect Link */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-slate-300">
                      🔗 Whop Post-Checkout Success Redirect URL (Copy into Whop dashboard):
                    </span>
                    <button
                      onClick={copyToClipboard}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer border border-slate-700"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedLink ? 'Copied to Clipboard!' : 'Copy Link'}</span>
                    </button>
                  </div>
                  <div className="p-2 rounded bg-slate-950 font-mono text-xs text-amber-300 truncate border border-slate-800 select-all">
                    {whopRedirectUrl}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">
                    When Whop redirects paying customers to this URL, Aesthesiasim automatically validates the token and activates their Pro status instantly.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: SUPABASE CLOUD DATABASE SETTINGS */}
            {activeTab === 'database' && (
              <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-white text-sm">Supabase Cloud Database Settings (Admin Only)</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isDbOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {isDbOnline ? 'Cloud Sync Active' : 'Running Offline'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Connect your Supabase project to sync registered users, Pro status, simulation scores, and mistakes in real-time. This setting is strictly private to the site administrator.
                </p>

                {/* Test Feedback Notice */}
                {supabaseTestResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs font-mono ${
                      supabaseTestResult.success
                        ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
                        : 'bg-rose-950/60 border-rose-700 text-rose-200'
                    }`}
                  >
                    {supabaseTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{supabaseTestResult.message}</span>
                  </div>
                )}

                <form onSubmit={handleSaveSupabase} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Supabase Project URL:</label>
                    <input
                      type="url"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://your-project-id.supabase.co"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Supabase Anon Public API Key:</label>
                    <input
                      type="password"
                      value={supabaseKey}
                      onChange={(e) => setSupabaseKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isTestingSupabase}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isTestingSupabase ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Testing Connection...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Save &amp; Test Connection</span>
                          </>
                        )}
                      </button>

                      {supabaseUrl && (
                        <button
                          type="button"
                          onClick={handleClearSupabase}
                          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear Credentials</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={copySqlSchema}
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSql ? 'SQL Schema Copied!' : 'Copy Database SQL'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 4: ADMIN SECURITY & PASSCODE */}
            {activeTab === 'security' && (
              <div className="p-5 rounded-2xl bg-slate-950 border border-purple-500/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-purple-400" />
                    <h3 className="font-bold text-white text-sm">Change Admin Master Passcode</h3>
                  </div>
                  <span className="text-xs font-mono text-purple-300 font-bold">Access Security</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Update the master passcode required to unlock the Admin Portal and access administrative tools.
                </p>

                {pinSuccessNotice && (
                  <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs font-mono flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{pinSuccessNotice}</span>
                  </div>
                )}

                {pinErrorNotice && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs font-mono flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{pinErrorNotice}</span>
                  </div>
                )}

                <form onSubmit={handleChangePasscode} className="space-y-3 max-w-lg">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Current Passcode:</label>
                    <input
                      type="password"
                      value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value)}
                      placeholder="Enter current master passcode"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">New Passcode (min 4 characters):</label>
                    <input
                      type="password"
                      value={newPinInput}
                      onChange={(e) => setNewPinInput(e.target.value)}
                      placeholder="Enter new master passcode"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Confirm New Passcode:</label>
                    <input
                      type="password"
                      value={confirmPinInput}
                      onChange={(e) => setConfirmPinInput(e.target.value)}
                      placeholder="Re-enter new master passcode"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Update Master Passcode</span>
                    </button>
                  </div>
                </form>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1 mt-4">
                  <div className="font-bold text-slate-300">💡 Environment Variable Option (.env):</div>
                  <p>
                    You can also set <code className="text-amber-300 font-bold">VITE_ADMIN_PASSCODE=YourCustomPassword</code> in your <code className="text-amber-300">.env</code> file. Environment variables take highest precedence across all browsers.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
