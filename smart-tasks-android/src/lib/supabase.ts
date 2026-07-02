// Supabase 客户端
// v6.6 — 修复 #46：支持环境变量配置，保留默认值兼容现有部署
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 优先用 Vite 环境变量（import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），
// 没配置则用默认值（保持现有部署兼容）
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://zxasxqnfohubugynkjyi.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable__HcWaSS2mOmWBb1w1YMlSw_WyklcDOY';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_PROJECT');
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: localStorage,
      },
    });
  }
  return client;
}

// 当前用户会话
export async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}
