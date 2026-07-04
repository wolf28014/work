import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useTaskStore } from '../lib/store';
import {
  STATUS_LABELS, STATUS_ORDER, PRIORITY_LABELS, todayStr,
} from '../lib/task-utils';
import { generateWeeklyReport, aiGoalBreakdown, getAISettings } from '../lib/ai-client';
import { useAuth } from '../lib/auth';
import { showToast } from '../components/Toast';

// 状态 → 设计 token
const STATUS_TOKEN: Record<string, { dot: string; soft: string; text: string }> = {
  todo:        { dot: 'var(--stat-todo)',       soft: 'rgba(91,200,255,0.16)',  text: 'var(--accent-sky)' },
  in_progress: { dot: 'var(--stat-progress)',   soft: 'rgba(245,181,68,0.16)',  text: 'var(--accent-amber)' },
  done:        { dot: 'var(--stat-done)',       soft: 'var(--primary-soft)',    text: 'var(--primary)' },
  cancelled:   { dot: 'var(--stat-cancelled)',  soft: 'var(--card-hover)', text: 'var(--text-secondary)' },
};

const PRI_TOKEN: Record<string, { dot: string; soft: string; text: string }> = {
  high:   { dot: 'var(--pri-high)',    soft: 'var(--pri-high-soft)',    text: 'var(--pri-high)' },
  medium: { dot: 'var(--pri-medium)',  soft: 'var(--pri-medium-soft)',  text: 'var(--pri-medium)' },
  low:    { dot: 'var(--pri-low)',     soft: 'var(--pri-low-soft)',     text: 'var(--pri-low)' },
};

// 数字 count-up 动画（简单实现）
function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const startTs = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (value - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="count-up">{display}</span>;
}

interface Props {
  onOpenPro?: () => void;
}

export default function DashboardView({ onOpenPro }: Props) {
  const { tasks, pomodoros, tags } = useTaskStore();
  const { pro } = useAuth();
  const [report, setReport] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  // v6.7 — AI 目标拆解
  const [goalInput, setGoalInput] = useState('');
  const [goalTimeframe, setGoalTimeframe] = useState('3 个月');
  const [goalResult, setGoalResult] = useState('');
  const [goalLoading, setGoalLoading] = useState(false);

  const stats = useMemo(() => {
    const active = tasks.filter(t => !t.deletedAt);
    const today = todayStr();
    const counts = {
      total: active.length,
      done: active.filter(t => t.status === 'done').length,
      inProgress: active.filter(t => t.status === 'in_progress').length,
      todo: active.filter(t => t.status === 'todo').length,
      overdue: active.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled').length,
      completionRate: active.length > 0 ? Math.round(active.filter(t => t.status === 'done').length / active.length * 100) : 0,
    };
    const statusDist = STATUS_ORDER.map(s => ({
      status: s, label: STATUS_LABELS[s],
      count: active.filter(t => t.status === s).length,
      token: STATUS_TOKEN[s],
    }));
    const priorityDist = (['high', 'medium', 'low'] as const).map(p => ({
      priority: p, label: PRIORITY_LABELS[p],
      count: active.filter(t => t.priority === p).length,
      token: PRI_TOKEN[p],
    }));
    const dailyPomodoros = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - i));
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      return { date: day, count: pomodoros.filter(p => p.endedAt >= dayStart && p.endedAt < dayEnd).length };
    });
    const totalFocusMinutes = Math.round(pomodoros.reduce((s, p) => s + p.duration, 0) / 60);
    const tagCounts = new Map<string, number>();
    active.forEach(t => t.tags.forEach(tg => tagCounts.set(tg, (tagCounts.get(tg) || 0) + 1)));
    const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, count, color: tags.find(t => t.name === name)?.color || 'violet' }));
    const dailyCompleted = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - i));
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      return { date: day, count: active.filter(t => t.completedAt && t.completedAt >= dayStart && t.completedAt < dayEnd).length };
    });
    return { counts, statusDist, priorityDist, dailyPomodoros, totalPomodoros: pomodoros.length, totalFocusMinutes, topTags, dailyCompleted };
  }, [tasks, pomodoros, tags]);

  async function handleGenerateReport() {
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setGenerating(true);
    try {
      const r = await generateWeeklyReport(tasks.filter(t => !t.deletedAt), pomodoros);
      setReport(r);
      // v6.7 — 归档周报到 localStorage（保留最近 4 周）
      try {
        const archives = JSON.parse(localStorage.getItem('weekly-reports') || '[]');
        archives.push({ content: r, date: new Date().toISOString() });
        const trimmed = archives.slice(-4);
        localStorage.setItem('weekly-reports', JSON.stringify(trimmed));
      } catch {}
    } catch (e: any) { showToast(e.message || '生成失败', 'error'); }
    finally { setGenerating(false); }
  }

  // v6.7 — AI 目标拆解
  async function handleGoalBreakdown() {
    if (!getAISettings()) { showToast('请先配置 AI API', 'error'); return; }
    if (!goalInput.trim()) { showToast('请输入目标', 'error'); return; }
    setGoalLoading(true);
    try {
      const result = await aiGoalBreakdown(goalInput.trim(), goalTimeframe);
      setGoalResult(result);
    } catch (e: any) { showToast(e.message || '拆解失败', 'error'); }
    finally { setGoalLoading(false); }
  }

  // v6.7 — 轻量 Markdown 渲染（支持 # 标题、**粗体**、- 列表、段落）
  function renderMarkdown(md: string): ReactNode {
    const lines = md.split('\n');
    const elements: ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc pl-5 my-1 space-y-0.5">
            {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
          </ul>
        );
        listItems = [];
      }
    };

    const renderInline = (text: string): ReactNode => {
      // **粗体**
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        }
        return p;
      });
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        flushList();
        elements.push(<div key={idx} className="text-[15px] font-bold mt-2 mb-1">{trimmed.slice(2)}</div>);
      } else if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(<div key={idx} className="text-[14px] font-semibold mt-2 mb-1" style={{ color: 'var(--primary)' }}>{trimmed.slice(3)}</div>);
      } else if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(<div key={idx} className="text-[13px] font-semibold mt-1.5 mb-0.5">{trimmed.slice(4)}</div>);
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        listItems.push(trimmed.slice(2));
      } else if (trimmed === '') {
        flushList();
      } else {
        flushList();
        elements.push(<div key={idx} className="my-0.5">{renderInline(trimmed)}</div>);
      }
    });
    flushList();
    return elements;
  }

  const maxDailyPomodoro = Math.max(...stats.dailyPomodoros.map(d => d.count), 1);
  const maxDailyCompleted = Math.max(...stats.dailyCompleted.map(d => d.count), 1);

  // KPI 卡片定义
  const kpis = [
    { label: '总任务',   value: stats.counts.total,       icon: '✦', accent: 'var(--accent-violet)', soft: 'rgba(139,124,255,0.14)' },
    { label: '已完成',   value: stats.counts.done,        icon: '✓', accent: 'var(--primary)',        soft: 'var(--primary-soft)' },
    { label: '进行中',   value: stats.counts.inProgress,  icon: '◐', accent: 'var(--accent-amber)',   soft: 'rgba(245,181,68,0.14)' },
    { label: '逾期',     value: stats.counts.overdue,     icon: '!', accent: 'var(--pri-high)',       soft: 'var(--pri-high-soft)' },
  ];

  return (
    <div className="px-4 py-4 space-y-4 pb-4 pc-content-wrap">
      {/* Pro 升级入口（仅非 Pro 显示） */}
      {onOpenPro && !pro?.isPro && (
        <button
          onClick={onOpenPro}
          className="w-full ios-card p-4 flex items-center gap-3 active:scale-[0.99] transition-transform fade-in"
          style={{ background: 'linear-gradient(135deg, var(--primary-soft), rgba(139,124,255,0.10))', borderColor: 'var(--primary-border)' }}
        >
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', color: '#ffffff' }}
          >
            <span style={{ fontSize: 20, fontWeight: 900 }}>✦</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
              升级 Pro，解锁全部高级功能
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              AI 无限对话 · 看板解锁 · 云同步扩容
            </div>
          </div>
          <span className="text-[12px] font-bold px-3 py-1 rounded-full" style={{ background: 'var(--primary)', color: '#ffffff' }}>
            查看
          </span>
        </button>
      )}

      {/* KPI 卡片网格 */}
      <div className="kpi-grid grid grid-cols-2 gap-3">
        {kpis.map((k, i) => (
          <div key={k.label} className="kpi-card p-4 fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between mb-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold"
                style={{ background: k.soft, color: k.accent, border: `1px solid ${k.accent}40`, fontSize: 16 }}
              >
                {k.icon}
              </div>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>{k.label}</span>
            </div>
            <div className="text-[32px] font-black leading-none" style={{ color: 'var(--text-primary)' }}>
              <AnimatedNumber value={k.value} />
            </div>
          </div>
        ))}
      </div>

      {/* 完成率环形进度 */}
      <div className="v3-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>完成率</div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>已完成 {stats.counts.done} / 总 {stats.counts.total}</div>
          </div>
          <div className="relative">
            <svg width="64" height="64" className="-rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--card)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="26" fill="none" stroke="var(--primary)" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={2 * Math.PI * 26 * (1 - stats.counts.completionRate / 100)}
                style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.32,0.72,0,1)', filter: 'drop-shadow(0 0 6px var(--primary-glow))' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[13px] font-black" style={{ color: 'var(--primary)' }}>{stats.counts.completionRate}%</span>
            </div>
          </div>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${stats.counts.completionRate}%`,
              background: 'linear-gradient(90deg, var(--primary), var(--primary-strong))',
              boxShadow: '0 0 8px var(--primary-glow)',
              transition: 'width 1.2s cubic-bezier(0.32,0.72,0,1)',
            }}
          />
        </div>
      </div>

      {/* 近 7 天完成趋势柱状图 */}
      <div className="v3-card p-4">
        <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>近 7 天完成趋势</div>
        <div className="flex items-end justify-between gap-2 h-28">
          {stats.dailyCompleted.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex-1 w-full flex items-end justify-center">
                <div
                  className="w-6 rounded-lg bar-grow"
                  style={{
                    height: `${(d.count / maxDailyCompleted) * 100}%`,
                    minHeight: d.count > 0 ? '6px' : '2px',
                    background: d.count > 0 ? 'linear-gradient(180deg, var(--primary), var(--primary-strong))' : 'var(--card)',
                    boxShadow: d.count > 0 ? '0 0 12px var(--primary-glow)' : 'none',
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{d.date.getMonth() + 1}/{d.date.getDate()}</div>
              <div className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>{d.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 状态分布 */}
      <div className="v3-card p-4">
        <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>状态分布</div>
        <div className="space-y-2.5">
          {stats.statusDist.map(s => (
            <div key={s.status} className="flex items-center gap-3">
              <div className="text-[11px] w-12" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--card)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${stats.counts.total > 0 ? (s.count / stats.counts.total) * 100 : 0}%`,
                    background: s.token.dot,
                    transition: 'width 1s cubic-bezier(0.32,0.72,0,1)',
                  }}
                />
              </div>
              <div className="text-[11px] font-bold w-6 text-right" style={{ color: 'var(--text-primary)' }}>{s.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 优先级分布 */}
      <div className="v3-card p-4">
        <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>优先级分布</div>
        <div className="flex h-3 rounded-full overflow-hidden" style={{ background: 'var(--card)' }}>
          {stats.priorityDist.map(p => (p.count > 0 && (
            <div
              key={p.priority}
              style={{
                width: `${(p.count / stats.counts.total) * 100}%`,
                background: p.token.dot,
                transition: 'width 1s cubic-bezier(0.32,0.72,0,1)',
              }}
            />
          )))}
        </div>
        <div className="flex justify-between mt-3">
          {stats.priorityDist.map(p => (
            <div key={p.priority} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: p.token.dot }} />
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{p.label} {p.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 番茄钟统计 */}
      <div className="v3-card p-4">
        <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>番茄钟统计</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-center p-3 rounded-xl" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)' }}>
            <div className="text-[28px] font-black leading-none" style={{ color: 'var(--primary)' }}>
              <AnimatedNumber value={stats.totalPomodoros} />
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>总番茄数</div>
          </div>
          <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(255,110,127,0.10)', border: '1px solid rgba(255,110,127,0.3)' }}>
            <div className="text-[28px] font-black leading-none" style={{ color: 'var(--pri-high)' }}>
              <AnimatedNumber value={stats.totalFocusMinutes} />
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>专注分钟数</div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2 h-20">
          {stats.dailyPomodoros.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex-1 w-full flex items-end justify-center">
                <div
                  className="w-5 rounded-t-md bar-grow"
                  style={{
                    height: `${(d.count / maxDailyPomodoro) * 100}%`,
                    minHeight: d.count > 0 ? '4px' : '2px',
                    background: d.count > 0 ? 'linear-gradient(180deg, var(--pri-high), #D4525E)' : 'var(--card)',
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{d.date.getMonth() + 1}/{d.date.getDate()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 热门标签 */}
      {stats.topTags.length > 0 && (
        <div className="v3-card p-4">
          <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>热门标签</div>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map(t => {
              const dotColor = {
                emerald: 'var(--primary)', amber: 'var(--accent-amber)', rose: 'var(--pri-high)',
                violet: 'var(--accent-violet)', sky: 'var(--accent-sky)', teal: 'var(--primary)',
                orange: 'var(--accent-amber)', slate: 'var(--text-secondary)',
              }[t.color] || 'var(--primary)';
              return (
                <div
                  key={t.name}
                  className="text-[12px] px-3 py-1.5 rounded-full font-medium"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <span style={{ color: dotColor }}>#</span>{t.name} <span style={{ color: 'var(--text-tertiary)' }}>· {t.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI 周报 */}
      <div className="ios-card p-4" style={{ background: 'linear-gradient(180deg, rgba(139,124,255,0.08), var(--card))', borderColor: 'rgba(139,124,255,0.25)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: 'var(--accent-violet)' }}>
            <span>✦</span>
            <span>AI 智能周报</span>
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            className="text-[12px] px-3 py-1.5 rounded-full font-bold active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: 'rgba(139,124,255,0.12)', border: '1px solid rgba(139,124,255,0.35)', color: 'var(--accent-violet)' }}
          >
            {generating ? '生成中…' : '生成周报'}
          </button>
        </div>
        {report ? (
          <div className="text-[13px] leading-relaxed fade-in" style={{ color: 'var(--text-primary)' }}>
            {renderMarkdown(report)}
          </div>
        ) : generating ? (
          <div className="space-y-2">
            <div className="h-3 rounded-full shimmer" style={{ width: '70%' }} />
            <div className="h-3 rounded-full shimmer" style={{ width: '90%' }} />
            <div className="h-3 rounded-full shimmer" style={{ width: '50%' }} />
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            {getAISettings() ? '点击「生成周报」AI 会根据你本周的数据生成一份回顾' : '请先在设置中配置 AI API，然后即可生成智能周报'}
          </div>
        )}
      </div>

      {/* v6.7 — AI 目标拆解 */}
      <div className="ios-card p-4 mt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[14px] font-bold">🎯 AI 目标拆解</div>
          {goalResult && (
            <button onClick={() => setGoalResult('')} className="text-[11px] text-[color:var(--text-tertiary)]">清除</button>
          )}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            placeholder="如：3 个月学会 Rust"
            className="ios-input flex-1"
            style={{ paddingTop: 8, paddingBottom: 8 }}
          />
          <select
            value={goalTimeframe}
            onChange={e => setGoalTimeframe(e.target.value)}
            className="ios-input"
            style={{ paddingTop: 8, paddingBottom: 8, width: 90 }}
          >
            <option value="1 个月">1 个月</option>
            <option value="3 个月">3 个月</option>
            <option value="6 个月">6 个月</option>
            <option value="1 年">1 年</option>
          </select>
        </div>
        <button
          onClick={handleGoalBreakdown}
          disabled={goalLoading || !goalInput.trim()}
          className="btn-primary w-full"
        >
          {goalLoading ? '拆解中…' : '生成计划'}
        </button>
        {goalResult && (
          <div className="text-[13px] leading-relaxed fade-in mt-2" style={{ color: 'var(--text-primary)' }}>
            {renderMarkdown(goalResult)}
          </div>
        )}
      </div>
    </div>
  );
}
