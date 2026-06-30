// 用户授权 + Pro 状态 + 云同步管理
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured, getCurrentUser, signOut } from './supabase';
import type { Task, PomodoroSession, Tag } from './db';
import { getAllTasks, getAllPomodoros, getAllTags, saveTask, addPomodoroSession, saveTag } from './db';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface ProStatus {
  isPro: boolean;
  expiresAt: number | null;
  type: string | null; // 'pro_lifetime' / 'pro_monthly' 等
}

let currentUser: User | null = null;
let currentProStatus: ProStatus = { isPro: false, expiresAt: null, type: null };
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

export function useAuth() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const fn = () => forceUpdate(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { user: currentUser, pro: currentProStatus, isConfigured: isSupabaseConfigured() };
}

// 初始化：恢复会话
export async function initAuth() {
  if (!isSupabaseConfigured()) return;
  const u = await getCurrentUser();
  if (u) {
    currentUser = { id: u.id, email: u.email || null, phone: u.phone || null };
    await refreshProStatus();
    notify();
  }
}

// 邮箱密码注册
export async function signUpWithEmail(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    currentUser = { id: data.user.id, email: data.user.email, phone: data.user.phone };
    await refreshProStatus();
    notify();
  }
  return data.user;
}

// 邮箱密码登录
export async function signInWithEmail(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) {
    currentUser = { id: data.user.id, email: data.user.email, phone: data.user.phone };
    await refreshProStatus();
    notify();
  }
  return data.user;
}

// 发送短信验证码
export async function sendOtp(phone: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { error } = await sb.auth.signInWithOtp({ phone, channel: 'sms' });
  if (error) throw error;
}

// 验证码登录
export async function verifyOtp(phone: string, token: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { data, error } = await sb.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  if (data.user) {
    currentUser = { id: data.user.id, email: data.user.email, phone: data.user.phone };
    await refreshProStatus();
    notify();
  }
  return data.user;
}

// 退出登录
export async function logout() {
  await signOut();
  currentUser = null;
  currentProStatus = { isPro: false, expiresAt: null, type: null };
  notify();
}

// 刷新 Pro 状态
export async function refreshProStatus() {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from('user_settings')
    .select('is_pro, pro_expires_at, license_key')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  if (error || !data) {
    currentProStatus = { isPro: false, expiresAt: null, type: null };
    return;
  }
  const now = Date.now();
  const isPro = data.is_pro && (!data.pro_expires_at || data.pro_expires_at > now);
  currentProStatus = {
    isPro,
    expiresAt: data.pro_expires_at,
    type: isPro ? 'pro' : null,
  };
}

// 兑换码
export async function redeemCode(code: string) {
  if (!currentUser) throw new Error('请先登录');
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { data, error } = await sb.rpc('redeem_license_code', {
    code_input: code,
    user_id_input: currentUser.id,
  });
  if (error) throw error;
  await refreshProStatus();
  notify();
  return data as { type: string; expires_at: number };
}

// ============== 云同步 ==============

// 上传本地数据到云端（首次登录合并用）
export async function uploadLocalToCloud() {
  if (!currentUser) throw new Error('请先登录');
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');

  const [tasks, pomodoros, tags] = await Promise.all([
    getAllTasks(true),
    getAllPomodoros(),
    getAllTags(),
  ]);

  // 上传任务（upsert）
  if (tasks.length > 0) {
    const rows = tasks.map(t => ({
      id: t.id, user_id: currentUser.id,
      title: t.title, description: t.description,
      due_date: t.dueDate, priority: t.priority, status: t.status,
      recurrence: t.recurrence, tags: t.tags, subtasks: t.subtasks,
      depends_on: t.dependsOn, pomodoros: t.pomodoros,
      note_markdown: t.noteMarkdown,
      created_at: t.createdAt, updated_at: t.updatedAt,
      completed_at: t.completedAt, deleted_at: t.deletedAt,
    }));
    const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  // 上传番茄钟
  if (pomodoros.length > 0) {
    const rows = pomodoros.map(p => ({
      id: p.id, user_id: currentUser.id, task_id: p.taskId,
      started_at: p.startedAt, ended_at: p.endedAt, duration: p.duration,
    }));
    const { error } = await sb.from('pomodoro_sessions').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  // 上传标签
  if (tags.length > 0) {
    const rows = tags.map(t => ({
      id: t.id, user_id: currentUser.id,
      name: t.name, color: t.color,
      created_at: t.createdAt, updated_at: t.updatedAt,
    }));
    const { error } = await sb.from('tags').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
}

// 从云端拉取数据到本地（覆盖本地）
export async function pullCloudToLocal() {
  if (!currentUser) throw new Error('请先登录');
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');

  // 拉取任务
  const { data: remoteTasks, error: e1 } = await sb.from('tasks').select('*').eq('user_id', currentUser.id);
  if (e1) throw e1;
  if (remoteTasks) {
    for (const t of remoteTasks) {
      const task: Task = {
        id: t.id, title: t.title, description: t.description || '',
        dueDate: t.due_date, priority: t.priority, status: t.status,
        recurrence: t.recurrence, tags: t.tags || [],
        subtasks: t.subtasks || [], dependsOn: t.depends_on || [],
        pomodoros: t.pomodoros || 0, noteMarkdown: t.note_markdown,
        createdAt: t.created_at, updatedAt: t.updated_at,
        completedAt: t.completed_at, deletedAt: t.deleted_at,
      };
      await saveTask(task);
    }
  }

  // 拉取番茄钟
  const { data: remotePomodoros, error: e2 } = await sb.from('pomodoro_sessions').select('*').eq('user_id', currentUser.id);
  if (e2) throw e2;
  if (remotePomodoros) {
    for (const p of remotePomodoros) {
      const session: PomodoroSession = {
        id: p.id, taskId: p.task_id, startedAt: p.started_at,
        endedAt: p.ended_at, duration: p.duration,
      };
      await addPomodoroSession(session);
    }
  }

  // 拉取标签
  const { data: remoteTags, error: e3 } = await sb.from('tags').select('*').eq('user_id', currentUser.id);
  if (e3) throw e3;
  if (remoteTags) {
    for (const t of remoteTags) {
      const tag: Tag = {
        id: t.id, name: t.name, color: t.color,
        createdAt: t.created_at, updatedAt: t.updated_at,
      };
      await saveTag(tag);
    }
  }
}

// 同步单条任务到云端
export async function syncTaskToCloud(task: Task) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('tasks').upsert({
    id: task.id, user_id: currentUser.id,
    title: task.title, description: task.description,
    due_date: task.dueDate, priority: task.priority, status: task.status,
    recurrence: task.recurrence, tags: task.tags, subtasks: task.subtasks,
    depends_on: task.dependsOn, pomodoros: task.pomodoros,
    note_markdown: task.noteMarkdown,
    created_at: task.createdAt, updated_at: task.updatedAt,
    completed_at: task.completedAt, deleted_at: task.deletedAt,
  }, { onConflict: 'id' });
}

// 同步单条番茄钟到云端
export async function syncPomodoroToCloud(session: PomodoroSession) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('pomodoro_sessions').upsert({
    id: session.id, user_id: currentUser.id, task_id: session.taskId,
    started_at: session.startedAt, ended_at: session.endedAt, duration: session.duration,
  }, { onConflict: 'id' });
}

// 同步单条标签到云端
export async function syncTagToCloud(tag: Tag) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('tags').upsert({
    id: tag.id, user_id: currentUser.id,
    name: tag.name, color: tag.color,
    created_at: tag.createdAt, updated_at: tag.updatedAt,
  }, { onConflict: 'id' });
}

// 删除云端标签
export async function deleteTagFromCloud(tagId: string) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('tags').delete().eq('id', tagId);
}

// 首次登录：合并本地数据到云端（去重）
export async function mergeLocalToCloud() {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;

  // 1. 拉取云端已有任务 ID
  const { data: remote } = await sb.from('tasks').select('id, updated_at').eq('user_id', currentUser.id);
  const remoteMap = new Map<string, number>();
  (remote || []).forEach((r: any) => remoteMap.set(r.id, r.updated_at));

  // 2. 上传本地任务（云端已存在的，比 updated_at，新的覆盖旧的）
  const localTasks = await getAllTasks(true);
  for (const t of localTasks) {
    const remoteUpdatedAt = remoteMap.get(t.id);
    if (!remoteUpdatedAt || remoteUpdatedAt < t.updatedAt) {
      await syncTaskToCloud(t);
    }
  }

  // 3. 拉取云端全部数据写回本地
  await pullCloudToLocal();
}
