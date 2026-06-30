// Supabase 客户端
// 用户需在 supabase.com 创建项目后，把 URL 和 anon key 填入这里
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ⚠️ 用户配置区：把下面两个值换成你自己的 Supabase 项目
const SUPABASE_URL = 'https://zxasxqnfohubugynkjyi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__HcWaSS2mOmWBb1w1YMlSw_WyklcDOY';

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
