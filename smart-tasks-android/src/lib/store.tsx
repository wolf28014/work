import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { Task, PomodoroSession, Tag } from './db';
import { getAllTasks, saveTask, deleteTaskPermanent, getAllPomodoros, addPomodoroSession, getAllTags, saveTag, deleteTag as deleteTagDB } from './db';
import { genId } from './db';
import { generateNextRecurrence } from './task-utils';
import { syncTaskToCloud, syncPomodoroToCloud, syncTagToCloud, deleteTagFromCloud } from './auth';

interface State {
  tasks: Task[];
  pomodoros: PomodoroSession[];
  tags: Tag[];
  loading: boolean;
  theme: 'light' | 'dark';
}

type Action =
  | { type: 'LOAD'; tasks: Task[]; pomodoros: PomodoroSession[]; tags: Tag[] }
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; task: Task }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'RESTORE_TASK'; id: string }
  | { type: 'PURGE_TASK'; id: string }
  | { type: 'ADD_POMODORO'; session: PomodoroSession; taskId: string }
  | { type: 'ADD_TAG'; tag: Tag }
  | { type: 'DELETE_TAG'; id: string }
  | { type: 'SET_THEME'; theme: 'light' | 'dark' };

const initialState: State = {
  tasks: [], pomodoros: [], tags: [], loading: true,
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD': return { ...state, tasks: action.tasks, pomodoros: action.pomodoros, tags: action.tags, loading: false };
    case 'ADD_TASK': return { ...state, tasks: [action.task, ...state.tasks] };
    case 'UPDATE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.task.id ? action.task : t) };
    case 'DELETE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, deletedAt: Date.now() } : t) };
    case 'RESTORE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, deletedAt: null } : t) };
    case 'PURGE_TASK': return { ...state, tasks: state.tasks.filter(t => t.id !== action.id) };
    case 'ADD_POMODORO': return {
      ...state,
      pomodoros: [...state.pomodoros, action.session],
      tasks: state.tasks.map(t => t.id === action.taskId ? { ...t, pomodoros: t.pomodoros + 1 } : t),
    };
    case 'ADD_TAG': if (state.tags.some(t => t.name === action.tag.name)) return state; return { ...state, tags: [...state.tags, action.tag] };
    case 'DELETE_TAG': return { ...state, tags: state.tags.filter(t => t.id !== action.id) };
    case 'SET_THEME': return { ...state, theme: action.theme };
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
}

const TaskContext = createContext<ContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

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

  useEffect(() => {
    document.body.classList.toggle('dark', state.theme === 'dark');
    localStorage.setItem('theme', state.theme);
  }, [state.theme]);

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
      { id: genId(), title: '欢迎使用智能待办', description: '点击右上角 + 创建任务，长按任务可编辑或删除', dueDate: null, priority: 'medium', status: 'todo', recurrence: null, tags: ['入门'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '完成产品需求文档', description: '梳理 V2.0 版本核心功能模块', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), priority: 'high', status: 'in_progress', recurrence: null, tags: ['工作', '产品'], subtasks: [{ id: genId(), title: '竞品分析', done: true, order: 0 }, { id: genId(), title: '功能列表', done: false, order: 1 }, { id: genId(), title: '原型评审', done: false, order: 2 }], dependsOn: [], pomodoros: 3, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '每日阅读 30 分钟', description: '', dueDate: new Date().toISOString().slice(0, 10), priority: 'low', status: 'todo', recurrence: 'daily', tags: ['学习'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '健身房训练', description: '腿日：深蹲 + 硬拉', dueDate: new Date().toISOString().slice(0, 10), priority: 'medium', status: 'todo', recurrence: 'weekly', tags: ['健康'], subtasks: [], dependsOn: [], pomodoros: 1, noteMarkdown: null, createdAt: Date.now() - 2 * 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '回复客户邮件', description: '', dueDate: new Date().toISOString().slice(0, 10), priority: 'high', status: 'done', recurrence: null, tags: ['工作'], subtasks: [], dependsOn: [], pomodoros: 1, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: Date.now(), deletedAt: null },
      { id: genId(), title: '准备周会汇报', description: '本周进度 + 下周计划', dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), priority: 'high', status: 'todo', recurrence: 'weekly', tags: ['工作'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '学习 React 18 新特性', description: 'Concurrent Mode、Suspense、useTransition', dueDate: null, priority: 'medium', status: 'in_progress', recurrence: null, tags: ['学习', '前端'], subtasks: [{ id: genId(), title: '阅读官方文档', done: true, order: 0 }, { id: genId(), title: '写 demo', done: false, order: 1 }], dependsOn: [], pomodoros: 2, noteMarkdown: null, createdAt: Date.now() - 3 * 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
      { id: genId(), title: '整理本月开支', description: '', dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), priority: 'low', status: 'todo', recurrence: 'monthly', tags: ['生活'], subtasks: [], dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now() - 86400000, updatedAt: Date.now(), completedAt: null, deletedAt: null },
    ];
    const demoTags: Tag[] = [
      { id: genId(), name: '工作', color: 'emerald', createdAt: Date.now(), updatedAt: Date.now() },
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
      const updated = { ...existing, ...patch, updatedAt: Date.now() };
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
    async ensureTag(name, color = 'emerald') {
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
      dispatch({ type: 'SET_THEME', theme: state.theme === 'light' ? 'dark' : 'light' });
    },
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTaskStore() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTaskStore must be used within TaskProvider');
  return ctx;
}
