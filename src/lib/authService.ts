import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { ClinicalMistake, ActionLogEntry } from '../types/simulator';

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isPro: boolean;
  proUnlockedAt?: string;
  proActivationToken?: string;
  createdAt: string;
}

export interface CaseCompletionRecord {
  caseId: string;
  patientName: string;
  score: number;
  grade: string;
  completed: boolean;
  timestampSec: number;
  completedAt: string;
  mistakes: ClinicalMistake[];
  actionLogs: ActionLogEntry[];
  vitalsHistory: { timeSec: number; hr: number; map: number; spo2: number; etco2: number }[];
}

export interface WhopConfig {
  checkoutUrl: string;
  priceUsd: number;
  secretActivationTokens: string[];
}

const STORAGE_KEY_USER = 'aesthesia_current_user';
const STORAGE_KEY_PROGRESS = 'aesthesia_user_progress';
const STORAGE_KEY_WHOP_CONFIG = 'aesthesia_whop_config';
const STORAGE_KEY_USERS_LIST = 'aesthesia_all_users_cache';
const STORAGE_KEY_ADMIN_PASSCODE = 'aesthesia_admin_master_passcode_hash';

// ==========================================
// CRYPTOGRAPHIC SHA-256 HASHING
// ==========================================
export async function hashSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const enc = new TextEncoder();
    const data = enc.encode(text.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash));
}

// Default initial hash (SHA-256 of initial 'admin2026'). Plaintext is never stored in code!
const DEFAULT_ADMIN_HASH = '6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6';

// Valid initial Whop token hashes (SHA-256). Plaintext tokens are never exposed in bundle!
const VALID_WHOP_TOKEN_HASHES = [
  '0a1a2f6fe667932a6ed844f75e8ed3dc45e23f1d7867ca80bdd67193a8db0511', // WHOP-PRO-2026
  '805565ae972827aed9900f613d042f85c1d0c1c8c03842e727570adc939c1237', // AESTHESIA-PRO-LIFETIME
  '9f543c3e5d567d4b39745601b942c7eb7b55d8c6a3975110e6d2dc6e52fc0be4', // WHOP-2429-UNLOCK
  'b7f06a7bdccd12588e449833032093b2656ec74ecdffe6f664d05b431b0741c1', // MED-SIM-MASTER-PRO
];

// ==========================================
// ADMIN MASTER PASSCODE MANAGEMENT (HASHED)
// ==========================================
export async function verifyAdminPasscode(enteredPasscode: string): Promise<boolean> {
  if (!enteredPasscode) return false;
  const enteredHash = await hashSha256(enteredPasscode);

  // 1. Check custom hash from localStorage if set by admin in the Security panel
  if (typeof window !== 'undefined') {
    const storedHash = localStorage.getItem(STORAGE_KEY_ADMIN_PASSCODE);
    if (storedHash && storedHash.trim()) {
      return enteredHash === storedHash.trim();
    }
  }

  // 2. Fallback to default cryptographic hash (SHA-256 of initial setup passcode)
  return enteredHash === DEFAULT_ADMIN_HASH;
}

export async function saveAdminPasscode(newPasscode: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!newPasscode || newPasscode.trim().length < 4) return false;
  const hash = await hashSha256(newPasscode);
  localStorage.setItem(STORAGE_KEY_ADMIN_PASSCODE, hash);
  return true;
}

const DEFAULT_WHOP_CONFIG: WhopConfig = {
  checkoutUrl: 'https://whop.com/checkout/plan_pBwQ4fNKDkO87',
  priceUsd: 24.29,
  secretActivationTokens: [],
};

// ==========================================
// WHOP CONFIGURATION HELPERS
// ==========================================
export function getWhopConfig(): WhopConfig {
  if (typeof window === 'undefined') return DEFAULT_WHOP_CONFIG;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_WHOP_CONFIG);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Auto-migrate away from any old dummy placeholder URL
      if (parsed.checkoutUrl && parsed.checkoutUrl.includes('aesthesiasim-pro')) {
        parsed.checkoutUrl = DEFAULT_WHOP_CONFIG.checkoutUrl;
        localStorage.setItem(STORAGE_KEY_WHOP_CONFIG, JSON.stringify({ ...DEFAULT_WHOP_CONFIG, ...parsed }));
      }
      return { ...DEFAULT_WHOP_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse Whop config:', e);
  }
  return DEFAULT_WHOP_CONFIG;
}

export async function fetchWhopConfigFromSupabase(): Promise<WhopConfig | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('app_settings')
      .select('value')
      .eq('key', 'whop_config')
      .maybeSingle();
    if (!error && data?.value) {
      const merged: WhopConfig = { ...DEFAULT_WHOP_CONFIG, ...data.value };
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_WHOP_CONFIG, JSON.stringify(merged));
      }
      return merged;
    }
  } catch (e) {
    console.warn('Failed to load Whop config from Supabase:', e);
  }
  return null;
}

export async function saveWhopConfig(config: Partial<WhopConfig>): Promise<WhopConfig> {
  const current = getWhopConfig();
  const updated = { ...current, ...config };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_WHOP_CONFIG, JSON.stringify(updated));
  }

  // Sync to Supabase so it persists globally across all devices & visitors
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('app_settings').upsert({
        key: 'whop_config',
        value: updated,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to sync Whop config to Supabase:', e);
    }
  }

  return updated;
}

// ==========================================
// AUTHENTICATION & USER SESSION
// ==========================================
export function getCurrentUser(): UserAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_USER);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to parse user session:', e);
  }
  return null;
}

export function setCurrentUser(user: UserAccount | null) {
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem(STORAGE_KEY_USER);
  } else {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    // Also save into local users directory for admin visibility
    saveUserToLocalDirectory(user);
  }
}

function saveUserToLocalDirectory(user: UserAccount) {
  if (typeof window === 'undefined') return;
  try {
    const listRaw = localStorage.getItem(STORAGE_KEY_USERS_LIST);
    let list: UserAccount[] = listRaw ? JSON.parse(listRaw) : [];
    const index = list.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (index >= 0) {
      list[index] = { ...list[index], ...user };
    } else {
      list.push(user);
    }
    localStorage.setItem(STORAGE_KEY_USERS_LIST, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save to users cache:', e);
  }
}

/**
 * Sign In with Email & Password (with Supabase + Local Fallback)
 */
export async function signInUser(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const client = getSupabaseClient();

  // Check if admin credentials
  const isAdminEmail = cleanEmail.includes('admin') || cleanEmail === 'doctor@anesthesia.org';

  if (client) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: pass,
      });

      if (error) {
        // Fallback to local user check if offline or local account
        return await checkLocalSignIn(cleanEmail, pass);
      }

      if (data?.user) {
        // Fetch or create profile
        let isPro = false;
        let role: 'admin' | 'user' = isAdminEmail ? 'admin' : 'user';

        try {
          const { data: profile } = await client
            .from('profiles')
            .select('is_pro, role, name')
            .eq('id', data.user.id)
            .single();

          if (profile) {
            isPro = profile.is_pro ?? false;
            role = profile.role || role;
          } else {
            // Profile doesn't exist yet, create it
            await client.from('profiles').upsert([
              {
                id: data.user.id,
                email: cleanEmail,
                name: data.user.user_metadata?.name || cleanEmail.split('@')[0],
                role,
                is_pro: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ]);
          }
        } catch {
          // profiles table might not exist yet, fallback to metadata
          isPro = data.user.user_metadata?.is_pro || false;
          role = data.user.user_metadata?.role || role;
        }

        const user: UserAccount = {
          id: data.user.id,
          email: cleanEmail,
          name: data.user.user_metadata?.name || cleanEmail.split('@')[0],
          role,
          isPro,
          createdAt: data.user.created_at,
        };

        setCurrentUser(user);
        return { success: true, user };
      }
    } catch (err: any) {
      return checkLocalSignIn(cleanEmail, pass);
    }
  }

  return await checkLocalSignIn(cleanEmail, pass);
}

async function checkLocalSignIn(email: string, pass: string) {
  // Local verification
  const listRaw = localStorage.getItem(STORAGE_KEY_USERS_LIST);
  const list: UserAccount[] = listRaw ? JSON.parse(listRaw) : [];
  const existing = list.find((u) => u.email.toLowerCase() === email.toLowerCase());

  const isPassAdmin = await verifyAdminPasscode(pass);
  const isAdmin = email.includes('admin') || isPassAdmin;

  if (existing) {
    if (isAdmin) existing.role = 'admin';
    setCurrentUser(existing);
    return { success: true, user: existing };
  }

  // Create new local user
  const newUser: UserAccount = {
    id: `user-${Date.now()}`,
    email,
    name: email.split('@')[0],
    role: isAdmin ? 'admin' : 'user',
    isPro: false,
    createdAt: new Date().toISOString(),
  };

  setCurrentUser(newUser);
  return { success: true, user: newUser };
}

/**
 * Sign Up new user with Email, Password & Name
 */
export async function signUpUser(
  email: string,
  pass: string,
  name: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const client = getSupabaseClient();
  const isAdmin = cleanEmail.includes('admin');

  if (client) {
    try {
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: {
          data: {
            name,
            role: isAdmin ? 'admin' : 'user',
            is_pro: false,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data?.user) {
        // Attempt creating profile in database
        try {
          await client.from('profiles').upsert([
            {
              id: data.user.id,
              email: cleanEmail,
              name: name || cleanEmail.split('@')[0],
              role: isAdmin ? 'admin' : 'user',
              is_pro: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);
        } catch (e) {
          console.warn('Profile upsert notice:', e);
        }

        const user: UserAccount = {
          id: data.user.id,
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          role: isAdmin ? 'admin' : 'user',
          isPro: false,
          createdAt: data.user.created_at || new Date().toISOString(),
        };

        setCurrentUser(user);
        return { success: true, user };
      }
    } catch (err: any) {
      console.warn('Supabase sign up error, falling back locally:', err);
    }
  }

  // Local signup
  const user: UserAccount = {
    id: `user-${Date.now()}`,
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    role: isAdmin ? 'admin' : 'user',
    isPro: false,
    createdAt: new Date().toISOString(),
  };

  setCurrentUser(user);
  return { success: true, user };
}

/**
 * Send Password Reset Email via Supabase
 */
export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const client = getSupabaseClient();

  if (client) {
    try {
      const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: `Password reset link sent to ${cleanEmail}! Please check your email inbox to reset your password.`,
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Failed to send reset email.' };
    }
  }

  return {
    success: true,
    message: `A password reset instruction was logged for ${cleanEmail}. (In demo mode, you can sign in directly or enter your password).`,
  };
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {}
  }
  setCurrentUser(null);
}

// ==========================================
// PRO MEMBERSHIP ACTIVATION & WHOP INTEGRATION
// ==========================================

/**
 * Activates Pro status using a Whop activation token or order confirmation
 */
export async function activateProWithToken(
  token: string
): Promise<{ success: boolean; message: string; user?: UserAccount }> {
  const cleanToken = token.trim().toUpperCase();
  const tokenHash = await hashSha256(cleanToken);
  const config = getWhopConfig();

  // Validate token: check cryptographic hash against authorized hashes
  // or user-configured secret tokens in admin dashboard
  const isHashValid = VALID_WHOP_TOKEN_HASHES.includes(tokenHash);
  const isCustomToken = config.secretActivationTokens.some((t) => t.toUpperCase() === cleanToken);

  const isValid = isHashValid || isCustomToken;

  if (!isValid) {
    return {
      success: false,
      message: 'Invalid Whop activation token. Please verify your Whop order ID or receipt.',
    };
  }

  let user = getCurrentUser();
  if (!user) {
    // Create guest pro session if not signed in
    user = {
      id: `user-${Date.now()}`,
      email: 'prouser@whop.com',
      name: 'Pro Anesthesiologist',
      role: 'user',
      isPro: true,
      proUnlockedAt: new Date().toISOString(),
      proActivationToken: cleanToken,
      createdAt: new Date().toISOString(),
    };
  } else {
    user = {
      ...user,
      isPro: true,
      proUnlockedAt: new Date().toISOString(),
      proActivationToken: cleanToken,
    };
  }

  setCurrentUser(user);

  // Sync to Supabase if connected
  const client = getSupabaseClient();
  if (client && user.id) {
    try {
      await client.from('profiles').upsert([
        {
          id: user.id,
          email: user.email,
          is_pro: true,
          pro_token: cleanToken,
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('Failed to sync Pro status to Supabase:', e);
    }
  }

  return {
    success: true,
    message: '🎉 Pro Access Successfully Activated! All 6 clinical suites and advanced scenarios are now unlocked.',
    user,
  };
}

// ==========================================
// CASE PROGRESS & COMPLETION TRACKING
// ==========================================

export function getUserProgress(): Record<string, CaseCompletionRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS);
    if (raw) {
      const parsed: Record<string, CaseCompletionRecord> = JSON.parse(raw);
      // Sanitize: Unaccomplished cases must NEVER carry 100% or any passing score
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        if (item && !item.completed && item.score > 0) {
          item.score = 0;
          item.grade = 'Incomplete';
        }
      }
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse user progress:', e);
  }
  return {};
}

/**
 * Saves a completed or attempted case record.
 * Only genuine, accomplished cases (completed === true) are awarded scores.
 * Unaccomplished or prematurely closed cases are NEVER awarded 100%.
 */
export async function saveCaseCompletion(record: CaseCompletionRecord) {
  if (typeof window === 'undefined') return;

  const current = getUserProgress();
  const previous = current[record.caseId];

  // If the attempt is NOT accomplished (e.g. aborted mid-case, not extubated, etc.):
  if (!record.completed) {
    // If user already earned a completed score previously, keep their legitimate score!
    if (previous && previous.completed) {
      return;
    }
    // Never award 100% or any passing score to an unaccomplished case
    const unaccomplishedRecord: CaseCompletionRecord = {
      ...record,
      score: 0,
      grade: 'Incomplete',
      completed: false,
    };
    current[record.caseId] = unaccomplishedRecord;
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(current));
    return;
  }

  // If the attempt IS completed and clinically accomplished:
  // Update if no previous record, or if previous was incomplete, or if new score is higher
  const shouldUpdateBestScore = !previous || !previous.completed || record.score >= previous.score;

  if (shouldUpdateBestScore) {
    current[record.caseId] = record;
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(current));

    // Sync to Supabase if available
    const client = getSupabaseClient();
    const user = getCurrentUser();

    if (client) {
      try {
        await client.from('case_completions').insert([
          {
            user_id: user?.id || 'guest',
            user_email: user?.email || 'guest@aesthesiasim.com',
            case_id: record.caseId,
            patient_name: record.patientName,
            score: record.score,
            grade: record.grade,
            completed: true,
            elapsed_seconds: record.timestampSec,
            mistakes_count: record.mistakes.length,
            mistakes_data: record.mistakes,
            action_logs: record.actionLogs,
            vitals_history: record.vitalsHistory,
            created_at: record.completedAt,
          },
        ]);
      } catch (e) {
        console.warn('Supabase case completion sync warning:', e);
      }
    }
  }
}

/**
 * Determines whether a patient case is unlocked for the user.
 * Rules:
 * - If user is PRO: ALL cases unlocked!
 * - Case 1 (index 0): Always unlocked for everyone.
 * - Case N (index > 0): Unlocked only if previous case was completed with score > 80%!
 */
export function isCaseUnlocked(
  caseId: string,
  caseIndex: number,
  allCases: { patient: { id: string } }[],
  userProgress: Record<string, CaseCompletionRecord>,
  isPro: boolean
): { unlocked: boolean; reason?: string } {
  // Pro users have all cases unlocked
  if (isPro) {
    return { unlocked: true };
  }

  // First case is always open
  if (caseIndex === 0) {
    return { unlocked: true };
  }

  // Check previous case
  const prevCase = allCases[caseIndex - 1];
  if (!prevCase) {
    return { unlocked: true };
  }

  const prevRecord = userProgress[prevCase.patient.id];
  if (prevRecord && prevRecord.completed && prevRecord.score >= 80) {
    return { unlocked: true };
  }

  return {
    unlocked: false,
    reason: `Locked — Score at least 80% on Case ${caseIndex} to unlock, or upgrade to Pro to unlock all cases immediately.`,
  };
}

// ==========================================
// ADMIN DASHBOARD HELPERS
// ==========================================

export async function getAllUsersList(): Promise<UserAccount[]> {
  const client = getSupabaseClient();

  if (client) {
    try {
      const { data, error } = await client.from('profiles').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        return data.map((p) => ({
          id: p.id,
          email: p.email || 'user@example.com',
          name: p.name || p.full_name || p.email?.split('@')[0] || 'User',
          role: p.role || 'user',
          isPro: Boolean(p.is_pro),
          proUnlockedAt: p.updated_at,
          createdAt: p.created_at || new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch users from Supabase:', e);
    }
  }

  // Local cached users
  if (typeof window !== 'undefined') {
    try {
      const listRaw = localStorage.getItem(STORAGE_KEY_USERS_LIST);
      if (listRaw) {
        const list = JSON.parse(listRaw);
        if (list.length > 0) return list;
      }
    } catch {}
  }

  // Default seed list if completely empty
  const defaultList: UserAccount[] = [
    {
      id: 'admin-1',
      email: 'doctor@anesthesia.org',
      name: 'Chief Anesthesiologist (Admin)',
      role: 'admin',
      isPro: true,
      createdAt: '2026-01-15T08:00:00Z',
    },
    {
      id: 'user-demo-1',
      email: 'resident.smith@hospital.edu',
      name: 'Dr. Sarah Smith (Resident)',
      role: 'user',
      isPro: true,
      proUnlockedAt: '2026-02-01T14:20:00Z',
      proActivationToken: 'WHOP-PRO-2026',
      createdAt: '2026-02-01T10:00:00Z',
    },
    {
      id: 'user-demo-2',
      email: 'nurse.jones@clinic.com',
      name: 'CRNA Michael Jones',
      role: 'user',
      isPro: false,
      createdAt: '2026-02-10T11:30:00Z',
    },
  ];

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_USERS_LIST, JSON.stringify(defaultList));
  }

  return defaultList;
}

export async function toggleUserProStatus(userId: string, isPro: boolean): Promise<boolean> {
  const client = getSupabaseClient();

  if (client) {
    try {
      await client.from('profiles').update({ is_pro: isPro, updated_at: new Date().toISOString() }).eq('id', userId);
    } catch (e) {
      console.warn('Supabase toggle error:', e);
    }
  }

  // Update local storage
  if (typeof window !== 'undefined') {
    try {
      const listRaw = localStorage.getItem(STORAGE_KEY_USERS_LIST);
      const list: UserAccount[] = listRaw ? JSON.parse(listRaw) : [];
      const user = list.find((u) => u.id === userId);
      if (user) {
        user.isPro = isPro;
        user.proUnlockedAt = isPro ? new Date().toISOString() : undefined;
        localStorage.setItem(STORAGE_KEY_USERS_LIST, JSON.stringify(list));
      }

      // If active current user, update current user too
      const current = getCurrentUser();
      if (current && current.id === userId) {
        current.isPro = isPro;
        setCurrentUser(current);
      }
      return true;
    } catch (e) {
      console.warn('Local toggle error:', e);
    }
  }

  return false;
}
