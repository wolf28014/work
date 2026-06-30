import { useState } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, TAG_COLORS, formatDate, isOverdue } from '../lib/task-utils';
import { showToast } from './Toast';

interface Props {
  task: Task;
  onEdit: (t: Task) => void;
  compact?: boolean;
}

export default function TaskCard({ task, onEdit, compact = false }: Props) {
  const { completeTask, updateTask, softDeleteTask, tags } = useTaskStore();
  const [showActions, setShowActions] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);

  const priorityColor = PRIORITY_COLORS[task.priority];
  const statusColor = STATUS_COLORS[task.status];
  const overdue = isOverdue(task);
  const isDone = task.status === 'done';
  const subtaskDone = task.subtasks.filter(s => s.done).length;
  const subtaskTotal = task.subtasks.length;

  async function handleCheck() {
    if (isDone) {
      await updateTask(task.id, { status: 'todo', completedAt: null });
    } else {
      await completeTask(task.id);
      showToast('任务已完成 🎉', 'success');
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (newStatus === task.status) {
      setShowStatusSheet(false);
      return;
    }
    await updateTask(task.id, {
      status: newStatus as any,
      completedAt: newStatus === 'done' ? Date.now() : null,
    });
    showToast(`已切换为「${STATUS_LABELS[newStatus]}」`, 'success');
    setShowStatusSheet(false);
  }

  return (
    <>
      <div className={`ios-card overflow-hidden ${isDone ? 'opacity-60' : ''}`} onClick={() => onEdit(task)}>
        <div className="flex">
          <div className={`priority-bar ${priorityColor.dot}`} />
          <div className="flex-1 p-3.5">
            <div className="flex items-start gap-2.5">
              <button
                className={`ios-checkbox ${isDone ? 'checked' : ''} mt-0.5`}
                onClick={(e) => { e.stopPropagation(); handleCheck(); }}
              />
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-medium leading-snug ${isDone ? 'line-through text-slate-400' : ''}`}>
                  {task.title}
                </div>
                {task.description && !compact && (
                  <div className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {task.description}
                  </div>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${priorityColor.bg} ${priorityColor.text}`}>
                {PRIORITY_LABELS[task.priority]}
              </span>
            </div>

            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 ml-8">
                {task.tags.slice(0, 4).map(tagName => {
                  const tag = tags.find(t => t.name === tagName);
                  return (
                    <span key={tagName} className={`text-[11px] px-2 py-0.5 rounded-full ${TAG_COLORS[tag?.color || 'emerald'] || TAG_COLORS.emerald}`}>
                      #{tagName}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 ml-8 text-[11px] text-slate-500 dark:text-slate-400">
              <button
                onClick={(e) => { e.stopPropagation(); setShowStatusSheet(true); }}
                className={`px-2 py-0.5 rounded-full ${statusColor.bg} ${statusColor.text} font-medium active:scale-95 transition-transform`}
              >
                {STATUS_LABELS[task.status]} ▾
              </button>
              {task.dueDate && (
                <span className={overdue ? 'text-rose-500 font-medium' : ''}>
                  {overdue ? '⚠ ' : '📅 '}{formatDate(task.dueDate)}
                </span>
              )}
              {task.recurrence && (
                <span>🔁 {task.recurrence === 'daily' ? '每日' : task.recurrence === 'weekly' ? '每周' : '每月'}</span>
              )}
              {subtaskTotal > 0 && (<span>✓ {subtaskDone}/{subtaskTotal}</span>)}
              {task.pomodoros > 0 && (<span>🍅 {task.pomodoros}</span>)}
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }}
            className="px-3 text-slate-400 active:opacity-60"
          >⋯</button>
        </div>

        {showActions && (
          <div className="flex border-t border-slate-100 dark:border-slate-800 fade-in">
            <button
              onClick={(e) => { e.stopPropagation(); setShowActions(false); onEdit(task); }}
              className="flex-1 py-2.5 text-[13px] text-blue-500 active:bg-slate-50 dark:active:bg-slate-800"
            >编辑</button>
            <div className="w-px bg-slate-100 dark:bg-slate-800" />
            <button
              onClick={(e) => { e.stopPropagation(); setShowActions(false); setShowStatusSheet(true); }}
              className="flex-1 py-2.5 text-[13px] text-emerald-500 active:bg-slate-50 dark:active:bg-slate-800"
            >切换状态</button>
            <div className="w-px bg-slate-100 dark:bg-slate-800" />
            <button
              onClick={(e) => { e.stopPropagation(); setShowActions(false); softDeleteTask(task.id); showToast('已移入回收站', 'info'); }}
              className="flex-1 py-2.5 text-[13px] text-rose-500 active:bg-slate-50 dark:active:bg-slate-800"
            >删除</button>
          </div>
        )}
      </div>

      {/* 状态选择 ActionSheet */}
      {showStatusSheet && (
        <div
          className="fixed inset-0 z-[80] modal-mask flex items-end"
          onClick={() => setShowStatusSheet(false)}
        >
          <div
            className="w-full bg-white dark:bg-black slide-up rounded-t-3xl"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="text-center text-[15px] font-semibold py-2 border-b border-slate-100 dark:border-slate-800">
              选择状态
            </div>
            <div className="p-3 space-y-2">
              {STATUS_ORDER.map(s => {
                const sc = STATUS_COLORS[s];
                const isCurrent = s === task.status;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98] ${
                      isCurrent
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-400'
                        : 'bg-slate-50 dark:bg-slate-800/50'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${sc.bar}`} />
                    <span className={`flex-1 text-left text-[15px] font-medium ${isCurrent ? 'text-emerald-600 dark:text-emerald-300' : ''}`}>
                      {STATUS_LABELS[s]}
                    </span>
                    {isCurrent && <span className="text-emerald-500 text-lg">✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="px-3 pb-2">
              <button
                onClick={() => setShowStatusSheet(false)}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[15px] font-medium"
              >取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
