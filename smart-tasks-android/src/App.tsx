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
import ProSheet from './components/ProSheet';
import Toast, { showToast } from './components/Toast';
import SwipeableSheet, { hasActiveSheet } from './components/SwipeableSheet';
import PrivacyConsentSheet, { isPrivacyAgreed } from './components/PrivacyConsentSheet';
import {
  getBackgroundSettings,
  getCustomImage,
  resolveBackgroundCss,
} from './lib/background';
import { initAuth, useAuth, mergeLocalToCloud } from './lib/auth';
import { checkUpdateOnLaunch, getCachedUpdateInfo } from './lib/updater';
import { todayStr, isOverdue } from './lib/task-utils';

// 启动时配置状态栏，匹配深色玻璃设计
async function setupStatusBar(isDark: boolean) {
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: isDark ? '#0B0F0E' : '#F5F5F7' });
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    const info = await StatusBar.getInfo();
    if (info && typeof info.height === 'number') {
      document.documentElement.style.setProperty('--safe-top', `${Math.ceil(info.height)}px`);
    }
  } catch (e) {
    console.log('StatusBar not available:', e);
  }
}

type Tab = 'list' | 'kanban' | 'calendar' | 'pomodoro' | 'dashboard';

const TABS: { id: Tab; label: string; icon: string; glyph: string }[] = [
  { id: 'list',      label: '任务',  icon: '✦',  glyph: 'M4 6h16M4 12h10M4 18h7' },
  { id: 'kanban',    label: '看板',  icon: '▦',  glyph: 'M4 5h6v14H4zM14 5h6v8h-6zM14 15h6v4h-6z' },
  { id: 'calendar',  label: '日历',  icon: '◔',  glyph: 'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4' },
  { id: 'pomodoro',  label: '专注',  icon: '◉',  glyph: 'M12 4a8 8 0 1 0 8 8M12 12l5-3' },
  { id: 'dashboard', label: '统计',  icon: '◢',  glyph: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
];

function getGreeting(d = new Date()): { title: string; sub: string } {
  const h = d.getHours();
  let title = '晚上好';
  if (h < 5)        title = '夜深了';
  else if (h < 11)  title = '早上好';
  else if (h < 14)  title = '中午好';
  else if (h < 18)  title = '下午好';
  return { title, sub: '今天也要保持专注' };
}

function TabIcon({ tab, active }: { tab: { glyph: string }; active: boolean }) {
  return (
    <svg
      width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--primary)' : 'var(--text-secondary)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'stroke 0.2s, transform 0.2s', transform: active ? 'translateY(-1px) scale(1.05)' : 'none' }}
    >
      <path d={tab.glyph} />
    </svg>
  );
}

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
  const [proOpen, setProOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState<null | 'privacy' | 'agreement' | 'about' | 'permissions'>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(isPrivacyAgreed());
  const { loading, tasks, theme } = useTaskStore();
  const { user, pro, isConfigured } = useAuth();

  // 背景设置（仅在用户自定义图片时作为底层叠加；v3 默认使用深色玻璃）
  const [bgSettings, setBgSettings] = useState(getBackgroundSettings);
  const [customImage, setCustomImage] = useState<string | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  useEffect(() => {
    setupStatusBar(theme === 'dark');
    getCustomImage().then(setCustomImage).catch(() => {});
    const handler = () => {
      setBgSettings(getBackgroundSettings());
      getCustomImage().then(setCustomImage).catch(() => {});
    };
    window.addEventListener('background-changed', handler);
    const privacyHandler = () => setPrivacyAgreed(true);
    window.addEventListener('privacy-agreed', privacyHandler);
    return () => {
      window.removeEventListener('background-changed', handler);
      window.removeEventListener('privacy-agreed', privacyHandler);
    };
  }, []);

  // theme 变化时重新设置状态栏
  useEffect(() => {
    setupStatusBar(theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (privacyAgreed) {
      initAuth().then(() => {
        checkUpdateOnLaunch().then(() => {
          setUpdateBanner(getCachedUpdateInfo());
        }).catch(() => {});
      });
    }
  }, [privacyAgreed]);

  useEffect(() => {
    const handleBackButton = ({ canGoBack }: { canGoBack: boolean }) => {
      if (hasActiveSheet()) return;
      if (canGoBack) CapacitorApp.exitApp();
    };
    const listener = CapacitorApp.addListener('backButton', handleBackButton);
    return () => { listener.then(l => l.remove()); };
  }, []);

  async function handleAuthSuccess() {
    try {
      // 登录成功后自动合并本地数据到云端
      await mergeLocalToCloud();
      // 后续每次创建/编辑/删除任务，store 里已经自动调用 syncTaskToCloud
      // 实时同步无需额外处理
    } catch (e) { console.log('Merge failed:', e); }
  }

  function openNewTask() { setEditorTask(null); setEditorOpen(true); }
  function openEditTask(task: any) { setEditorTask(task); setEditorOpen(true); }

  // 取消左右滑切换 Tab（与任务卡片滑动手势冲突）
  // Tab 切换只通过点击底部 Tab Bar

  if (!privacyAgreed) {
    return <PrivacyConsentSheet />;
  }

  // 顶部问候 + 今日任务摘要
  const greeting = getGreeting();
  const today = todayStr();
  const todayTasks = tasks.filter(t => !t.deletedAt && t.dueDate === today && t.status !== 'done' && t.status !== 'cancelled');
  const overdueCount = tasks.filter(t => !t.deletedAt && isOverdue(t)).length;
  const completedToday = tasks.filter(t => !t.deletedAt && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()).length;

  // 解析背景设置
  const bgResolved = resolveBackgroundCss(bgSettings, customImage);
  const showCustomBg = bgSettings.type === 'custom' && customImage;
  const showPresetBg = bgSettings.type === 'preset' && bgResolved;
  const hasCustomBg = showCustomBg || showPresetBg;

  // 有自定义/预设背景时，顶栏和底栏改为更透明的毛玻璃
  const barStyle = hasCustomBg
    ? { background: 'var(--bar-bg)', backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)' }
    : undefined;

  return (
    <div className="flex flex-col h-screen overflow-hidden relative" style={showPresetBg ? { background: bgResolved!.css } : showCustomBg ? {} : {}}>
      {/* 底层：用户自定义图片（全局覆盖） */}
      {showCustomBg && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{ background: `url(${customImage}) center/cover no-repeat fixed` }}
        />
      )}

      <header className="app-header sticky top-0 z-30" style={{ paddingTop: 'var(--safe-top)', ...(barStyle || {}) }}>
        <div className="px-5 pt-2 pb-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {greeting.title}
                </h1>
                <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>· {greeting.sub}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pro?.isPro ? (
                <button
                  onClick={() => setProOpen(true)}
                  className="flex items-center gap-1 px-3 h-9 rounded-full active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', color: '#06140F', boxShadow: '0 4px 14px var(--primary-glow)' }}
                >
                  <span className="text-[12px] font-bold">PRO</span>
                </button>
              ) : (
                <button
                  onClick={() => setProOpen(true)}
                  className="flex items-center gap-1 px-3 h-9 rounded-full active:scale-95 transition-transform"
                  style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)', color: 'var(--primary)' }}
                >
                  <span className="text-[12px]">✦</span>
                  <span className="text-[12px] font-bold">升级</span>
                </button>
              )}
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                aria-label="设置"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>

          {/* 今日摘要条 */}
          <div className="flex items-center gap-2 mt-3 -mx-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 px-3 py-2 rounded-full mx-1" style={{ background: 'rgba(46,230,166,0.10)', border: '1px solid var(--primary-border)' }}>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>今日</span>
              <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{todayTasks.length}</span>
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-full mx-1" style={{ background: 'rgba(255,110,127,0.10)', border: '1px solid rgba(255,110,127,0.3)' }}>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--pri-high)' }}>逾期</span>
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{overdueCount}</span>
              </div>
            )}
            {completedToday > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-full mx-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>已完成</span>
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{completedToday}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 更新提醒横幅 */}
      {updateBanner && (
        <div className="mx-4 mt-2 v3-card p-3 fade-in flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <span style={{ color: 'var(--primary)' }}>✦</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              发现新版本 v{updateBanner.version}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              点击下载，体验更多新功能
            </div>
          </div>
          <button
            onClick={() => {
              window.open(updateBanner.url, '_blank');
              showToast('正在跳转浏览器下载…', 'info');
            }}
            className="px-3 py-1.5 rounded-full text-[12px] font-bold active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', color: '#06140F' }}
          >下载</button>
          <button
            onClick={() => setUpdateBanner(null)}
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--card)', color: 'var(--text-secondary)' }}
          >×</button>
        </div>
      )}

      <main
        className="flex-1 overflow-y-auto no-scrollbar"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--primary)', animation: 'spinSlow 1s linear infinite' }} />
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>加载中…</div>
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

      {/* 浮动 AI 按钮（左下角，与新建任务按钮分开） */}
      <button
        onClick={() => setAIOpen(true)}
        className="absolute left-4 z-40 w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform float-y"
        style={{
          bottom: `calc(76px + var(--safe-bottom))`,
          background: 'rgba(139, 124, 255, 0.16)',
          border: '1px solid rgba(139, 124, 255, 0.35)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(139, 124, 255, 0.25)',
        }}
        aria-label="AI 助手"
      >
        <span style={{ fontSize: 20, background: 'linear-gradient(135deg, var(--accent-violet), var(--primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>✦</span>
      </button>

      {/* 新建任务浮动按钮（右下角） */}
      {tab !== 'pomodoro' && tab !== 'dashboard' && (
        <button
          onClick={openNewTask}
          className="absolute right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{
            bottom: `calc(72px + var(--safe-bottom))`,
            background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))',
            color: '#06140F',
            boxShadow: 'var(--shadow-fab)',
          }}
          aria-label="新建任务"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {/* 新版浮动 Tab 栏 */}
      <nav className="tab-bar z-30" style={barStyle || {}}>
        <div className="flex items-center justify-around px-3 h-16">
          {TABS.map((t, idx) => {
            const currentIdx = TABS.findIndex(x => x.id === tab);
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTabDirection(idx > currentIdx ? 'left' : 'right');
                  setTab(t.id);
                }}
                className="flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all relative"
                style={{ opacity: isActive ? 1 : 0.55 }}
              >
                <div
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{
                    width: isActive ? 44 : 32,
                    height: isActive ? 44 : 32,
                    background: isActive ? 'var(--primary-soft)' : 'transparent',
                    border: isActive ? '1px solid var(--primary-border)' : '1px solid transparent',
                  }}
                >
                  <TabIcon tab={t} active={isActive} />
                </div>
                <span
                  className="text-[10px] font-semibold transition-colors"
                  style={{ color: isActive ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 未登录提示 */}
      {!user && isConfigured && (
        <button
          onClick={() => setAuthOpen(true)}
          className="absolute right-4 z-30 px-3 py-1.5 text-[11px] font-medium rounded-full active:scale-95 transition-transform"
          style={{
            top: `calc(var(--safe-top) + 56px)`,
            background: 'var(--primary-soft)',
            border: '1px solid var(--primary-border)',
            color: 'var(--primary)',
          }}
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
      {proOpen && <ProSheet onClose={() => setProOpen(false)} />}
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
