import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, PRIORITY_COLORS, todayStr } from '../lib/task-utils';

interface Props {
  onEdit: (t: Task) => void;
  onNew: () => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

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

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={prevMonth} className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center active:opacity-60">‹</button>
        <div className="text-center">
          <div className="text-lg font-semibold">{current.year}年 {MONTHS[current.month]}</div>
          <button onClick={goToday} className="text-[11px] text-emerald-500 mt-0.5">回到今天</button>
        </div>
        <button onClick={nextMonth} className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center active:opacity-60">›</button>
      </div>

      <div className="grid grid-cols-7 px-2 mb-1">
        {WEEKDAYS.map(w => (<div key={w} className="text-center text-[11px] font-medium text-slate-400 py-1">{w}</div>))}
      </div>

      <div className="grid grid-cols-7 px-2 gap-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayTasks = tasksByDate.get(d.date) || [];
          const isToday = d.date === todayStr();
          const isSelected = d.date === selectedDate;
          const hasOverdue = dayTasks.some(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate! < todayStr());
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(d.date)}
              className={`aspect-square flex flex-col items-center justify-center rounded-lg transition-all relative ${
                isSelected ? 'bg-emerald-500 text-white' :
                isToday ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                'active:bg-slate-100 dark:active:bg-slate-800'
              }`}
            >
              <span className={`text-[13px] ${isToday && !isSelected ? 'font-bold' : ''}`}>{d.day}</span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {STATUS_ORDER.slice(0, 3).map(s => {
                    const has = dayTasks.some(t => t.status === s);
                    if (!has) return null;
                    return (<div key={s} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : STATUS_COLORS[s].bar}`} />);
                  })}
                </div>
              )}
              {hasOverdue && !isSelected && (
                <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-4 mt-4">
        <div className="text-[13px] font-semibold text-slate-500 mb-2 px-1">
          {selectedDate ? `${selectedDate} · ${selectedTasks.length} 个任务` : '请选择日期'}
        </div>
        {selectedTasks.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            <div className="text-3xl mb-2">🌞</div>
            这一天没有任务安排
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onEdit(task)}
                className="ios-card p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
              >
                <div className={`priority-bar ${PRIORITY_COLORS[task.priority].dot}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>{task.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status].bg} ${STATUS_COLORS[task.status].text}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    {task.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[10px] text-slate-400">#{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
