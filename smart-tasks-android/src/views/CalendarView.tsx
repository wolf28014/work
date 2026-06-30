import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import { STATUS_LABELS, STATUS_ORDER, todayStr } from '../lib/task-utils';

interface Props {
  onEdit: (t: Task) => void;
  onNew: () => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const STATUS_TOKEN: Record<string, { dot: string; soft: string; text: string }> = {
  todo:        { dot: 'var(--stat-todo)',      soft: 'rgba(91,200,255,0.14)',  text: 'var(--accent-sky)' },
  in_progress: { dot: 'var(--stat-progress)',  soft: 'rgba(245,181,68,0.14)',  text: 'var(--accent-amber)' },
  done:        { dot: 'var(--stat-done)',      soft: 'var(--primary-soft)',    text: 'var(--primary)' },
  cancelled:   { dot: 'var(--stat-cancelled)', soft: 'rgba(255,255,255,0.08)', text: 'var(--text-secondary)' },
};

const PRI_BAR: Record<string, string> = {
  high: 'var(--pri-high)',
  medium: 'var(--pri-medium)',
  low: 'var(--pri-low)',
};

export default function CalendarView({ onEdit }: Props) {
  const { tasks } = useTaskStore();
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr());

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.filter(t => !t.deletedAt && t.dueDate).forEach(t => {
      if (!map.has(t.dueDate!)) map.set(t.dueDate!, []);
      map.get(t.dueDate!)!.push(t);
    });
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const firstDay = new Date(current.year, current.month, 1);
    const lastDay = new Date(current.year, current.month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const arr: ({ date: string; day: number; inMonth: boolean } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      arr.push({ date: dateStr, day: d, inMonth: true });
    }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [current]);

  function prevMonth() {
    setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  }
  function nextMonth() {
    setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });
  }
  function goToday() {
    const d = new Date();
    setCurrent({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(todayStr());
  }

  const selectedTasks = selectedDate ? (tasksByDate.get(selectedDate) || []) : [];
  const tStr = todayStr();

  return (
    <div className="pb-4">
      {/* 月份切换 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={prevMonth}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >‹</button>
        <div className="text-center">
          <div className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {current.year}年 {MONTHS[current.month]}
          </div>
          <button
            onClick={goToday}
            className="text-[11px] font-bold mt-0.5 px-2.5 py-0.5 rounded-full"
            style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)', color: 'var(--primary)' }}
          >回到今天</button>
        </div>
        <button
          onClick={nextMonth}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >›</button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 px-2 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[11px] font-bold py-1" style={{ color: 'var(--text-tertiary)' }}>{w}</div>
        ))}
      </div>

      {/* 日历主体 */}
      <div className="grid grid-cols-7 px-2 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayTasks = tasksByDate.get(d.date) || [];
          const isToday = d.date === tStr;
          const isSelected = d.date === selectedDate;
          const hasOverdue = dayTasks.some(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate! < tStr);
          const doneCount = dayTasks.filter(t => t.status === 'done').length;
          const isAllDone = dayTasks.length > 0 && doneCount === dayTasks.length;
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(d.date)}
              className="aspect-square flex flex-col items-center justify-center rounded-xl transition-all relative active:scale-95"
              style={{
                background: isSelected
                  ? 'linear-gradient(135deg, var(--primary), var(--primary-strong))'
                  : isToday
                    ? 'var(--primary-soft)'
                    : 'transparent',
                border: isSelected
                  ? 'none'
                  : `1px solid ${isToday ? 'var(--primary-border)' : 'transparent'}`,
                boxShadow: isSelected ? '0 4px 14px var(--primary-glow)' : 'none',
              }}
            >
              <span
                className="text-[13px] font-bold"
                style={{
                  color: isSelected ? '#06140F' : isAllDone ? 'var(--text-tertiary)' : isToday ? 'var(--primary)' : 'var(--text-primary)',
                  textDecoration: isAllDone && !isSelected ? 'line-through' : 'none',
                }}
              >
                {d.day}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {STATUS_ORDER.slice(0, 3).map(s => {
                    const has = dayTasks.some(t => t.status === s);
                    if (!has) return null;
                    return (
                      <div
                        key={s}
                        className="rounded-full"
                        style={{ width: 4, height: 4, background: isSelected ? '#06140F' : STATUS_TOKEN[s].dot }}
                      />
                    );
                  })}
                </div>
              )}
              {hasOverdue && !isSelected && (
                <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--pri-high)', boxShadow: '0 0 6px var(--pri-high)' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 选中日期任务列表 */}
      <div className="px-4 mt-4">
        <div className="text-[13px] font-bold mb-2 px-1 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>
            {selectedDate ? `${selectedDate} · ${selectedTasks.length} 个任务` : '请选择日期'}
          </span>
        </div>
        {selectedTasks.length === 0 ? (
          <div className="v3-card text-center py-10">
            <div
              className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-2"
              style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)' }}
            >
              <span style={{ fontSize: 22 }}>🌞</span>
            </div>
            <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              这一天没有任务安排
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {selectedTasks.map(task => {
              const sc = STATUS_TOKEN[task.status];
              const overdue = !task.dueDate ? false : (task.dueDate < tStr && task.status !== 'done' && task.status !== 'cancelled');
              return (
                <div
                  key={task.id}
                  onClick={() => onEdit(task)}
                  className="v3-card p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
                  style={{ opacity: task.status === 'done' ? 0.6 : 1 }}
                >
                  <div
                    className="priority-bar"
                    style={{
                      background: PRI_BAR[task.priority],
                      boxShadow: `0 0 8px ${PRI_BAR[task.priority]}`,
                      width: 4, borderRadius: 4,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[14px] font-semibold"
                      style={{
                        color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      }}
                    >
                      {task.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: sc.soft, color: sc.text, border: `1px solid ${sc.dot}40` }}
                      >
                        {STATUS_LABELS[task.status]}
                      </span>
                      {overdue && (
                        <span className="text-[10px] font-bold" style={{ color: 'var(--pri-high)' }}>逾期</span>
                      )}
                      {task.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>#{t}</span>
                      ))}
                    </div>
                  </div>
                  {task.pomodoros > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(255,110,127,0.12)', color: 'var(--pri-high)', border: '1px solid rgba(255,110,127,0.3)' }}
                    >🍅 {task.pomodoros}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
