-- ========================================================
-- Supabase Complete Schema for Aesthesiasim OR Simulator
-- ========================================================
-- Run this script in your Supabase SQL Editor:
-- Supabase Dashboard -> SQL Editor -> New query -> Paste & Run

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. User Profiles Table (Accounts, Admin Roles, Pro Subscriptions)
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

-- 3. Case Completions & Performance Audit (Scores, Mistakes, Logs)
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

-- 4. Patients Table
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
  airway_exam jsonb not null default '{}'::jsonb,
  baseline_vitals jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Case Sessions (Live Run Audits)
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

-- 6. Action Logs
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

-- 7. App Settings Table (Global Whop Link, Price, etc.)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.case_completions enable row level security;
alter table public.patients enable row level security;
alter table public.case_sessions enable row level security;
alter table public.action_logs enable row level security;
alter table public.app_settings enable row level security;

-- 9. Policies for Application Access
create policy "Allow all access to profiles" on public.profiles for all using (true) with check (true);
create policy "Allow all access to case_completions" on public.case_completions for all using (true) with check (true);
create policy "Allow public read to patients" on public.patients for select using (true);
create policy "Allow public all to sessions" on public.case_sessions for all using (true) with check (true);
create policy "Allow public all to action_logs" on public.action_logs for all using (true) with check (true);
create policy "Allow public read to app_settings" on public.app_settings for select using (true);
create policy "Allow all to app_settings" on public.app_settings for all using (true) with check (true);
