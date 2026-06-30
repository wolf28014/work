import { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapacitorApp } from '@capacitor/app';
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
import Toast, { showToast } from './components/Toast';
import PrivacyConsentSheet, { isPrivacyAgreed } from './components/PrivacyConsentSheet';
import {
  getBackgroundSettings,
  getCustomImage,
  resolveBackgroundCss,
  type BackgroundSettings,
} from './lib/background';
import { initAuth, useAuth, mergeLocalToCloud } from './lib/auth';
import { checkUpdateOnLaunch, getCachedUpdateInfo } from './lib/updater';

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
  const [tabDirection, setTabDirection] = useState<'left' | 'right'>('left');
  const [pomodoroTaskId, setPomodoroTaskId] = useState<string>('');
  const [updateBanner, setUpdateBanner] = useState(getCachedUpdateInfo());
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
        checkUpdateOnLaunch().then(() => {
          // 检查完成后更新 banner
          setUpdateBanner(getCachedUpdateInfo());
        }).catch(() => {});
      });
    }
  }, [privacyAgreed]);

  // 监听系统返回键（含 MIUI/系统手势的边缘滑动返回）
  // 子页面（SwipeableSheet）会自己监听并优先处理，这里只处理"没有子页面"的情况
  useEffect(() => {
    const handleBackButton = ({ canGoBack }: { canGoBack: boolean }) => {
      // 如果有任何子页面打开，让 SwipeableSheet 自己处理（它也监听了 backButton）
      // 这里只在没有子页面时退出 App
      const hasOpenSheet = legalOpen || authOpen || aiOpen || settingsOpen || editorOpen;
      if (hasOpenSheet) {
        // 子页面会自己关闭，这里不做任何事
        return;
      }
      // 没有子页面打开时，退出 App
      if (canGoBack) {
        CapacitorApp.exitApp();
      }
    };
    const listener = CapacitorApp.addListener('backButton', handleBackButton);
    return () => { listener.then(l => l.remove()); };
  }, [legalOpen, authOpen, aiOpen, settingsOpen, editorOpen]);

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
      if (currentIndex < TABS.length - 1) {
        setTabDirection('left');  // 新 Tab 从右侧滑入
        setTab(TABS[currentIndex + 1].id);
      }
    } else {
      if (currentIndex > 0) {
        setTabDirection('right');  // 新 Tab 从左侧滑入
        setTab(TABS[currentIndex - 1].id);
      }
    }
  }, [tab]);

  // 主页面：任意位置左右滑动切换 Tab（不限边缘）
  // 向左滑（手指向左）→ 下一个 Tab
  // 向右滑（手指向右）→ 上一个 Tab
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
    // 必须横向滑动且距离够（80px），垂直距离不超过水平
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.8 || dt > 600) return;
    if (dx < 0) switchTab('left');  // 向左滑 → 下一个
    else switchTab('right');        // 向右滑 → 上一个
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

      {/* 有新版本时显示更新提醒横幅 */}
      {updateBanner && (
        <div className="mx-3 mt-2 ios-card p-2.5 bg-emerald-50 dark:bg-emerald-900/40 fade-in flex items-center gap-2">
          <span className="text-emerald-500 text-base">✨</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
              发现新版本 v{updateBanner.version}
            </div>
          </div>
          <button
            onClick={() => {
              window.open(updateBanner.url, '_blank');
              showToast('正在跳转浏览器下载…', 'info');
            }}
            className="px-3 py-1.5 bg-emerald-500 text-white rounded-full text-[11px] font-semibold active:scale-95 transition-transform whitespace-nowrap"
          >📥 下载新版本</button>
          <button
            onClick={() => setUpdateBanner(null)}
            className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center flex-shrink-0"
          >×</button>
        </div>
      )}

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
          <div
            key={tab}
            className={tabDirection === 'left' ? 'tab-slide-in-left' : 'tab-slide-in-right'}
          >
            {tab === 'list' && <ListView onEdit={openEditTask} onNew={openNewTask} onStartPomodoro={(t) => {
              setPomodoroTaskId(t.id);
              setTabDirection('left');
              setTab('pomodoro');
            }} />}
            {tab === 'kanban' && <KanbanView onEdit={openEditTask} onNew={openNewTask} onStartPomodoro={(t) => {
              setPomodoroTaskId(t.id);
              setTabDirection('left');
              setTab('pomodoro');
            }} />}
            {tab === 'calendar' && <CalendarView onEdit={openEditTask} onNew={openNewTask} />}
            {tab === 'pomodoro' && <PomodoroView onEdit={openEditTask} initialTaskId={pomodoroTaskId} />}
            {tab === 'dashboard' && <DashboardView />}
          </div>
        )}
      </main>

      <nav className="tab-bar z-30">
        <div className="flex items-center justify-around px-2 h-14">
          {TABS.map((t, idx) => {
            const currentIdx = TABS.findIndex(x => x.id === tab);
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTabDirection(idx > currentIdx ? 'left' : 'right');
                  setTab(t.id);
                }}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all"
                style={{ opacity: tab === t.id ? 1 : 0.55 }}
              >
                <span className="text-xl" style={{ transform: tab === t.id ? 'scale(1.1)' : 'scale(1)' }}>{t.icon}</span>
                <span className={`text-[10px] ${tab === t.id ? 'text-emerald-500 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>{t.label}</span>
              </button>
            );
          })}
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
