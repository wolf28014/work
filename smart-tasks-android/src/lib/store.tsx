import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import type { Task, PomodoroSession, Tag } from './db';
import { getAllTasks, saveTask, deleteTaskPermanent, getAllPomodoros, addPomodoroSession, getAllTags, saveTag, deleteTag as deleteTagDB } from './db';
import { genId } from './db';
import { generateNextRecurrence } from './task-utils';
import { syncTaskToCloud, syncPomodoroToCloud, syncTagToCloud, deleteTagFromCloud, deleteTaskFromCloud, useAuth, subscribeRealtime, unsubscribeRealtime } from './auth';
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
  ensureTag: (name: string, color?: string) => Promise<Tag | null>;
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
        if (tasks.length === 0) {
          // v6.6 — 修复 #8：只有从未 seed 过的设备才 seed，避免用户清空后重启又出现 demo
          if (!localStorage.getItem('smart-tasks-seeded')) {
            await seedDemoData();
            localStorage.setItem('smart-tasks-seeded', '1');
          }
        } else {
          // v6.6 — 修复 #26：用 localStorage 标记而不是字符串嗅探
          // 老用户升级后，如果 welcome 任务存在且未升级到 v6.5.1 版本，自动升级
          if (!localStorage.getItem('welcome-upgraded-v651')) {
            await maybeUpgradeWelcomeTask(tasks);
            localStorage.setItem('welcome-upgraded-v651', '1');
          }
        }
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

  // v6.6 — 修复 #32：30 天清理节流，每小时跑一次而不是每次 tasks 变化都跑
  const lastPurgeRef = useRef(0);
  useEffect(() => {
    if (state.tasks.length === 0) return;
    const now = Date.now();
    if (now - lastPurgeRef.current < 3600000) return;  // 1 小时内已跑过
    lastPurgeRef.current = now;
    const cutoff = now - 30 * 86400000;
    state.tasks.forEach(async t => {
      if (t.deletedAt && t.deletedAt < cutoff) {
        await deleteTaskPermanent(t.id);
        dispatch({ type: 'PURGE_TASK', id: t.id });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks]);

  // v6.5.1 — 老用户升级后，把"欢迎使用智能待办"任务的旧短文本升级成详细使用说明
  // 判断条件：title 是"欢迎使用智能待办"且 description 不是新版本（不含"## 📋 任务管理"）
  // 同时确保它有 6 个引导子任务
  const WELCOME_NEW_DESC = '这是一款集任务管理、番茄钟、笔记、AI 助手于一体的效率工具。下面按模块介绍使用方法。\n\n## 📋 任务管理（任务页）\n\n- **创建任务**：点击右上角 +，先选模板（空白/工作/学习/生活），再填写标题、描述、日期、优先级\n- **日期模式**（v6.5 新功能）：\n  - 「那天完成」—— 单点任务，只在截止日显示\n  - 「那天之前完成」—— 区间任务，起始日到截止日每天都显示在日历上\n- **重复任务**：每天/每周/每月自动循环，完成后自动生成下一期\n- **子任务**：在任务详情里添加子任务，支持勾选\n- **状态切换**：待办 / 进行中 / 已完成 / 已取消\n- **操作**：左滑快速完成，长按编辑，右滑删除\n\n## 📅 日历视图\n\n- 普通任务在截止日显示圆点\n- 区间任务在起止区间内每天显示\n- 重复任务按规则展开（每日/每周/每月）\n- 已完成任务在完成日显示绿色打卡点\n- 红色右上角点 = 逾期未完成\n\n## 🍅 番茄钟\n\n- 选择一个任务，开始专注 25 分钟\n- 完成自动记录到任务，可累积统计\n- 支持长休息、短休息\n\n## 📝 笔记（v6.0）\n\n- 独立的笔记功能，支持 Markdown 语法\n- 可置顶、搜索、批量操作\n- 登录后多端实时同步\n\n## 🤖 AI 助手\n\n- 自然语言创建任务：「明天下午 3 点开会」AI 自动解析\n- 智能拆解任务为子任务\n- 需在设置里配置 API Key\n\n## ☁️ 多端同步\n\n- 设置 → 登录账号\n- 任务、笔记、番茄钟、标签全量同步\n- 支持 Web 端（wolf28014.github.io/work）和 Android App\n- 实时同步 + 30 秒轮询兜底\n\n## 💡 小技巧\n\n- PC 端有侧边栏，支持键盘快捷键\n- 长按任务卡有快捷操作菜单\n- 设置里有 10 套主题可切换\n\n---\n\n这条任务本身就是一个子任务演示，可以勾选下面的子任务逐个体验：';
  const WELCOME_NEW_SUBTASKS = [
    { title: '点右上角 + 创建第一个任务', order: 0 },
    { title: '切到日历页看看任务展示', order: 1 },
    { title: '试试番茄钟专注 25 分钟', order: 2 },
    { title: '在笔记页新建一条笔记', order: 3 },
    { title: '设置里登录账号开启同步', order: 4 },
    { title: '把这条任务标记为已完成', order: 5 },
  ];

  async function maybeUpgradeWelcomeTask(existingTasks: Task[]) {
    const welcome = existingTasks.find(t => !t.deletedAt && t.title === '欢迎使用智能待办');
    if (!welcome) return;
    // 判断是否需要升级：description 不含新版本标识
    const needsUpgrade = !welcome.description.includes('## 📋 任务管理');
    if (!needsUpgrade) return;
    const updated: Task = {
      ...welcome,
      description: WELCOME_NEW_DESC,
      // 保留用户已勾选的子任务状态，但补充缺失的子任务
      subtasks: WELCOME_NEW_SUBTASKS.map(s => {
        const existing = welcome.subtasks.find(st => st.title === s.title);
        return existing || { id: genId(), title: s.title, done: false, order: s.order };
      }),
      priority: 'high',
      status: welcome.status === 'done' ? 'done' : 'in_progress',
      updatedAt: Date.now(),
    };
    await saveTask(updated);
    dispatch({ type: 'UPDATE_TASK', task: updated });
    syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
  }

  async function seedDemoData() {
    const demoTasks: Task[] = [
      { id: genId(), title: '欢迎使用智能待办', description: WELCOME_NEW_DESC, dueDate: null, startDate: null, priority: 'high', status: 'in_progress', recurrence: null, tags: ['入门'], subtasks: WELCOME_NEW_SUBTASKS.map(s => ({ id: genId(), title: s.title, done: false, order: s.order })), dependsOn: [], pomodoros: 0, noteMarkdown: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, deletedAt: null },
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
        // v6.6 — 修复 #45：用 ?? 代替 ||，避免 '' 误判
        startDate: partial.recurrence ? null : (partial.startDate ?? null),
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
          // v6.6 — 修复子任务未重置 bug：新实例的子任务要全部重置为未完成，并重新生成 id 避免云端冲突
          const newInstance: Task = {
            ...existing,
            id: genId(),
            status: 'todo',
            completedAt: null,
            deletedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pomodoros: 0,
            subtasks: existing.subtasks.map(s => ({ ...s, id: genId(), done: false })),
            ...next,
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
      // v6.6 — 修复 deletedAt 不一致：用同一个 timestamp，只 dispatch 一次 UPDATE_TASK
      const now = Date.now();
      const updated = { ...existing, deletedAt: now, updatedAt: now };
      await saveTask(updated);
      dispatch({ type: 'UPDATE_TASK', task: updated });
      syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async restoreTask(id) {
      const existing = state.tasks.find(t => t.id === id);
      if (!existing) return;
      const updated = { ...existing, deletedAt: null, updatedAt: Date.now() };
      await saveTask(updated);
      dispatch({ type: 'UPDATE_TASK', task: updated });
      syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
    },
    async purgeTask(id) {
      // v6.6 — 修复回收站复活 bug：彻底删除时同时删云端，否则下次 syncFromCloud 会拉回来
      await deleteTaskPermanent(id);
      dispatch({ type: 'PURGE_TASK', id });
      deleteTaskFromCloud(id).catch(e => console.log('Cloud delete failed:', e));
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
      // v6.6 — 修复 #21：空名返回 null 而不是 state.tags[0]（可能 undefined）
      if (!cleaned) return null;
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
      // v6.6 — 修复 #33：并行处理任务的 tag 移除（之前串行 await）
      const tasksToUpdate = state.tasks
        .filter(t => !t.deletedAt && t.tags.includes(tag.name))
        .map(t => {
          const updated = { ...t, tags: t.tags.filter(tn => tn !== tag.name), updatedAt: Date.now() };
          return updated;
        });
      await Promise.all(tasksToUpdate.map(async updated => {
        await saveTask(updated);
        dispatch({ type: 'UPDATE_TASK', task: updated });
        syncTaskToCloud(updated).catch(e => console.log('Sync failed:', e));
      }));
      await deleteTagDB(id);
      dispatch({ type: 'DELETE_TAG', id });
      deleteTagFromCloud(id).catch(e => console.log('Sync failed:', e));
    },
    toggleTheme() {
      // v6.1 — toggle between the current dark theme and the last-used light theme.
      // v6.6 — 修复 #34：删除冗余的 if (!isDarkTheme) 判断（else 分支必然不是 dark）
      if (isDarkTheme(state.appTheme)) {
        const lastLight = getLastLightThemeId();
        dispatch({ type: 'SET_APP_THEME', appTheme: lastLight });
      } else {
        // remember current light theme before switching to dark
        localStorage.setItem('last-light-theme', state.appTheme);
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
