import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PRIORITY_COLORS, TAG_COLORS, formatDate, isOverdue } from '../lib/task-utils';
import { showToast } from '../components/Toast';

interface Props {
  onEdit: (t: Task) => void;
  onNew: () => void;
}

export default function KanbanView({ onEdit }: Props) {
  const { tasks, updateTask } = useTaskStore();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const columns = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], done: [], cancelled: [] };
    tasks.filter(t => !t.deletedAt).forEach(t => { if (map[t.status]) map[t.status].push(t); });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return b.createdAt - a.createdAt;
      });
    });
    return map;
  }, [tasks]);

  function handleDrop(newStatus: string) {
    if (!draggingId) return;
    const task = tasks.find(t => t.id === draggingId);
    if (!task || task.status === newStatus) {
      setDraggingId(null);
      setDragOverCol(null);
      return;
    }
    updateTask(task.id, { status: newStatus, completedAt: newStatus === 'done' ? Date.now() : null });
    showToast(`已移至「${STATUS_LABELS[newStatus]}」`, 'success');
    setDraggingId(null);
    setDragOverCol(null);
  }

  return (
    <div className="h-full overflow-x-auto no-scrollbar pb-4">
      <div className="flex gap-3 px-3 min-w-max h-full">
        {STATUS_ORDER.map(col => (
          <div
            key={col}
            className="w-72 flex flex-col"
            onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={() => handleDrop(col)}
          >
            <div className={`px-3 py-2 rounded-t-xl flex items-center justify-between ${
              dragOverCol === col ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-800/50'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[col].bar}`} />
                <span className="text-sm font-semibold">{STATUS_LABELS[col]}</span>
              </div>
              <span className="text-xs text-slate-400 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full">
                {columns[col].length}
              </span>
            </div>

            <div className={`flex-1 overflow-y-auto no-scrollbar p-2 space-y-2 rounded-b-xl min-h-[200px] ${
              dragOverCol === col ? 'bg-emerald-50/50 dark:bg-emerald-900/20' : 'bg-slate-50 dark:bg-black/20'
            }`}>
              {columns[col].length === 0 && (
                <div className="text-center text-xs text-slate-300 dark:text-slate-600 py-8">拖拽任务到这里</div>
              )}
              {columns[col].map(task => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onClick={() => onEdit(task)}
                  onDragStart={() => setDraggingId(task.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                  isDragging={draggingId === task.id}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ task, onClick, onDragStart, onDragEnd, isDragging }: {
  task: Task;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const priorityColor = PRIORITY_COLORS[task.priority];
  const overdue = isOverdue(task);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`ios-card p-3 cursor-pointer active:scale-95 transition-transform ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className={`h-1 rounded-full mb-2 ${priorityColor.dot}`} />
      <div className={`text-[14px] font-medium leading-snug ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>
        {task.title}
      </div>
      {task.description && (
        <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{task.description}</div>
      )}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map(t => (
            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_COLORS.emerald}`}>#{t}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={overdue ? 'text-rose-500 font-medium' : ''}>📅 {formatDate(task.dueDate)}</span>
          )}
          {task.subtasks.length > 0 && (<span>✓ {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</span>)}
        </div>
        {task.pomodoros > 0 && <span>🍅 {task.pomodoros}</span>}
      </div>
    </div>
  );
}
