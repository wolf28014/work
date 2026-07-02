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
  cancelled:   { dot: 'var(--stat-cancelled)', soft: 'var(--card-hover)', text: 'var(--text-secondary)' },
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

    // v6.5 — 完成日期映射：已完成的任务在 completedAt 那天显示（绿色打卡）
    // 单独构建一张「完成记录」map，最后合并进主 map（用特殊标记区分）
    const completedByDate = new Map<string, Task[]>();
    tasks.filter(t => !t.deletedAt && t.status === 'done' && t.completedAt).forEach(t => {
      const d = new Date(t.completedAt!);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!completedByDate.has(dateStr)) completedByDate.set(dateStr, []);
      if (!completedByDate.get(dateStr)!.some(x => x.id === t.id)) {
        completedByDate.get(dateStr)!.push(t);
      }
    });

    // 1. 普通任务（非重复、未完成、有 dueDate）：按 dueDate 直接映射
    //    区间任务（有 startDate）：startDate 到 dueDate 之间每天都显示
    tasks.filter(t => !t.deletedAt && t.status !== 'done' && t.status !== 'cancelled' && !t.recurrence && t.dueDate).forEach(t => {
      if (t.startDate) {
        // v6.5 — 区间任务：startDate 到 dueDate 之间每天都显示
        const start = new Date(t.startDate);
        const end = new Date(t.dueDate!);
        if (start > end) return; // 数据异常，跳过
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (!map.has(dateStr)) map.set(dateStr, []);
          if (!map.get(dateStr)!.some(x => x.id === t.id)) map.get(dateStr)!.push(t);
        }
      } else {
        // 单点任务：仅 dueDate 显示
        if (!map.has(t.dueDate!)) map.set(t.dueDate!, []);
        if (!map.get(t.dueDate!)!.some(x => x.id === t.id)) map.get(t.dueDate!)!.push(t);
      }
    });

    // 2. 重复任务：在当前月内按规则展开
    //    - daily:   每天显示
    //    - weekly:  每周 dueDate 星期几那天显示
    //    - monthly: 每月 dueDate 几号那天显示
    //    范围：max(createdAt, 月初) 到 min(dueDate, 月末)
    //    注意：已完成的重复实例（status=done）已在上面 completedByDate 处理，这里跳过
    const monthStart = new Date(current.year, current.month, 1);
    const monthEnd = new Date(current.year, current.month + 1, 0);

    tasks.filter(t => !t.deletedAt && t.recurrence && t.status !== 'done' && t.status !== 'cancelled').forEach(t => {
      const createdDate = new Date(t.createdAt);
      const start = createdDate > monthStart ? createdDate : monthStart;

      let end = monthEnd;
      if (t.dueDate) {
        const due = new Date(t.dueDate);
        end = due < monthEnd ? due : monthEnd;
      }
      if (start > end) return;

      // 锚点：weekly/monthly 用 dueDate 的星期几/几号；没 dueDate 用 createdAt
      const anchor = t.dueDate ? new Date(t.dueDate) : new Date(t.createdAt);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        let match = false;
        if (t.recurrence === 'daily') {
          match = true;
        } else if (t.recurrence === 'weekly') {
          match = d.getDay() === anchor.getDay();
        } else if (t.recurrence === 'monthly') {
          match = d.getDate() === anchor.getDate();
        }
        if (match) {
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (!map.has(dateStr)) map.set(dateStr, []);
          const arr = map.get(dateStr)!;
          if (!arr.some(x => x.id === t.id)) arr.push(t);
        }
      }
    });

    // 3. 合并已完成任务（绿色打卡），加 'completed' 标记
    //    用 spread + 自定义标记，渲染时区分
    //    为了不污染 Task 类型，我们在 selectedTasks 渲染时再单独查 completedByDate
    //    这里只把完成的任务也加到 map 里（这样日历小格子的圆点统计能包含）
    completedByDate.forEach((arr, dateStr) => {
      if (!map.has(dateStr)) map.set(dateStr, []);
      arr.forEach(t => {
        if (!map.get(dateStr)!.some(x => x.id === t.id)) map.get(dateStr)!.push(t);
      });
    });

    return map;
  }, [tasks, current]);

  // 已完成任务按 completedAt 那天分组（用于渲染时区分绿色打卡）
  const completedByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    tasks.filter(t => !t.deletedAt && t.status === 'done' && t.completedAt).forEach(t => {
      const d = new Date(t.completedAt!);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(dateStr)) map.set(dateStr, new Set());
      map.get(dateStr)!.add(t.id);
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
    <div className="pb-4 pc-content-wrap">
      {/* 月份切换 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={prevMonth}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
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
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >›</button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 px-2 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[11px] font-bold py-1" style={{ color: 'var(--text-tertiary)' }}>{w}</div>
        ))}
      </div>

      {/* 日历主体 */}
      <div className="cal-grid grid grid-cols-7 px-2 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayTasks = tasksByDate.get(d.date) || [];
          const completedToday = completedByDate.get(d.date) || new Set<string>();
          const isToday = d.date === tStr;
          const isSelected = d.date === selectedDate;
          const hasOverdue = dayTasks.some(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate! < tStr);
          const doneCount = dayTasks.filter(t => t.status === 'done').length;
          const isAllDone = dayTasks.length > 0 && doneCount === dayTasks.length;
          // v6.5 — 是否有区间任务（连续多天显示的任务）
          const hasRangeTask = dayTasks.some(t => t.startDate && t.dueDate && t.startDate !== t.dueDate);
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
                  color: isSelected ? '#ffffff' : isAllDone ? 'var(--text-tertiary)' : isToday ? 'var(--primary)' : 'var(--text-primary)',
                  textDecoration: isAllDone && !isSelected ? 'line-through' : 'none',
                }}
              >
                {d.day}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 items-center">
                  {/* v6.5 — 已完成绿色打卡点 */}
                  {completedToday.size > 0 && (
                    <div
                      className="rounded-full"
                      style={{
                        width: 5, height: 5,
                        background: isSelected ? '#ffffff' : 'var(--stat-done)',
                        boxShadow: isSelected ? 'none' : '0 0 4px var(--stat-done)',
                      }}
                    />
                  )}
                  {/* 未完成任务的状态圆点 */}
                  {STATUS_ORDER.slice(0, 3).map(s => {
                    const has = dayTasks.some(t => t.status === s && !completedToday.has(t.id));
                    if (!has) return null;
                    return (
                      <div
                        key={s}
                        className="rounded-full"
                        style={{ width: 4, height: 4, background: isSelected ? '#ffffff' : STATUS_TOKEN[s].dot }}
                      />
                    );
                  })}
                  {/* v6.5 — 区间任务标记：在圆点后加个小横线表示这是区间任务 */}
                  {hasRangeTask && !isSelected && (
                    <div className="rounded-full ml-0.5" style={{ width: 6, height: 2, background: 'var(--text-tertiary)' }} />
                  )}
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
              const isCompletedHere = task.status === 'done' && task.completedAt && (() => {
                const d = new Date(task.completedAt!);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return dateStr === selectedDate;
              })();
              const isRangeTask = task.startDate && task.dueDate && task.startDate !== task.dueDate;
              const isRangeEndpoint = task.startDate && task.dueDate && (selectedDate === task.startDate || selectedDate === task.dueDate);
              return (
                <div
                  key={task.id}
                  onClick={() => onEdit(task)}
                  className="v3-card p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
                  style={{ opacity: task.status === 'done' && !isCompletedHere ? 0.6 : 1 }}
                >
                  <div
                    className="priority-bar"
                    style={{
                      background: isCompletedHere ? 'var(--stat-done)' : PRI_BAR[task.priority],
                      boxShadow: `0 0 8px ${isCompletedHere ? 'var(--stat-done)' : PRI_BAR[task.priority]}`,
                      width: 4, borderRadius: 4,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[14px] font-semibold"
                      style={{
                        color: isCompletedHere ? 'var(--stat-done)' : task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      }}
                    >
                      {task.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {isCompletedHere ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: 'var(--primary-soft)', color: 'var(--stat-done)', border: '1px solid var(--stat-done)40' }}
                        >✓ 已完成</span>
                      ) : (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: sc.soft, color: sc.text, border: `1px solid ${sc.dot}40` }}
                        >
                          {STATUS_LABELS[task.status]}
                        </span>
                      )}
                      {/* v6.5 — 区间任务标签 */}
                      {isRangeTask && !isCompletedHere && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                          {isRangeEndpoint ? (selectedDate === task.startDate ? '起' : '止') : `${task.startDate} → ${task.dueDate}`}
                        </span>
                      )}
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
