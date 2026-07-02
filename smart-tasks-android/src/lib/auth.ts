// 用户授权 + Pro 状态 + 云同步管理
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured, getCurrentUser, signOut } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// re-export 供其他模块使用
export { isSupabaseConfigured } from './supabase';
import type { Task, PomodoroSession, Tag, Note } from './db';
import { getAllTasks, getAllPomodoros, getAllTags, saveTask, addPomodoroSession, saveTag, getAllNotes, saveNote } from './db';

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

// v6.1 — accessor used by store.tsx to subscribe to real-time after login.
// Returns the current user id (or null if not signed in).
export function getCurrentUserId(): string | null {
  return currentUser?.id ?? null;
}

// 邮箱密码注册
export async function signUpWithEmail(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    currentUser = { id: data.user.id, email: data.user.email || null, phone: data.user.phone || null };
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
    currentUser = { id: data.user.id, email: data.user.email || null, phone: data.user.phone || null };
    await refreshProStatus();
    notify();
  }
  return data.user;
}

// 发送短信验证码
export async function sendOtp(phone: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { error } = await sb.auth.signInWithOtp({ phone, options: { channel: 'sms' } as any });
  if (error) throw error;
}

// 验证码登录
export async function verifyOtp(phone: string, token: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { data, error } = await sb.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  if (data.user) {
    currentUser = { id: data.user.id, email: data.user.email || null, phone: data.user.phone || null };
    await refreshProStatus();
    notify();
  }
  return data.user;
}

// 退出登录
export async function logout() {
  // v6.1 — tear down real-time subscription before signing out
  unsubscribeRealtime();
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
    .eq('user_id', currentUser!.id)
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
    user_id_input: currentUser!.id,
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

  const [tasks, pomodoros, tags, notes] = await Promise.all([
    getAllTasks(true),
    getAllPomodoros(),
    getAllTags(),
    getAllNotes(true),
  ]);

  // 上传任务（upsert）
  if (tasks.length > 0) {
    const rows = tasks.map(t => ({
      id: t.id, user_id: currentUser!.id,
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
      id: p.id, user_id: currentUser!.id, task_id: p.taskId,
      started_at: p.startedAt, ended_at: p.endedAt, duration: p.duration,
    }));
    const { error } = await sb.from('pomodoro_sessions').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  // 上传标签
  if (tags.length > 0) {
    const rows = tags.map(t => ({
      id: t.id, user_id: currentUser!.id,
      name: t.name, color: t.color,
      created_at: t.createdAt, updated_at: t.updatedAt,
    }));
    const { error } = await sb.from('tags').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  // v6.0 — 上传笔记
  await uploadNotesToCloud(notes);
}

// v6.0 — 上传笔记到云端
async function uploadNotesToCloud(notes: Note[]) {
  if (!currentUser || notes.length === 0) return;
  const sb = getSupabase();
  if (!sb) return;
  const rows = notes.map(n => ({
    id: n.id, user_id: currentUser!.id,
    title: n.title, content: n.content, pinned: n.pinned,
    created_at: n.createdAt, updated_at: n.updatedAt, deleted_at: n.deletedAt,
  }));
  const { error } = await sb.from('notes').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

// 从云端拉取数据到本地（覆盖本地）
export async function pullCloudToLocal() {
  if (!currentUser) throw new Error('请先登录');
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');

  // 拉取任务
  const { data: remoteTasks, error: e1 } = await sb.from('tasks').select('*').eq('user_id', currentUser!.id);
  if (e1) throw e1;
  if (remoteTasks) {
    for (const t of remoteTasks) {
      const task: Task = {
        id: t.id, title: t.title, description: t.description || '',
        dueDate: t.due_date, startDate: t.start_date || null, priority: t.priority, status: t.status,
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
  const { data: remotePomodoros, error: e2 } = await sb.from('pomodoro_sessions').select('*').eq('user_id', currentUser!.id);
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
  const { data: remoteTags, error: e3 } = await sb.from('tags').select('*').eq('user_id', currentUser!.id);
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

  // v6.0 — 拉取笔记
  const { data: remoteNotes, error: e4 } = await sb.from('notes').select('*').eq('user_id', currentUser!.id);
  if (e4) throw e4;
  if (remoteNotes) {
    for (const n of remoteNotes) {
      const note: Note = {
        id: n.id, title: n.title || '', content: n.content || '',
        pinned: !!n.pinned,
        createdAt: n.created_at, updatedAt: n.updated_at,
        deletedAt: n.deleted_at,
      };
      await saveNote(note);
    }
  }
}

// 同步单条任务到云端
export async function syncTaskToCloud(task: Task) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('tasks').upsert({
    id: task.id, user_id: currentUser!.id,
    title: task.title, description: task.description,
    due_date: task.dueDate, start_date: task.startDate, // v6.5 — start_date
    priority: task.priority, status: task.status,
    recurrence: task.recurrence, tags: task.tags, subtasks: task.subtasks,
    depends_on: task.dependsOn, pomodoros: task.pomodoros,
    note_markdown: task.noteMarkdown,
    created_at: task.createdAt, updated_at: task.updatedAt,
    completed_at: task.completedAt, deleted_at: task.deletedAt,
  }, { onConflict: 'id' });
}

// ============== v6.1 — Incremental cloud → local sync (polling backup) ==============

// Tracks the most recent `updated_at` we've seen from the cloud. Used by
// syncFromCloud() to only fetch rows that changed since the last poll.
//
// Stored in localStorage so it persists across sessions and survives page
// reloads. Without this, every poll would re-fetch ALL tasks.
//
// v6.2 — notes get their own watermark (`last-cloud-sync-time-notes`) since
// notes and tasks have independent update timestamps. A single shared
// watermark would advance past note updates whenever a task was newer.
const LAST_SYNC_KEY = 'last-cloud-sync-time';
const LAST_SYNC_NOTES_KEY = 'last-cloud-sync-time-notes';
let lastSyncTime = 0;
let lastSyncNotesTime = 0;

function getLastSyncTime(): number {
  if (lastSyncTime > 0) return lastSyncTime;
  try {
    const stored = localStorage.getItem(LAST_SYNC_KEY);
    lastSyncTime = stored ? parseInt(stored, 10) || 0 : 0;
  } catch { lastSyncTime = 0; }
  return lastSyncTime;
}

function setLastSyncTime(t: number) {
  lastSyncTime = t;
  try { localStorage.setItem(LAST_SYNC_KEY, String(t)); } catch {}
}

function getLastSyncNotesTime(): number {
  if (lastSyncNotesTime > 0) return lastSyncNotesTime;
  try {
    const stored = localStorage.getItem(LAST_SYNC_NOTES_KEY);
    lastSyncNotesTime = stored ? parseInt(stored, 10) || 0 : 0;
  } catch { lastSyncNotesTime = 0; }
  return lastSyncNotesTime;
}

function setLastSyncNotesTime(t: number) {
  lastSyncNotesTime = t;
  try { localStorage.setItem(LAST_SYNC_NOTES_KEY, String(t)); } catch {}
}

/**
 * v6.1 — Incremental cloud → local sync. Acts as a backup to the Supabase
 * real-time subscription (which can miss events when the WebSocket drops or
 * the app was offline).
 *
 * Algorithm:
 *   1. Fetch tasks from cloud where updated_at > lastSyncTime (for this user).
 *   2. For each remote task, only save locally if:
 *        - the local task doesn't exist (new from another device), OR
 *        - remote.updated_at > local.updated_at (other device has newer edit)
 *   3. Advance lastSyncTime to the max updated_at seen.
 *   4. Repeat steps 1-3 for notes (v6.2) using a separate watermark.
 *   5. If anything changed, dispatch a 'cloud-poll-sync' window event so the
 *      store can reload tasks from IndexedDB, and a 'notes-realtime-change'
 *      window event so NotesView refreshes.
 *
 * Safe to call repeatedly — does nothing if not logged in or Supabase is not
 * configured. Returns the number of rows (tasks + notes) actually written to
 * local IndexedDB (0 in the common steady-state case).
 */
export async function syncFromCloud(): Promise<number> {
  if (!currentUser) return 0;
  const sb = getSupabase();
  if (!sb) return 0;

  let totalUpdated = 0;

  // === TASKS ===
  const sinceTasks = getLastSyncTime();
  const { data: remoteTasks, error } = await sb
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .gt('updated_at', sinceTasks);
  if (!error && remoteTasks) {
    if (remoteTasks.length === 0) {
      // No changes since last sync — advance the watermark to "now" so the next
      // poll's query stays narrow even if writes happened that we already had.
      setLastSyncTime(Date.now());
    } else {
      const localTasks = await getAllTasks(true);
      const localMap = new Map(localTasks.map(t => [t.id, t]));

      let maxUpdatedAt = sinceTasks;
      for (const t of remoteTasks) {
        const remoteTask: Task = {
          id: t.id, title: t.title, description: t.description || '',
          dueDate: t.due_date, startDate: t.start_date || null, priority: t.priority, status: t.status,
          recurrence: t.recurrence, tags: t.tags || [],
          subtasks: t.subtasks || [], dependsOn: t.depends_on || [],
          pomodoros: t.pomodoros || 0, noteMarkdown: t.note_markdown,
          createdAt: t.created_at, updatedAt: t.updated_at,
          completedAt: t.completed_at, deletedAt: t.deleted_at,
        };
        const local = localMap.get(remoteTask.id);
        if (!local || remoteTask.updatedAt > local.updatedAt) {
          await saveTask(remoteTask);
          totalUpdated++;
        }
        if (remoteTask.updatedAt > maxUpdatedAt) {
          maxUpdatedAt = remoteTask.updatedAt;
        }
      }
      setLastSyncTime(maxUpdatedAt);
    }
  }

  // v6.2 — NOTES (separate watermark so a newer task update doesn't cause us
  // to skip a note that was updated between the previous poll and now).
  const sinceNotes = getLastSyncNotesTime();
  const { data: remoteNotes, error: notesError } = await sb
    .from('notes')
    .select('*')
    .eq('user_id', currentUser.id)
    .gt('updated_at', sinceNotes);
  if (!notesError && remoteNotes) {
    if (remoteNotes.length === 0) {
      setLastSyncNotesTime(Date.now());
    } else {
      const localNotes = await getAllNotes(true);
      const localNotesMap = new Map(localNotes.map(n => [n.id, n]));

      let maxUpdatedAt = sinceNotes;
      let notesChanged = false;
      for (const n of remoteNotes) {
        const remoteNote: Note = {
          id: n.id, title: n.title || '', content: n.content || '',
          pinned: !!n.pinned,
          createdAt: n.created_at, updatedAt: n.updated_at, deletedAt: n.deleted_at,
        };
        const local = localNotesMap.get(remoteNote.id);
        if (!local || remoteNote.updatedAt > local.updatedAt) {
          await saveNote(remoteNote);
          totalUpdated++;
          notesChanged = true;
        }
        if (remoteNote.updatedAt > maxUpdatedAt) {
          maxUpdatedAt = remoteNote.updatedAt;
        }
      }
      setLastSyncNotesTime(maxUpdatedAt);

      // Notes aren't in the global store — dispatch a window event so NotesView
      // re-queries IndexedDB and refreshes its list. Use the same event name
      // that the realtime subscription uses for consistency.
      if (notesChanged) {
        window.dispatchEvent(new CustomEvent('notes-realtime-change', {
          detail: { eventType: 'UPDATE', source: 'poll' },
        }));
      }
    }
  }

  if (totalUpdated > 0) {
    // Tell the store to reload tasks from IndexedDB (where we just wrote).
    // Notes are handled by the 'notes-realtime-change' event above.
    window.dispatchEvent(new CustomEvent('cloud-poll-sync', { detail: { count: totalUpdated } }));
  }
  return totalUpdated;
}

// 同步单条番茄钟到云端
export async function syncPomodoroToCloud(session: PomodoroSession) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('pomodoro_sessions').upsert({
    id: session.id, user_id: currentUser!.id, task_id: session.taskId,
    started_at: session.startedAt, ended_at: session.endedAt, duration: session.duration,
  }, { onConflict: 'id' });
}

// 同步单条标签到云端
export async function syncTagToCloud(tag: Tag) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('tags').upsert({
    id: tag.id, user_id: currentUser!.id,
    name: tag.name, color: tag.color,
    created_at: tag.createdAt, updated_at: tag.updatedAt,
  }, { onConflict: 'id' });
}

// v6.0 — 同步单条笔记到云端
// v6.4.1 — 失败时打印错误到 console.error（之前用 console.log 静默吞掉了，
//         导致 notes 表未在 Supabase 创建时用户完全看不到错误）
export async function syncNoteToCloud(note: Note) {
  if (!currentUser) {
    console.warn('[syncNote] 未登录，跳过同步');
    return;
  }
  const sb = getSupabase();
  if (!sb) {
    console.warn('[syncNote] Supabase 未配置，跳过同步');
    return;
  }
  const { error } = await sb.from('notes').upsert({
    id: note.id, user_id: currentUser!.id,
    title: note.title, content: note.content, pinned: note.pinned,
    created_at: note.createdAt, updated_at: note.updatedAt, deleted_at: note.deletedAt,
  }, { onConflict: 'id' });
  if (error) {
    console.error('[syncNote] 同步失败:', error.message, 'note.id=', note.id);
  }
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
  const { data: remote } = await sb.from('tasks').select('id, updated_at').eq('user_id', currentUser!.id);
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

  // v6.0 — 上传本地笔记（同样按 updated_at 去重）
  const { data: remoteNotes } = await sb.from('notes').select('id, updated_at').eq('user_id', currentUser!.id);
  const remoteNotesMap = new Map<string, number>();
  (remoteNotes || []).forEach((r: any) => remoteNotesMap.set(r.id, r.updated_at));
  const localNotes = await getAllNotes(true);
  for (const n of localNotes) {
    const rUpdatedAt = remoteNotesMap.get(n.id);
    if (!rUpdatedAt || rUpdatedAt < n.updatedAt) {
      await syncNoteToCloud(n);
    }
  }

  // 3. 拉取云端全部数据写回本地
  await pullCloudToLocal();
}

// ============== v6.1 — Real-time Sync ==============

/**
 * Real-time change handlers. Called by the Supabase real-time subscription
 * when a remote row changes. The store wires these to its dispatch actions.
 */
export interface RealtimeHandlers {
  onTaskInsert: (task: Task) => void;
  onTaskUpdate: (task: Task) => void;
  onTaskDelete: (id: string) => void;
  onTagInsert: (tag: Tag) => void;
  onTagUpdate: (tag: Tag) => void;
  onTagDelete: (id: string) => void;
  onPomodoroInsert: (session: PomodoroSession) => void;
  onPomodoroDelete: (id: string) => void;
  // Notes are not in the store — dispatch a window event for NotesView to refresh.
  onNoteChange: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', note: Note | { id: string }) => void;
}

let realtimeChannel: RealtimeChannel | null = null;

/**
 * Subscribe to Supabase real-time changes on the user's tasks, tags,
 * pomodoro_sessions, and notes. Returns immediately; changes are pushed
 * asynchronously to the provided handlers.
 *
 * v6.1 — enables PC to see mobile changes (and vice versa) without refresh.
 */
export function subscribeRealtime(userId: string, handlers: RealtimeHandlers) {
  const sb = getSupabase();
  if (!sb) return;

  // Unsubscribe any existing channel first (idempotent)
  unsubscribeRealtime();

  realtimeChannel = sb.channel('smart-tasks-realtime')

    // === TASKS ===
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const t = payload.new;
          if (!t) return;
          const task: Task = {
            id: t.id, title: t.title, description: t.description || '',
            dueDate: t.due_date, startDate: t.start_date || null, priority: t.priority, status: t.status,
            recurrence: t.recurrence, tags: t.tags || [],
            subtasks: t.subtasks || [], dependsOn: t.depends_on || [],
            pomodoros: t.pomodoros || 0, noteMarkdown: t.note_markdown,
            createdAt: t.created_at, updatedAt: t.updated_at,
            completedAt: t.completed_at, deletedAt: t.deleted_at,
          };
          // Persist to IndexedDB so local cache stays in sync
          saveTask(task).catch(e => console.log('[realtime] saveTask failed:', e));
          handlers.onTaskInsert(task);
        } catch (e) { console.log('[realtime] task INSERT parse failed:', e); }
      })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const t = payload.new;
          if (!t) return;
          const task: Task = {
            id: t.id, title: t.title, description: t.description || '',
            dueDate: t.due_date, startDate: t.start_date || null, priority: t.priority, status: t.status,
            recurrence: t.recurrence, tags: t.tags || [],
            subtasks: t.subtasks || [], dependsOn: t.depends_on || [],
            pomodoros: t.pomodoros || 0, noteMarkdown: t.note_markdown,
            createdAt: t.created_at, updatedAt: t.updated_at,
            completedAt: t.completed_at, deletedAt: t.deleted_at,
          };
          saveTask(task).catch(e => console.log('[realtime] saveTask failed:', e));
          handlers.onTaskUpdate(task);
        } catch (e) { console.log('[realtime] task UPDATE parse failed:', e); }
      })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const oldId = payload.old?.id;
          if (!oldId) return;
          handlers.onTaskDelete(oldId);
        } catch (e) { console.log('[realtime] task DELETE parse failed:', e); }
      })

    // === TAGS ===
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'tags', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const t = payload.new; if (!t) return;
          const tag: Tag = {
            id: t.id, name: t.name, color: t.color,
            createdAt: t.created_at, updatedAt: t.updated_at,
          };
          saveTag(tag).catch(e => console.log('[realtime] saveTag failed:', e));
          handlers.onTagInsert(tag);
        } catch (e) { console.log('[realtime] tag INSERT parse failed:', e); }
      })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tags', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const t = payload.new; if (!t) return;
          const tag: Tag = {
            id: t.id, name: t.name, color: t.color,
            createdAt: t.created_at, updatedAt: t.updated_at,
          };
          saveTag(tag).catch(e => console.log('[realtime] saveTag failed:', e));
          handlers.onTagUpdate(tag);
        } catch (e) { console.log('[realtime] tag UPDATE parse failed:', e); }
      })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'tags', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const oldId = payload.old?.id; if (!oldId) return;
          handlers.onTagDelete(oldId);
        } catch (e) { console.log('[realtime] tag DELETE parse failed:', e); }
      })

    // === POMODORO SESSIONS ===
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pomodoro_sessions', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const p = payload.new; if (!p) return;
          const session: PomodoroSession = {
            id: p.id, taskId: p.task_id, startedAt: p.started_at,
            endedAt: p.ended_at, duration: p.duration,
          };
          addPomodoroSession(session).catch(e => console.log('[realtime] addPomodoroSession failed:', e));
          handlers.onPomodoroInsert(session);
        } catch (e) { console.log('[realtime] pomodoro INSERT parse failed:', e); }
      })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'pomodoro_sessions', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const oldId = payload.old?.id; if (!oldId) return;
          handlers.onPomodoroDelete(oldId);
        } catch (e) { console.log('[realtime] pomodoro DELETE parse failed:', e); }
      })

    // === NOTES (not in store — dispatch a window event for NotesView) ===
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        try {
          const eventType = payload.eventType;
          if (eventType === 'DELETE') {
            handlers.onNoteChange('DELETE', { id: payload.old?.id });
          } else {
            const n = payload.new; if (!n) return;
            const note: Note = {
              id: n.id, title: n.title || '', content: n.content || '',
              pinned: !!n.pinned,
              createdAt: n.created_at, updatedAt: n.updated_at, deletedAt: n.deleted_at,
            };
            // Persist to IndexedDB so NotesView picks it up on refresh
            saveNote(note).catch(e => console.log('[realtime] saveNote failed:', e));
            handlers.onNoteChange(eventType, note);
          }
        } catch (e) { console.log('[realtime] note change parse failed:', e); }
      })

    .subscribe();
}

/** Unsubscribe from real-time changes (called on logout or theme/account switch). */
export function unsubscribeRealtime() {
  if (!realtimeChannel) return;
  try {
    const sb = getSupabase();
    if (sb) sb.removeChannel(realtimeChannel);
  } catch (e) {
    console.log('[realtime] unsubscribe failed:', e);
  }
  realtimeChannel = null;
}
