import { useMemo, useState } from 'react';
import { useTaskStore } from '../lib/store';
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, TAG_COLORS, todayStr } from '../lib/task-utils';
import { generateWeeklyReport, getAISettings } from '../lib/ai-client';
import { showToast } from '../components/Toast';

export default function DashboardView() {
  const { tasks, pomodoros, tags } = useTaskStore();
  const [report, setReport] = useState<string>('');
  const [generating, setGenerating] = useState(false);

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
      color: STATUS_COLORS[s].bar,
    }));
    const priorityDist = (['high', 'medium', 'low'] as const).map(p => ({
      priority: p, label: PRIORITY_LABELS[p],
      count: active.filter(t => t.priority === p).length,
      color: PRIORITY_COLORS[p].dot,
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
      .map(([name, count]) => ({ name, count, color: tags.find(t => t.name === name)?.color || 'emerald' }));
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
    } catch (e: any) { showToast(e.message || '生成失败', 'error'); }
    finally { setGenerating(false); }
  }

  const maxDailyPomodoro = Math.max(...stats.dailyPomodoros.map(d => d.count), 1);
  const maxDailyCompleted = Math.max(...stats.dailyCompleted.map(d => d.count), 1);

  return (
    <div className="px-4 py-3 space-y-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="总任务" value={stats.counts.total} icon="📋" color="bg-slate-100 dark:bg-slate-800" />
        <StatCard label="已完成" value={stats.counts.done} icon="✅" color="bg-emerald-100 dark:bg-emerald-900/30" />
        <StatCard label="进行中" value={stats.counts.inProgress} icon="🔄" color="bg-blue-100 dark:bg-blue-900/30" />
        <StatCard label="逾期" value={stats.counts.overdue} icon="⚠️" color="bg-rose-100 dark:bg-rose-900/30" />
      </div>

      <div className="ios-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">完成率</span>
          <span className="text-2xl font-bold text-emerald-500">{stats.counts.completionRate}%</span>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all" style={{ width: `${stats.counts.completionRate}%` }} />
        </div>
        <div className="text-[11px] text-slate-400 mt-1.5">已完成 {stats.counts.done} / 总 {stats.counts.total}</div>
      </div>

      <div className="ios-card p-4">
        <div className="text-sm font-medium mb-3">近 7 天完成趋势</div>
        <div className="flex items-end justify-between gap-2 h-24">
          {stats.dailyCompleted.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex-1 w-full flex items-end">
                <div className="w-full bg-emerald-500 rounded-t-md transition-all" style={{ height: `${(d.count / maxDailyCompleted) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }} />
              </div>
              <div className="text-[10px] text-slate-400">{d.date.getMonth() + 1}/{d.date.getDate()}</div>
              <div className="text-[10px] font-medium text-slate-600 dark:text-slate-300">{d.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ios-card p-4">
        <div className="text-sm font-medium mb-3">状态分布</div>
        <div className="space-y-2">
          {stats.statusDist.map(s => (
            <div key={s.status} className="flex items-center gap-3">
              <div className="text-xs text-slate-500 w-16">{s.label}</div>
              <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${s.color} rounded-full`} style={{ width: `${stats.counts.total > 0 ? (s.count / stats.counts.total) * 100 : 0}%` }} />
              </div>
              <div className="text-xs font-medium w-6 text-right">{s.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ios-card p-4">
        <div className="text-sm font-medium mb-3">优先级分布</div>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          {stats.priorityDist.map(p => (p.count > 0 && (<div key={p.priority} className={p.color} style={{ width: `${(p.count / stats.counts.total) * 100}%` }} />)))}
        </div>
        <div className="flex justify-between mt-2">
          {stats.priorityDist.map(p => (
            <div key={p.priority} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${p.color}`} />
              <span className="text-[11px] text-slate-500">{p.label} {p.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ios-card p-4">
        <div className="text-sm font-medium mb-3">番茄钟统计</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-500">{stats.totalPomodoros}</div>
            <div className="text-[11px] text-slate-400">总番茄数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-500">{stats.totalFocusMinutes}</div>
            <div className="text-[11px] text-slate-400">专注分钟数</div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2 h-20">
          {stats.dailyPomodoros.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex-1 w-full flex items-end">
                <div className="w-full bg-rose-400 rounded-t-md" style={{ height: `${(d.count / maxDailyPomodoro) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }} />
              </div>
              <div className="text-[10px] text-slate-400">{d.date.getMonth() + 1}/{d.date.getDate()}</div>
            </div>
          ))}
        </div>
      </div>

      {stats.topTags.length > 0 && (
        <div className="ios-card p-4">
          <div className="text-sm font-medium mb-3">热门标签</div>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map(t => (
              <div key={t.name} className={`text-xs px-3 py-1.5 rounded-full ${TAG_COLORS[t.color] || TAG_COLORS.emerald}`}>
                #{t.name} · {t.count}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ios-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">✨ AI 周报</div>
          <button onClick={handleGenerateReport} disabled={generating} className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-full disabled:opacity-50">
            {generating ? '生成中…' : '生成周报'}
          </button>
        </div>
        {report ? (
          <div className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{report}</div>
        ) : (
          <div className="text-[12px] text-slate-400">
            {getAISettings() ? '点击「生成周报」AI 会根据你本周的数据生成一份回顾' : '请先在设置中配置 AI API，然后即可生成智能周报'}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="ios-card p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${color}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-[11px] text-slate-400 mt-1">{label}</div>
      </div>
    </div>
  );
}
