import React, { useState, useEffect } from 'react';
import { getSupabaseCredentials, saveSupabaseConfig, clearSupabaseConfig, testSupabaseConnection, isSupabaseConfigured } from '../../lib/supabase';
import { Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, X, RefreshCw } from 'lucide-react';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [url, setUrl] = useState<string>('');
  const [key, setKey] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const creds = getSupabaseCredentials();
      setUrl(creds.url);
      setKey(creds.key);
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    saveSupabaseConfig(url, key);
    setIsTesting(true);
    const res = await testSupabaseConnection();
    setIsTesting(false);
    setTestResult(res);
  };

  const handleClear = () => {
    clearSupabaseConfig();
    setUrl('');
    setKey('');
    setTestResult(null);
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

  const isConfigured = isSupabaseConfigured();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Supabase Cloud Database Settings</h2>
              <p className="text-xs text-slate-400">Sync simulation sessions, action logs, and patient records to Supabase</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[550px]">
          {/* Status Indicator */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isConfigured
              ? 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${isConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <div>
                <span className="font-bold text-sm">
                  {isConfigured ? 'Supabase Connected' : 'Running in Local/Offline Mode'}
                </span>
                <p className="text-xs text-slate-400">
                  {isConfigured
                    ? 'Case runs and medication actions sync to your Supabase project in real-time.'
                    : 'Simulation runs flawlessly offline with local storage.'}
                </p>
              </div>
            </div>

            <button
              onClick={copySqlSchema}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold flex items-center gap-1.5 border border-slate-700 transition-all"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'SQL Copied!' : 'Copy Schema SQL'}</span>
            </button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 text-xs font-mono">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 uppercase">
                Supabase Project URL
              </label>
              <input
                type="text"
                placeholder="https://xyzproject.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5 uppercase">
                Supabase Anon / Public Key
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Feedback Test Banner */}
          {testResult && (
            <div className={`p-3.5 rounded-xl text-xs font-mono flex items-start gap-2.5 ${
              testResult.success
                ? 'bg-emerald-950/60 border border-emerald-700 text-emerald-300'
                : 'bg-red-950/60 border border-red-700 text-red-300'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Setup Instructions */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
            <span className="font-bold text-slate-300 uppercase font-mono block">
              Quick 2-Minute Setup:
            </span>
            <ol className="list-decimal list-inside text-slate-400 space-y-1">
              <li>Log in to <span className="text-emerald-400">supabase.com</span> and create a new project.</li>
              <li>Go to the <span className="text-slate-300 font-semibold">SQL Editor</span> and click "Copy Schema SQL" above, then paste and click Run.</li>
              <li>Go to <span className="text-slate-300 font-semibold">Project Settings &gt; API</span> to copy your Project URL and anon public key.</li>
              <li>Paste them here and click "Save & Test Connection".</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-400 text-xs font-mono font-semibold transition-colors"
          >
            Clear / Disconnect
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isTesting}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Save &amp; Test Connection</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
