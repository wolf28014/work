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
import AuthSheet from './components/AuthSheet';
import LegalSheet from './components/LegalSheet';
import Toast from './components/Toast';
import PrivacyConsentSheet, { isPrivacyAgreed } from './components/PrivacyConsentSheet';
import {
  getBackgroundSettings,
  getCustomImage,
  resolveBackgroundCss,
  type BackgroundSettings,
} from './lib/background';
import { initAuth, useAuth, mergeLocalToCloud } from './lib/auth';
import { checkUpdateOnLaunch } from './lib/updater';

// 启动时获取实际状态栏高度并设置到 CSS 变量
async function setupStatusBar() {
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#10b981' });
    await StatusBar.setStyle({ style: Style.Light });
    const info = await StatusBar.getInfo();
    if (info && typeof info.height === 'number') {
      document.documentElement.style.setProperty('--safe-top', `${Math.ceil(info.height)}px`);
    }
  } catch (e) {
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
  const [authOpen, setAuthOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState<null | 'privacy' | 'agreement' | 'about' | 'permissions'>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(isPrivacyAgreed());
  const { loading } = useTaskStore();
  const { user, isConfigured } = useAuth();

  // 背景设置
  const [bgSettings, setBgSettings] = useState<BackgroundSettings>(getBackgroundSettings);
  const [customImage, setCustomImage] = useState<string | null>(null);

  // 左右滑动切换 Tab 的手势状态
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  useEffect(() => {
    setupStatusBar();
    getCustomImage().then(setCustomImage).catch(() => {});
    const handler = () => {
      setBgSettings(getBackgroundSettings());
      getCustomImage().then(setCustomImage).catch(() => {});
    };
    window.addEventListener('background-changed', handler);
    // 监听隐私政策同意
    const privacyHandler = () => setPrivacyAgreed(true);
    window.addEventListener('privacy-agreed', privacyHandler);
    return () => {
      window.removeEventListener('background-changed', handler);
      window.removeEventListener('privacy-agreed', privacyHandler);
    };
  }, []);

  // 初始化授权 + 检查更新
  useEffect(() => {
    if (privacyAgreed) {
      initAuth().then(() => {
        checkUpdateOnLaunch().catch(() => {});
      });
    }
  }, [privacyAgreed]);

  // 登录成功后合并本地数据到云端
  async function handleAuthSuccess() {
    try {
      await mergeLocalToCloud();
    } catch (e) {
      console.log('Merge failed:', e);
    }
  }

  const bgResolved = resolveBackgroundCss(bgSettings, customImage);

  function openNewTask() { setEditorTask(null); setEditorOpen(true); }
  function openEditTask(task: any) { setEditorTask(task); setEditorOpen(true); }

  const switchTab = useCallback((direction: 'left' | 'right') => {
    const currentIndex = TABS.findIndex(t => t.id === tab);
    if (direction === 'left') {
      if (currentIndex < TABS.length - 1) setTab(TABS[currentIndex + 1].id);
    } else {
      if (currentIndex > 0) setTab(TABS[currentIndex - 1].id);
    }
  }, [tab]);

  function handleTouchStart(e: React.TouchEvent) {
    if (editorOpen || settingsOpen || aiOpen || authOpen || legalOpen) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartTime.current = Date.now();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || dt > 500) return;
    if (dx < 0) switchTab('left');
    else switchTab('right');
  }

  // 首次启动未同意隐私政策
  if (!privacyAgreed) {
    return <PrivacyConsentSheet />;
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={bgResolved ? { background: bgResolved.css } : {}}
    >
      {bgSettings.type === 'custom' && (
        <div className="absolute inset-0 bg-black/30 pointer-events-none z-0" />
      )}

      <header className="app-header glass sticky top-0 z-30" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => setAIOpen(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-emerald-500/10 active:bg-emerald-500/20 transition-colors"
            aria-label="AI 助手"
          >
            <span className="text-base">✨</span>
            <span className="text-emerald-600 dark:text-emerald-300 text-[13px] font-semibold">AI</span>
          </button>
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

      {/* 登录状态指示（顶部右侧角标，已登录显示头像，未登录显示提示） */}
      {!user && isConfigured && (
        <button
          onClick={() => setAuthOpen(true)}
          className="absolute top-12 right-4 z-30 px-3 py-1.5 bg-emerald-500/90 text-white text-[11px] font-medium rounded-full shadow active:scale-95 transition-transform"
          style={{ marginTop: 'var(--safe-top)' }}
        >
          登录同步
        </button>
      )}

      {editorOpen && (<TaskEditor task={editorTask} onClose={() => setEditorOpen(false)} />)}
      {settingsOpen && (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenLegal={(t) => setLegalOpen(t)}
        />
      )}
      {aiOpen && <AIChatSheet onClose={() => setAIOpen(false)} />}
      {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
      {legalOpen && <LegalSheet type={legalOpen} onClose={() => setLegalOpen(null)} />}
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
