import { useState, useEffect, useRef } from 'react';
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

// 启动时配置状态栏，匹配当前主题
async function setupStatusBar(isDark: boolean) {
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: isDark ? '#0f0f1a' : '#f5f5f7' });
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch (e) {
    console.log('StatusBar not available:', e);
  }
}

type Tab = 'list' | 'kanban' | 'calendar' | 'pomodoro' | 'dashboard';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'list',      label: '任务',  glyph: 'M4 6h16M4 12h10M4 18h7' },
  { id: 'kanban',    label: '看板',  glyph: 'M4 5h6v14H4zM14 5h6v8h-6zM14 15h6v4h-6z' },
  { id: 'calendar',  label: '日历',  glyph: 'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4' },
  { id: 'pomodoro',  label: '专注',  glyph: 'M12 4a8 8 0 1 0 8 8M12 12l5-3' },
  { id: 'dashboard', label: '统计',  glyph: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
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

function TabIcon({ glyph, active }: { glyph: string; active: boolean }) {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--primary)' : 'var(--text-secondary)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'stroke 0.2s' }}
    >
      <path d={glyph} />
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
  const [privacyAgreed, setPrivacyAgreed] = useState(true); // 默认跳过隐私政策
  const { loading, tasks, theme } = useTaskStore();
  const { user, pro, isConfigured } = useAuth();

  // 背景设置（全局生效）
  const [bgSettings, setBgSettings] = useState(getBackgroundSettings);
  const [customImage, setCustomImage] = useState<string | null>(null);

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

  // 系统返回键监听（无活动 Sheet 时退出 App）
  // 暂时禁用 backButton listener（排查黑屏问题）
  useEffect(() => {
    // do nothing
  }, []);

  async function handleAuthSuccess() {
    try {
      await mergeLocalToCloud();
    } catch (e) { console.log('Merge failed:', e); }
  }

  function openNewTask() { setEditorTask(null); setEditorOpen(true); }
  function openEditTask(task: any) { setEditorTask(task); setEditorOpen(true); }

  function switchTab(newTab: Tab) {
    const currentIdx = TABS.findIndex(x => x.id === tab);
    const newIdx = TABS.findIndex(x => x.id === newTab);
    setTabDirection(newIdx > currentIdx ? 'left' : 'right');
    setTab(newTab);
  }

  if (!privacyAgreed) {
    return <PrivacyConsentSheet />;
  }

  // 顶部问候
  const greeting = getGreeting();
  const today = todayStr();
  const todayTasks = tasks.filter(t => !t.deletedAt && t.dueDate === today && t.status !== 'done' && t.status !== 'cancelled');
  const overdueCount = tasks.filter(t => !t.deletedAt && isOverdue(t)).length;
  const completedToday = tasks.filter(t => !t.deletedAt && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()).length;

  // 解析背景设置 — 深色模式时不显示背景颜色
  const bgResolved = resolveBackgroundCss(bgSettings, customImage);
  const showCustomBg = bgSettings.type === 'custom' && customImage && theme !== 'dark';
  const showPresetBg = bgSettings.type === 'preset' && bgResolved && theme !== 'dark';
  const hasCustomBg = showCustomBg || showPresetBg;

  // 有自定义/预设背景时，动态设置 body 背景为透明，让根 div 的背景显示
  useEffect(() => {
    if (hasCustomBg) {
      document.body.style.background = 'transparent';
    } else {
      document.body.style.background = '';
    }
  }, [hasCustomBg, theme]);

  // 有自定义/预设背景时，顶栏和底栏改为半透明毛玻璃
  const barStyle = hasCustomBg
    ? { background: theme === 'dark' ? 'rgba(15,15,26,0.65)' : 'rgba(255,255,255,0.65)', backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)' }
    : undefined;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={showPresetBg ? { background: bgResolved!.css, minHeight: '100vh' } : showCustomBg ? { minHeight: '100vh' } : {}}
    >
      {/* 底层：用户自定义图片（全局覆盖） */}
      {showCustomBg && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{ background: `url(${customImage}) center/cover no-repeat fixed` }}
        />
      )}

      {/* iOS-style 顶栏：AI 按钮（左）+ 标题（中）+ 设置/Pro（右） */}
      <header className="app-header sticky top-0 z-30" style={{ paddingTop: 'var(--safe-top)', ...(barStyle || {}) }}>
        <div className="px-4 pt-2 pb-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* 左侧：AI 按钮 */}
            <button
              onClick={() => setAIOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
              style={{
                background: 'var(--primary-soft)',
                border: '1px solid var(--primary-border)',
              }}
              aria-label="AI 助手"
            >
              <span style={{ fontSize: 16, color: 'var(--primary)', fontWeight: 700 }}>✦</span>
            </button>

            {/* 中间：问候 + 日期 */}
            <div className="flex-1 min-w-0 text-center">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
              </div>
              <div className="flex items-baseline justify-center gap-1.5 mt-0.5">
                <h1 className="text-[17px] font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                  {greeting.title}
                </h1>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>· {greeting.sub}</span>
              </div>
            </div>

            {/* 右侧：Pro + 设置 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {pro?.isPro ? (
                <button
                  onClick={() => setProOpen(true)}
                  className="flex items-center gap-1 px-2.5 h-9 rounded-full active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', color: '#ffffff', boxShadow: '0 4px 12px var(--primary-glow)' }}
                >
                  <span className="text-[11px] font-bold">PRO</span>
                </button>
              ) : (
                <button
                  onClick={() => setProOpen(true)}
                  className="flex items-center gap-1 px-2.5 h-9 rounded-full active:scale-95 transition-transform"
                  style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)', color: 'var(--primary)' }}
                >
                  <span className="text-[11px]">✦</span>
                  <span className="text-[11px] font-bold">升级</span>
                </button>
              )}
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
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
          <div className="flex items-center gap-2 mt-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)' }}>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>今日</span>
              <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{todayTasks.length}</span>
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--pri-high-soft)', border: '1px solid var(--pri-high)' + '40' }}>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--pri-high)' }}>逾期</span>
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{overdueCount}</span>
              </div>
            )}
            {completedToday > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>已完成</span>
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{completedToday}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 更新提醒横幅 */}
      {updateBanner && (
        <div className="mx-4 mt-2 ios-card p-3 fade-in flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <span style={{ color: 'var(--primary)', fontSize: 16, fontWeight: 700 }}>✦</span>
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
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', color: '#ffffff' }}
          >下载</button>
          <button
            onClick={() => setUpdateBanner(null)}
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >×</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar">
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
              switchTab('pomodoro');
            }} />}
            {tab === 'kanban' && <KanbanView onEdit={openEditTask} onNew={openNewTask} onStartPomodoro={(t) => {
              setPomodoroTaskId(t.id);
              switchTab('pomodoro');
            }} />}
            {tab === 'calendar' && <CalendarView onEdit={openEditTask} onNew={openNewTask} />}
            {tab === 'pomodoro' && <PomodoroView onEdit={openEditTask} initialTaskId={pomodoroTaskId} />}
            {tab === 'dashboard' && <DashboardView onOpenPro={() => setProOpen(true)} />}
          </div>
        )}
      </main>

      {/* 新建任务浮动按钮（右下角） */}
      {tab !== 'pomodoro' && tab !== 'dashboard' && (
        <button
          onClick={openNewTask}
          className="absolute right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{
            bottom: `calc(72px + var(--safe-bottom))`,
            background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))',
            color: '#ffffff',
            boxShadow: 'var(--shadow-fab)',
          }}
          aria-label="新建任务"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {/* iOS 风格底部 Tab Bar */}
      <nav className="tab-bar z-30" style={barStyle || {}}>
        <div className="flex items-center justify-around px-2" style={{ height: 56 }}>
          {TABS.map(t => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full active:scale-95 transition-transform"
                style={{ opacity: isActive ? 1 : 0.55 }}
              >
                <TabIcon glyph={t.glyph} active={isActive} />
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
