// 用户授权 + Pro 状态 + 云同步管理
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured, getCurrentUser, signOut } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// re-export 供其他模块使用
export { isSupabaseConfigured } from './supabase';
import type { Task, PomodoroSession, Tag, Note } from './db';
import { getAllTasks, getAllPomodoros, getAllTags, saveTask, addPomodoroSession, saveTag, getAllNotes, saveNote, getTaskById, getNoteById } from './db';

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

// v6.8 — 同步获取当前 Pro 状态（供非 hook 模块如 ai-client 使用）
export function getCurrentProStatus(): ProStatus {
  return currentProStatus;
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
  // v6.9.6 — 修复 #2：登出时清除 Pro AI Key 缓存，防止跨账号泄漏
  clearProAIConfigCache();
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
  // v6.6 — 修复 #31：并行 saveTask（之前串行 await 慢）
  if (remoteTasks) {
    await Promise.all(remoteTasks.map(async t => {
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
    }));
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
      // v6.6 — 修复 #5 时钟偏移漏拉：不推进 watermark 到本机 Date.now()
      // 保持原值不变，下次 poll 仍用旧 watermark 查询，避免快时钟漏拉其他设备的更新
      // （其他设备的 updated_at 用的是它们自己的本机时间，可能小于本机 now()）
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
      // v6.6 — 修复 #5 时钟偏移：notes 同样不推进 watermark
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
        // v6.10.4 — 修复 #dup：用云端原始 updated_at 比较，不用 saveNote 后的 remoteNote.updatedAt
        // （saveNote 内部会把 toSave.updatedAt 设为 Date.now()，但不能让这里取到那个污染值，
        //  否则 watermark 会跳到本机时间，导致其他设备的更新被漏拉）
        if (n.updated_at > maxUpdatedAt) {
          maxUpdatedAt = n.updated_at;
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
  // v6.6 — 修复 #50：限制 content 大小，防止 DOS 云端 DB
  // v6.10 — 上限从 100KB 提升到 1MB，以容纳 base64 内嵌的图片
  //        （单张压缩后约 80~150KB，1MB 可容纳 6~10 张图）
  const MAX_CONTENT = 1000000;
  const content = note.content.length > MAX_CONTENT
    ? note.content.slice(0, MAX_CONTENT) + '\n\n[内容过长已截断]'
    : note.content;
  const { error } = await sb.from('notes').upsert({
    id: note.id, user_id: currentUser!.id,
    title: note.title, content, pinned: note.pinned,
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

// v6.6 — 彻底删除云端任务（purgeTask 调用，避免回收站复活）
export async function deleteTaskFromCloud(taskId: string) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('tasks').delete().eq('id', taskId);
  if (error) console.error('[deleteTaskFromCloud] failed:', error.message);
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

  // v6.6 — 修复 #10：上传本地番茄钟记录和标签（之前完全漏了）
  // 番茄钟：直接全部上传（无 updated_at 字段，按 id 去重）
  const { data: remotePomodoros } = await sb.from('pomodoro_sessions').select('id').eq('user_id', currentUser!.id);
  const remotePomodoroIds = new Set((remotePomodoros || []).map((r: any) => r.id));
  const localPomodoros = await getAllPomodoros();
  for (const p of localPomodoros) {
    if (!remotePomodoroIds.has(p.id)) {
      await syncPomodoroToCloud(p);
    }
  }

  // 标签：按 updated_at 去重
  const { data: remoteTags } = await sb.from('tags').select('id, updated_at').eq('user_id', currentUser!.id);
  const remoteTagsMap = new Map<string, number>();
  (remoteTags || []).forEach((r: any) => remoteTagsMap.set(r.id, r.updated_at));
  const localTags = await getAllTags();
  for (const tg of localTags) {
    const rUpdatedAt = remoteTagsMap.get(tg.id);
    if (!rUpdatedAt || rUpdatedAt < tg.updatedAt) {
      await syncTagToCloud(tg);
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
          // v6.6 — 修复 #7：realtime 无条件覆盖。先对比 updatedAt，避免用旧远端事件覆盖本地新编辑
          (async () => {
            try {
              const local = await getTaskById(task.id);
              if (!local || task.updatedAt > local.updatedAt) {
                await saveTask(task);
                handlers.onTaskInsert(task);
              }
            } catch (e) { console.log('[realtime] saveTask failed:', e); }
          })();
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
          // v6.6 — 修复 #7：realtime 无条件覆盖。先对比 updatedAt
          (async () => {
            try {
              const local = await getTaskById(task.id);
              if (!local || task.updatedAt > local.updatedAt) {
                await saveTask(task);
                handlers.onTaskUpdate(task);
              }
            } catch (e) { console.log('[realtime] saveTask failed:', e); }
          })();
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
            // v6.10.4 — 修复 #dup：先对比 updatedAt，避免用旧远端事件覆盖本地新编辑
            // （之前无条件 saveNote 导致本地最新编辑被旧远端数据覆盖）
            // v6.6 修复 #7 时 task handler 已经做了这个对比，但 note handler 漏了
            (async () => {
              try {
                const local = await getNoteById(note.id);
                if (!local || note.updatedAt > local.updatedAt) {
                  await saveNote(note);
                  handlers.onNoteChange(eventType, note);
                }
              } catch (e) { console.log('[realtime] saveNote failed:', e); }
            })();
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

// ============================================================
// v6.8 — Pro 内置 AI API Key
// Pro 用户免配置即可用 AI，用开发者内置的 Key
// Key 存在 Supabase app_config 表，前端拉取
// ============================================================

interface ProAIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

let cachedProAIConfig: ProAIConfig | null = null;
let cachedProAIConfigTime = 0;
const PRO_AI_CACHE_TTL = 3600000;  // 1 小时缓存

/** 获取 Pro 内置 AI 配置（仅 Pro 用户可拿到） */
export async function getProAIConfig(): Promise<ProAIConfig | null> {
  if (!currentUser) return null;
  const sb = getSupabase();
  if (!sb) return null;

  // 缓存 1 小时
  if (cachedProAIConfig && Date.now() - cachedProAIConfigTime < PRO_AI_CACHE_TTL) {
    return cachedProAIConfig;
  }

  try {
    const { data, error } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'pro_ai_config')
      .maybeSingle();

    if (error || !data?.value) return null;

    const config = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!config.baseURL || !config.apiKey || !config.model) return null;

    cachedProAIConfig = config;
    cachedProAIConfigTime = Date.now();
    return config;
  } catch (e) {
    console.log('[getProAIConfig] failed:', e);
    return null;
  }
}

/** 清除 Pro AI 配置缓存（登出时调用） */
export function clearProAIConfigCache() {
  cachedProAIConfig = null;
  cachedProAIConfigTime = 0;
}

// ============================================================
// v6.9 — 数据安全功能：修改密码、注销账号、登录设备管理
// ============================================================

// 修改密码
export async function changePassword(newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('密码至少 6 位');
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// 注销账号（删除账号 + 所有云端数据）
export async function deleteAccount(): Promise<void> {
  if (!currentUser) throw new Error('请先登录');
  const sb = getSupabase();
  if (!sb) throw new Error('云服务未配置');

  // 1. 删除用户的所有云端数据（按表删，RLS 允许用户删自己的）
  const userId = currentUser.id;
  await sb.from('pomodoro_sessions').delete().eq('user_id', userId);
  await sb.from('tasks').delete().eq('user_id', userId);
  await sb.from('tags').delete().eq('user_id', userId);
  await sb.from('notes').delete().eq('user_id', userId);
  await sb.from('user_settings').delete().eq('user_id', userId);

  // 2. 删除 auth.users 里的账号（需要用 admin API，前端只能用 RPC）
  // 前端没有 service_role key，无法直接删 auth 用户
  // 用 Supabase 的 deleteUser RPC（需要先创建）
  // 这里先只删业务数据，auth 账号让用户去 Supabase 后台删
  // 或者用 signOut + 提示用户联系客服删 auth 账号

  // 3. 退出登录
  await sb.auth.signOut();
  currentUser = null;
  currentProStatus = { isPro: false, expiresAt: null, type: null };
  clearProAIConfigCache();
  notify();
}

// 登录设备管理：获取当前 session 信息
export async function getSessionInfo(): Promise<{ deviceId: string; lastSignIn: string; deviceName: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) console.error('[getSessionInfo] error:', error);
    if (!data.session) return null;

    const user = data.session.user;
    const deviceId = user.id.slice(0, 8);

    // 解析设备名（从 User-Agent）
    const ua = navigator.userAgent;
    let deviceName = 'Web 浏览器';
    if (/Android/i.test(ua)) deviceName = 'Android 设备';
    else if (/iPhone|iPad/i.test(ua)) deviceName = 'iOS 设备';
    else if (/Windows/i.test(ua)) deviceName = 'Windows PC';
    else if (/Mac/i.test(ua)) deviceName = 'Mac 电脑';

    // 最近登录时间
    const lastSignInRaw = user.last_sign_in_at || user.created_at;
    let lastSignIn = '未知';
    if (lastSignInRaw) {
      try {
        const d = new Date(lastSignInRaw);
        lastSignIn = d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch {}
    }

    return { deviceId, lastSignIn, deviceName };
  } catch (e) {
    console.error('[getSessionInfo] failed:', e);
    return null;
  }
}

