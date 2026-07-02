import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { Task, PomodoroSession, Tag } from './db';
import { getAllTasks, saveTask, deleteTaskPermanent, getAllPomodoros, addPomodoroSession, getAllTags, saveTag, deleteTag as deleteTagDB } from './db';
import { genId } from './db';
import { generateNextRecurrence } from './task-utils';
import { syncTaskToCloud, syncPomodoroToCloud, syncTagToCloud, deleteTagFromCloud, useAuth, subscribeRealtime, unsubscribeRealtime } from './auth';
import { applyTheme, getLastLightThemeId, THEMES, isDarkTheme } from './themes';

interface State {
  tasks: Task[];
  pomodoros: PomodoroSession[];
  tags: Tag[];
  loading: boolean;
  theme: 'light' | 'dark';
  // v6.0 — global app theme (5 themes: 4 light + 1 dark)
  appTheme: string;
}

type Action =
  | { type: 'LOAD'; tasks: Task[]; pomodoros: PomodoroSession[]; tags: Tag[] }
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; task: Task }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'RESTORE_TASK'; id: string }
  | { type: 'PURGE_TASK'; id: string }
  | { type: 'ADD_POMODORO'; session: PomodoroSession; taskId: string }
  | { type: 'PURGE_POMODORO'; id: string }
  | { type: 'ADD_TAG'; tag: Tag }
  | { type: 'DELETE_TAG'; id: string }
  | { type: 'SET_THEME'; theme: 'light' | 'dark' }
  | { type: 'SET_APP_THEME'; appTheme: string };

const initialAppTheme: string = (() => {
  try {
    // If user had `theme=dark` from before v6.0 (and no app-theme stored yet),
    // migrate them to dark-pro to preserve their dark mode preference.
    const storedAppTheme = localStorage.getItem('app-theme');
    if (storedAppTheme && THEMES.some(t => t.id === storedAppTheme)) {
      return storedAppTheme;
    }
    const legacyTheme = localStorage.getItem('theme');
    if (legacyTheme === 'dark') return 'dark-pro';
    return 'ocean-blue';
  } catch { return 'ocean-blue'; }
})();

const initialState: State = {
  tasks: [], pomodoros: [], tags: [], loading: true,
  // v6.0 — `theme` is derived from `appTheme` (any dark theme → dark, else → light).
  // Kept in sync by the SET_APP_THEME reducer case.
  theme: isDarkTheme(initialAppTheme) ? 'dark' : 'light',
  // v6.1 — current theme palette (10 themes: ocean-blue / sunset-orange / forest-green /
  // royal-purple / dark-pro / aurora / cherry / midnight / warm-sand / deep-ocean)
  appTheme: initialAppTheme,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD': return { ...state, tasks: action.tasks, pomodoros: action.pomodoros, tags: action.tags, loading: false };
    case 'ADD_TASK': {
      // v6.1 — real-time sync may push an INSERT for a task we just created locally.
      // Treat ADD_TASK as an upsert: if the id already exists, replace it.
      if (state.tasks.some(t => t.id === action.task.id)) {
        return { ...state, tasks: state.tasks.map(t => t.id === action.task.id ? action.task : t) };
      }
      return { ...state, tasks: [action.task, ...state.tasks] };
    }
    case 'UPDATE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.task.id ? action.task : t) };
    case 'DELETE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, deletedAt: Date.now() } : t) };
    case 'RESTORE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, deletedAt: null } : t) };
    case 'PURGE_TASK': return { ...state, tasks: state.tasks.filter(t => t.id !== action.id) };
    case 'ADD_POMODORO': {
      // v6.1 — upsert (real-time sync may send a duplicate INSERT)
      if (state.pomodoros.some(p => p.id === action.session.id)) {
        return {
          ...state,
          pomodoros: state.pomodoros.map(p => p.id === action.session.id ? action.session : p),
        };
      }
      return {
        ...state,
        pomodoros: [...state.pomodoros, action.session],
        tasks: state.tasks.map(t => t.id === action.taskId ? { ...t, pomodoros: t.pomodoros + 1 } : t),
      };
    }
    case 'PURGE_POMODORO': {
      // v6.1 — remote DELETE; remove from local array (don't decrement task count
      // since the remote delete doesn't automatically sync the task's pomodoro count).
      return { ...state, pomodoros: state.pomodoros.filter(p => p.id !== action.id) };
    }
    case 'ADD_TAG': {
      // v6.1 — upsert by id (real-time sync may send a duplicate INSERT)
      if (state.tags.some(t => t.id === action.tag.id)) {
        return { ...state, tags: state.tags.map(t => t.id === action.tag.id ? action.tag : t) };
      }
      // dedupe by name (legacy behavior — first write wins)
      if (state.tags.some(t => t.name === action.tag.name)) return state;
      return { ...state, tags: [...state.tags, action.tag] };
    }
    case 'DELETE_TAG': return { ...state, tags: state.tags.filter(t => t.id !== action.id) };
    case 'SET_THEME': return { ...state, theme: action.theme };
    case 'SET_APP_THEME': {
      // v6.1 — derive `theme` (legacy 'light'|'dark') from the theme's isDark flag.
      const isDark = isDarkTheme(action.appTheme);
      return { ...state, appTheme: action.appTheme, theme: isDark ? 'dark' : 'light' };
    }
    default: return state;
  }
}

interface ContextValue extends State {
  dispatch: React.Dispatch<Action>;
  createTask: (partial: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  softDeleteTask: (id: string) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  purgeTask: (id: string) => Promise<void>;
  recordPomodoro: (taskId: string, duration: number) => Promise<void>;
  ensureTag: (name: string, color?: string) => Promise<Tag>;
  updateTagColor: (id: string, color: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  toggleTheme: () => void;
  setAppTheme: (themeId: string) => void;
}

const TaskContext = createContext<ContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // v6.1 — subscribe to Supabase real-time changes when user is logged in.
  // This makes the PC see mobile changes (and vice versa) without a refresh.
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) {
      // Not logged in — make sure no stale subscription is running.
      unsubscribeRealtime();
      return;
    }
    // Subscribe with handlers that dispatch into our reducer.
    subscribeRealtime(user.id, {
      onTaskInsert: (task) => dispatch({ type: 'ADD_TASK', task }),
      onTaskUpdate: (task) => dispatch({ type: 'UPDATE_TASK', task }),
      onTaskDelete: (id) => dispatch({ type: 'PURGE_TASK', id }),
      onTagInsert: (tag) => dispatch({ type: 'ADD_TAG', tag }),
      onTagUpdate: (tag) => dispatch({ type: 'ADD_TAG', tag }), // upsert by id
      onTagDelete: (id) => dispatch({ type: 'DELETE_TAG', id }),
      onPomodoroInsert: (session) => dispatch({ type: 'ADD_POMODORO', session, taskId: session.taskId }),
      onPomodoroDelete: (id) => dispatch({ type: 'PURGE_POMODORO', id }),
      // Notes aren't in the store — dispatch a window event so NotesView refreshes.
      onNoteChange: (eventType, note) => {
        window.dispatchEvent(new CustomEvent('notes-realtime-change', { detail: { eventType, note } }));
      },
    });
    return () => {
      // Cleanup on logout / user change / unmount
      unsubscribeRealtime();
    };
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const [tasks, pomodoros, tags] = await Promise.all([getAllTasks(true), getAllPomodoros(), getAllTags()]);
        dispatch({ type: 'LOAD', tasks, pomodoros, tags });
        if (tasks.length === 0) await seedDemoData();
      } catch (e) {
        console.error('Load failed', e);
        dispatch({ type: 'LOAD', tasks: [], pomodoros: [], tags: [] });
      }
    })();
  }, []);

  // v6.1 — Listen for the 'cloud-poll-sync' window event (dispatched by
  // syncFromCloud() in auth.ts when it writes new/updated remote tasks into
  // IndexedDB). On this event, reload tasks from IndexedDB so the UI reflects
  // the changes the polling backup picked up.
  useEffect(() => {
    const handler = async () => {
      try {
        const [tasks, pomodoros, tags] = await Promise.all([
          getAllTasks(true), getAllPomodoros(), getAllTags(),
        ]);
        dispatch({ type: 'LOAD', tasks, pomodoros, tags });
      } catch (e) {
        console.log('Reload after poll sync failed:', e);
      }
    };
    window.addEventListener('cloud-poll-sync', handler);
    return () => window.removeEventListener('cloud-poll-sync', handler);
  }, []);

  useEffect(() => {
    // v6.0 — applyTheme handles both CSS variables and the `dark` class on body.
    // The legacy `theme` state is kept in sync with `appTheme` (dark-pro → dark).
    applyTheme(state.appTheme);
    localStorage.setItem('theme', state.theme);
  }, [state.appTheme, state.theme]);

  useEffect(() => {
    if (state.tasks.length === 0) return;
    const cutoff = Date.now() - 30 * 86400000;
    state.tasks.forEach(async t => {
      if (t.deletedAt && t.deletedAt < cutoff) {
        await deleteTaskPermanent(t.id);
        dispatch({ type: 'PURGE_TASK', id: t.id });
      }
    });
  }, [state.tasks]);

  async function seedDemoData() {
    const demoTasks: Task[] = [
      { id: genId(), title: '欢迎使用智能待办', description: '点击右上角 + 创建任务，长按任务可编辑或删除', dueDate: null, startDate: null, priority: 'medium', status: 'todo', recurrence: null, tags: ['入门'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '完成产品需求文档', description: '梳理 V2.0 版本核心功能模块', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startDate: new Date().toISOString().slice(0, 10), priority: 'high', status: 'in_progress', recurrence: null, tags: ['工作', '产品'], subtasks: [{ id: genId(), title: '竞品分析', done: true, order: 0 }, { id: genId(), title: '功能列表', done: false, order: 1 }, { id: genId(), title: '原型评审', done: false, order: 2 }], dependsOn: [], pomodoros: 3, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '每日阅读 30 分钟', description: '', dueDate: new Date().toISOString().slice(0, 10), startDate: null, priority: 'low', status: 'todo', recurrence: 'daily', tags: ['学习'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '健身房训练', description: '腿日：深蹲 + 硬拉', dueDate: new Date().toISOString().slice(0, 10), startDate: null, priority: 'medium', status: 'todo', recurrence: 'weekly', tags: ['健康'], subtasks: [], dependsOn: [], pomodoros: 1, noteMarkdown: null, createdAt: Date.now() - 2 * 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '回复客户邮件', description: '', dueDate: new Date().toISOString().slice(0, 10), startDate: null, priority: 'high', status: 'done', recurrence: null, tags: ['工作'], subtasks: [], dependsOn: [], pomodoros: 1, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: Date.now(), deletedAt: null },
      { id: genId(), title: '准备周会汇报', description: '本周进度 + 下周计划', dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), startDate: null, priority: 'high', status: 'todo', recurrence: 'weekly', tags: ['工作'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '学习 React 18 新特性', description: 'Concurrent Mode、Suspense、useTransition', dueDate: null, startDate: null, priority: 'medium', status: 'in_progress', recurrence: null, tags: ['学习', '前端'], subtasks: [{ id: genId(), title: '阅读官方文档', done: true, order: 0 }, { id: genId(), title: '写 demo', done: false, order: 1 }], dependsOn: [], pomodoros: 2, noteMarkdown: null, createdAt: Date.now() - 3 * 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '整理本月开支', description: '', dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), startDate: null, priority: 'low', status: 'todo', recurrence: 'monthly', tags: ['生活'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
    ];
    const demoTags: Tag[] = [
      { id: genId(), name: '工作', color: 'violet', createdAt: Date.now(), updatedAt: Date.now() },
      { id: genId(), name: '学习', color: 'sky', createdAt: Date.now(), updatedAt: Date.now() },
      { id: genId(), name: '生活', color: 'amber', createdAt: Date.now(), updatedAt: Date.now() },
      { id: genId(), name: '健康', color: 'rose', createdAt: Date.now(), updatedAt: Date.now() },
      { id: genId(), name: '产品', color: 'violet', createdAt: Date.now(), updatedAt: Date.now() },
      { id: genId(), name: '前端', color: 'teal', createdAt: Date.now(), updatedAt: Date.now() },
      { id: genId(), name: '入门', color: 'orange', createdAt: Date.now(), updatedAt: Date.now() },
    ];
    for (const t of demoTasks) await saveTask(t);
    for (const t of demoTags) await saveTag(t);
    dispatch({ type: 'LOAD', tasks: demoTasks, pomodoros: [], tags: demoTags });
  }

  const value: ContextValue = {
    ...state, dispatch,
    async createTask(partial) {
      const task: Task = {
        id: genId(),
        title: partial.title || '新任务',
        description: partial.description || '',
        dueDate: partial.dueDate || null,
        // v6.5 — startDate; if recurrence is set, force startDate=null (重复任务不支持区间)
        startDate: partial.recurrence ? null : (partial.startDate || null),
        priority: partial.priority || 'medium',
        status: partial.status || 'todo',
        recurrence: partial.recurrence || null,
        tags: partial.tags || [],
        subtasks: partial.subtasks || [],
        dependsOn: partial.dependsOn || [],
        pomodoros: 0,
        noteMarkdown: partial.noteMarkdown || null,
        createdAt: Date.now(), updatedAt: Date.now(),
        completedAt: null, deletedAt: null,
      };
      await saveTask(task);
      dispatch({ type: 'ADD_TASK', task });
      syncTaskToCloud(task).catch(e => console.log('Sync failed:', e));
      for (const tagName of task.tags) await value.ensureTag(tagName);
      return task;
    },
    async updateTask(id, patch) {
      const existing = state.tasks.find(t => t.id === id);
      if (!existing) return;
      // v6.5 — 如果 patch 启用了 recurrence，强制清掉 startDate
      const patchWithStartDate: Partial<Task> = { ...patch };
      if (patchWithStartDate.recurrence) {
        patchWithStartDate.startDate = null;
      }
      const updated = { ...existing, ...patchWithStartDate, updatedAt: Date.now() };
      await saveTask(updated);
      dispatch({ type: 'UPDATE_TASK', task: updated });
      syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async completeTask(id) {
      const existing = state.tasks.find(t => t.id === id);
      if (!existing) return;
      const updated: Task = { ...existing, status: 'done', completedAt: Date.now(), updatedAt: Date.now() };
      if (existing.recurrence && existing.dueDate) {
        const next = generateNextRecurrence(existing);
        if (next) {
          const newInstance: Task = {
            ...existing, id: genId(), status: 'todo', completedAt: null, deletedAt: null,
            createdAt: Date.now(), updatedAt: Date.now(), pomodoros: 0, ...next,
          };
          await saveTask(newInstance);
          dispatch({ type: 'ADD_TASK', task: newInstance });
          syncTaskToCloud(newInstance).catch(e => console.log('Sync failed:', e));
        }
      }
      await saveTask(updated);
      dispatch({ type: 'UPDATE_TASK', task: updated });
      syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async softDeleteTask(id) {
      const existing = state.tasks.find(t => t.id === id);
      if (!existing) return;
      const updated = { ...existing, deletedAt: Date.now(), updatedAt: Date.now() };
      await saveTask(updated);
      dispatch({ type: 'UPDATE_TASK', task: updated });
      dispatch({ type: 'DELETE_TASK', id });
      syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async restoreTask(id) {
      const existing = state.tasks.find(t => t.id === id);
      if (!existing) return;
      const updated = { ...existing, deletedAt: null, updatedAt: Date.now() };
      await saveTask(updated);
      dispatch({ type: 'UPDATE_TASK', task: updated });
      dispatch({ type: 'RESTORE_TASK', id });
      syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async purgeTask(id) {
      await deleteTaskPermanent(id);
      dispatch({ type: 'PURGE_TASK', id });
    },
    async recordPomodoro(taskId, duration) {
      const session: PomodoroSession = {
        id: genId(), taskId, startedAt: Date.now() - duration * 1000, endedAt: Date.now(), duration,
      };
      await addPomodoroSession(session);
      dispatch({ type: 'ADD_POMODORO', session, taskId });
      syncPomodoroToCloud(session).catch(e => console.log('Sync failed:', e));
    },
    async ensureTag(name, color = 'violet') {
      const cleaned = name.replace(/^#/, '').trim();
      if (!cleaned) return state.tags[0];
      const existing = state.tags.find(t => t.name === cleaned);
      if (existing) return existing;
      const tag: Tag = { id: genId(), name: cleaned, color, createdAt: Date.now(), updatedAt: Date.now() };
      await saveTag(tag);
      dispatch({ type: 'ADD_TAG', tag });
      syncTagToCloud(tag).catch(e => console.log('Sync failed:', e));
      return tag;
    },
    async updateTagColor(id, color) {
      const existing = state.tags.find(t => t.id === id);
      if (!existing) return;
      const updated = { ...existing, color, updatedAt: Date.now() };
      await saveTag(updated);
      dispatch({ type: 'ADD_TAG', tag: updated }); // ADD_TAG 是 upsert 行为（已存在会替换）
      syncTagToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async deleteTag(id) {
      const tag = state.tags.find(t => t.id === id);
      if (!tag) return;
      // 同时从所有任务的 tags 数组中移除该标签
      for (const t of state.tasks) {
        if (t.deletedAt) continue;
        if (t.tags.includes(tag.name)) {
          const newTags = t.tags.filter(tn => tn !== tag.name);
          const updated = { ...t, tags: newTags, updatedAt: Date.now() };
          await saveTask(updated);
          dispatch({ type: 'UPDATE_TASK', task: updated });
          syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
        }
      }
      await deleteTagDB(id);
      dispatch({ type: 'DELETE_TAG', id });
      deleteTagFromCloud(id).catch(e => console.log('Sync failed:', e));
    },
    toggleTheme() {
      // v6.1 — toggle between the current dark theme and the last-used light theme.
      // Works with any dark theme (dark-pro or midnight).
      if (isDarkTheme(state.appTheme)) {
        const lastLight = getLastLightThemeId();
        dispatch({ type: 'SET_APP_THEME', appTheme: lastLight });
      } else {
        // remember current light theme before switching to dark
        if (!isDarkTheme(state.appTheme)) {
          localStorage.setItem('last-light-theme', state.appTheme);
        }
        // Default dark theme is dark-pro (user can pick midnight from theme picker)
        dispatch({ type: 'SET_APP_THEME', appTheme: 'dark-pro' });
      }
    },
    setAppTheme(themeId: string) {
      dispatch({ type: 'SET_APP_THEME', appTheme: themeId });
    },
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTaskStore() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTaskStore must be used within TaskProvider');
  return ctx;
}
