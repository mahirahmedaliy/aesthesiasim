import { createClient, SupabaseClient } from '@supabase/supabase-js';


const STORAGE_KEY_URL = 'anesthesia_sim_supabase_url';
const STORAGE_KEY_KEY = 'anesthesia_sim_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseCredentials(): { url: string; key: string } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '';
  const storedKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) || '' : '';

  return {
    url: storedUrl || envUrl,
    key: storedKey || envKey,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseCredentials();
  return Boolean(url && key && url.startsWith('http') && key.length > 10);
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key) return null;

  if (cachedClient) return cachedClient;

  try {
    cachedClient = createClient(url, key);
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function saveSupabaseConfig(url: string, key: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
    localStorage.setItem(STORAGE_KEY_KEY, key.trim());
    cachedClient = null; // reset cached instance
  }
}

export function clearSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_KEY);
    cachedClient = null;
  }
}

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Missing Supabase URL or Anon Key.' };
  }

  try {
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      const { error: patientErr } = await client.from('patients').select('id').limit(1);
      if (patientErr && patientErr.code !== 'PGRST116') {
        return { success: false, message: `Connected to Supabase, but query error: ${error.message}. (Did you run the schema migration?)` };
      }
    }
    return { success: true, message: 'Successfully connected to Supabase database!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to reach Supabase endpoint.' };
  }
}

export async function logSessionToSupabase(sessionRecord: {
  patient_id?: string;
  scenario_id?: string;
  elapsed_seconds: number;
  final_score: number;
  final_vitals: any;
  debrief_summary: any;
  status: string;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('case_sessions').insert([{
      ...sessionRecord,
      created_at: new Date().toISOString()
    }]);

    if (error) {
      console.warn('Supabase session log failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase sync error:', e);
    return false;
  }
}
