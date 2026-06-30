import { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { TaskProvider, useTaskStore } from './lib/store';
import ListView from './views/ListView';
import KanbanView from './views/KanbanView';
import CalendarView from './views/CalendarView';
import PomodoroView from './views/PomodoroView';
import DashboardView from './views/DashboardView';
import TaskEditor from './components/TaskEditor';
import SettingsSheet from './components/SettingsSheet';
import AIChatSheet from './components/AIChatSheet';
import Toast from './components/Toast';
import {
  getBackgroundSettings,
  getCustomImage,
  resolveBackgroundCss,
  type BackgroundSettings,
} from './lib/background';

// 启动时获取实际状态栏高度并设置到 CSS 变量
async function setupStatusBar() {
  try {
    // 让 webview 内容延伸到状态栏下方
    await StatusBar.setOverlaysWebView({ overlay: false });
    // 设置状态栏背景为翡翠绿
    await StatusBar.setBackgroundColor({ color: '#10b981' });
    await StatusBar.setStyle({ style: Style.Light });
    // 获取状态栏高度
    const info = await StatusBar.getInfo();
    if (info && typeof info.height === 'number') {
      // Capacitor 返回的 height 单位是 dp，转成 px（通常 1:1 在 Android 上）
      document.documentElement.style.setProperty('--safe-top', `${Math.ceil(info.height)}px`);
    }
  } catch (e) {
    // web 环境下会失败，忽略即可
    console.log('StatusBar not available:', e);
  }
}

type Tab = 'list' | 'kanban' | 'calendar' | 'pomodoro' | 'dashboard';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'list', label: '任务', icon: '📋' },
  { id: 'kanban', label: '看板', icon: '📊' },
  { id: 'calendar', label: '日历', icon: '📅' },
  { id: 'pomodoro', label: '番茄钟', icon: '🍅' },
  { id: 'dashboard', label: '统计', icon: '📈' },
];

function Shell() {
  const [tab, setTab] = useState<Tab>('list');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTask, setEditorTask] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiOpen, setAIOpen] = useState(false);
  const { loading } = useTaskStore();

  // 背景设置
  const [bgSettings, setBgSettings] = useState<BackgroundSettings>(getBackgroundSettings);
  const [customImage, setCustomImage] = useState<string | null>(null);

  // 左右滑动切换 Tab 的手势状态
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  useEffect(() => {
    setupStatusBar();
    getCustomImage().then(setCustomImage).catch(() => {});
    const handler = () => {
      setBgSettings(getBackgroundSettings());
      getCustomImage().then(setCustomImage).catch(() => {});
    };
    window.addEventListener('background-changed', handler);
    return () => window.removeEventListener('background-changed', handler);
  }, []);

  const bgResolved = resolveBackgroundCss(bgSettings, customImage);

  function openNewTask() { setEditorTask(null); setEditorOpen(true); }
  function openEditTask(task: any) { setEditorTask(task); setEditorOpen(true); }

  // 切换到指定 Tab（带边界检查）
  const switchTab = useCallback((direction: 'left' | 'right') => {
    const currentIndex = TABS.findIndex(t => t.id === tab);
    if (direction === 'left') {
      // 向左滑 = 看下一个 Tab
      if (currentIndex < TABS.length - 1) {
        setTab(TABS[currentIndex + 1].id);
      }
    } else {
      // 向右滑 = 看上一个 Tab
      if (currentIndex > 0) {
        setTab(TABS[currentIndex - 1].id);
      }
    }
  }, [tab]);

  // 主页面 touch 事件
  function handleTouchStart(e: React.TouchEvent) {
    if (editorOpen || settingsOpen || aiOpen) return; // 子页面打开时不处理
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // 必须是水平方向滑动且距离够
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || dt > 500) return;
    if (isHorizontalSwipe.current === false) return;

    if (dx < 0) {
      switchTab('left'); // 向左滑 = 下一个
    } else {
      switchTab('right'); // 向右滑 = 上一个
    }
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={bgResolved ? { background: bgResolved.css } : {}}
    >
      {/* 自定义图片背景时，加一层半透明遮罩，让卡片更突出 */}
      {bgSettings.type === 'custom' && (
        <div className="absolute inset-0 bg-black/30 pointer-events-none z-0" />
      )}

      <header className="app-header glass sticky top-0 z-30" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => setAIOpen(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-lg active:opacity-60" aria-label="AI 助手">✨</button>
          <h1 className="text-base font-semibold tracking-tight">{TABS.find(t => t.id === tab)?.label}</h1>
          <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-lg active:opacity-60" aria-label="设置">⚙️</button>
        </div>
      </header>

      <main
        className="flex-1 overflow-y-auto no-scrollbar"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400 animate-pulse">加载中…</div>
          </div>
        ) : (
          <div key={tab} className="fade-in">
            {tab === 'list' && <ListView onEdit={openEditTask} onNew={openNewTask} />}
            {tab === 'kanban' && <KanbanView onEdit={openEditTask} onNew={openNewTask} />}
            {tab === 'calendar' && <CalendarView onEdit={openEditTask} onNew={openNewTask} />}
            {tab === 'pomodoro' && <PomodoroView onEdit={openEditTask} />}
            {tab === 'dashboard' && <DashboardView />}
          </div>
        )}
      </main>

      <nav className="tab-bar z-30">
        <div className="flex items-center justify-around px-2 h-14">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all"
              style={{ opacity: tab === t.id ? 1 : 0.55 }}
            >
              <span className="text-xl" style={{ transform: tab === t.id ? 'scale(1.1)' : 'scale(1)' }}>{t.icon}</span>
              <span className={`text-[10px] ${tab === t.id ? 'text-emerald-500 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {tab !== 'pomodoro' && tab !== 'dashboard' && (
        <button
          onClick={openNewTask}
          className="absolute right-4 z-40 w-14 h-14 rounded-full bg-emerald-500 text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"
          style={{ bottom: `calc(72px + var(--safe-bottom))` }}
          aria-label="新建任务"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {editorOpen && (<TaskEditor task={editorTask} onClose={() => setEditorOpen(false)} />)}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {aiOpen && <AIChatSheet onClose={() => setAIOpen(false)} />}
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <TaskProvider>
      <Shell />
    </TaskProvider>
  );
}
