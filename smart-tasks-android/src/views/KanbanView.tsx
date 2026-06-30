import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import {
  STATUS_LABELS, STATUS_ORDER, STATUS_COLORS,
  PRIORITY_COLORS, PRIORITY_LABELS, TAG_COLORS,
  formatDate, isOverdue,
} from '../lib/task-utils';
import { showToast } from '../components/Toast';
import SwipeableSheet from '../components/SwipeableSheet';

interface Props {
  onEdit: (t: Task) => void;
  onNew: () => void;
  onStartPomodoro?: (t: Task) => void;
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function KanbanView({ onEdit, onStartPomodoro }: Props) {
  const { tasks, updateTask, softDeleteTask } = useTaskStore();
  const [selectedStatus, setSelectedStatus] = useState<string>('todo');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // 按状态分组
  const columns = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], done: [], cancelled: [] };
    tasks.filter(t => !t.deletedAt).forEach(t => {
      if (map[t.status]) map[t.status].push(t);
    });
    // 每列内按优先级排序
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => {
        const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (po !== 0) return po;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return b.createdAt - a.createdAt;
      });
    });
    return map;
  }, [tasks]);

  // 当前选中状态的任务列表
  const currentTasks = columns[selectedStatus] || [];

  // 拖拽到目标列
  function handleDropToColumn(newStatus: string) {
    if (!draggedTaskId) return;
    const task = tasks.find(t => t.id === draggedTaskId);
    if (!task || task.status === newStatus) {
      setDraggedTaskId(null);
      setDragOverStatus(null);
      return;
    }
    updateTask(task.id, {
      status: newStatus as 'todo' | 'in_progress' | 'done' | 'cancelled',
      completedAt: newStatus === 'done' ? Date.now() : null,
    });
    showToast(`已移至「${STATUS_LABELS[newStatus]}」`, 'success');
    setDraggedTaskId(null);
    setDragOverStatus(null);
  }

  // 通过长按弹出的状态切换菜单
  const [statusChangeTaskId, setStatusChangeTaskId] = useState<string | null>(null);

  async function handleStatusChange(newStatus: string) {
    if (!statusChangeTaskId) return;
    const task = tasks.find(t => t.id === statusChangeTaskId);
    if (!task || task.status === newStatus) {
      setStatusChangeTaskId(null);
      return;
    }
    await updateTask(task.id, {
      status: newStatus as 'todo' | 'in_progress' | 'done' | 'cancelled',
      completedAt: newStatus === 'done' ? Date.now() : null,
    });
    showToast(`已移至「${STATUS_LABELS[newStatus]}」`, 'success');
    setStatusChangeTaskId(null);
  }

  const totalActive = tasks.filter(t => !t.deletedAt).length;

  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  return (
    <div className="h-full flex flex-col">
      {/* 顶部统计栏：可点击切换分类 + 批量按钮 */}
      <div className="px-4 py-2.5 glass border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <button
          onClick={() => !batchMode && setShowCategorySheet(true)}
          className="flex items-center gap-2 flex-1"
        >
          <span className="text-[12px] text-slate-500 dark:text-slate-400">
            共 {totalActive} 个任务 · 4 个分类
          </span>
          <span className="flex items-center gap-1 text-[12px] text-emerald-500 font-medium">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[selectedStatus].bar}`} />
            <span>{STATUS_LABELS[selectedStatus]}（{currentTasks.length}）</span>
            <span className="text-[10px]">▾</span>
          </span>
        </button>
        <button
          onClick={() => {
            if (batchMode) setSelectedIds(new Set());
            setBatchMode(!batchMode);
          }}
          className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
            batchMode ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          } active:scale-95 transition-transform ml-2`}
        >{batchMode ? '退出批量' : '🗑 批量'}</button>
      </div>

      {/* 批量操作工具栏 */}
      {batchMode && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-900/40 fade-in flex items-center justify-between">
          <span className="text-[12px] text-rose-700 dark:text-rose-300 font-medium">
            已选 {selectedIds.size} / {currentTasks.length} 项
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const newSet = new Set(selectedIds);
                currentTasks.forEach(t => newSet.add(t.id));
                setSelectedIds(newSet);
              }}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 text-[12px] font-medium rounded-lg text-slate-700 dark:text-slate-200 active:scale-95 transition-transform"
            >全选</button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 text-[12px] font-medium rounded-lg text-slate-700 dark:text-slate-200 active:scale-95 transition-transform"
            >清空</button>
            <button
              onClick={async () => {
                if (selectedIds.size === 0) return;
                if (!confirm(`确定删除选中的 ${selectedIds.size} 个任务？\n（移入回收站，30 天内可恢复）`)) return;
                for (const id of selectedIds) {
                  await softDeleteTask(id);
                }
                setSelectedIds(new Set());
                setBatchMode(false);
              }}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 bg-rose-500 text-white text-[12px] font-medium rounded-lg disabled:opacity-50 active:scale-95 transition-transform"
            >删除</button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：分类列表（重新设计） */}
        <aside
          className="w-[88px] flex-shrink-0 bg-slate-100/60 dark:bg-black/40 overflow-y-auto no-scrollbar border-r border-slate-200/60 dark:border-slate-800/60 py-2.5 px-2 space-y-2"
        >
          {STATUS_ORDER.map(status => {
            const sc = STATUS_COLORS[status];
            const count = columns[status].length;
            const isActive = selectedStatus === status;
            const isDragOver = dragOverStatus === status;
            return (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                onDragOver={e => { e.preventDefault(); setDragOverStatus(status); }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={() => handleDropToColumn(status)}
                className={`relative w-full flex flex-col items-center justify-center py-3 px-1 rounded-2xl transition-all active:scale-95 ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 shadow-md ring-2 ring-emerald-500/40'
                    : isDragOver
                    ? 'bg-emerald-50 dark:bg-emerald-900/40 ring-2 ring-emerald-400/60'
                    : 'bg-white/50 dark:bg-slate-800/30'
                }`}
                style={isActive ? { boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' } : {}}
              >
                {/* 状态色图标块 */}
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-1.5 ${sc.bg} relative`}
                  style={isActive ? { boxShadow: `0 2px 8px ${sc.bar.replace('bg-', '')}` } : {}}
                >
                  <div className={`w-4 h-4 rounded-full ${sc.bar} ${isActive ? 'scale-110' : ''} transition-transform`} />
                  {/* 任务数徽章 */}
                  {count > 0 && (
                    <div className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full ${
                      isActive ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white'
                    } flex items-center justify-center text-[10px] font-bold leading-none`}>
                      {count > 99 ? '99+' : count}
                    </div>
                  )}
                </div>
                {/* 状态名 */}
                <div className={`text-[12px] font-semibold leading-tight ${
                  isActive ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                }`}>
                  {STATUS_LABELS[status]}
                </div>
              </button>
            );
          })}

          {/* 底部提示 */}
          <div className="pt-2 px-1 text-center">
            <div className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">
              拖拽任务<br/>到此切换
            </div>
          </div>
        </aside>

        {/* 右侧：任务列表 */}
        <main className="flex-1 overflow-y-auto no-scrollbar">
          {/* 当前列头部 */}
          <div className={`px-4 py-3 sticky top-0 z-10 glass border-b border-slate-100 dark:border-slate-800`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[selectedStatus].bar}`} />
                <span className="text-[16px] font-bold">
                  {STATUS_LABELS[selectedStatus]}
                </span>
                <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[selectedStatus].bg} ${STATUS_COLORS[selectedStatus].text}`}>
                  {currentTasks.length}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                长按拖拽
              </div>
            </div>
          </div>

          {/* 任务卡片列表 */}
          <div
            className="p-3 space-y-2 min-h-[200px]"
            onDragOver={e => e.preventDefault()}
          >
            {currentTasks.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-4xl mb-2">📂</div>
                <div className="text-sm">「{STATUS_LABELS[selectedStatus]}」分类下暂无任务</div>
                <div className="text-[11px] mt-1 text-slate-300 dark:text-slate-600">
                  可从其他分类拖拽任务过来
                </div>
              </div>
            ) : (
              currentTasks.map(task => (
                <div key={task.id} className={batchMode ? 'flex items-center gap-2' : ''}>
                  {batchMode && (
                    <button
                      onClick={() => {
                        const newSet = new Set(selectedIds);
                        if (newSet.has(task.id)) newSet.delete(task.id);
                        else newSet.add(task.id);
                        setSelectedIds(newSet);
                      }}
                      className={`ios-checkbox flex-shrink-0 ${selectedIds.has(task.id) ? 'checked' : ''}`}
                      style={{ width: 24, height: 24 }}
                    />
                  )}
                  <div className="flex-1">
                    <KanbanCard
                      task={task}
                      onClick={() => {
                        if (batchMode) {
                          const newSet = new Set(selectedIds);
                          if (newSet.has(task.id)) newSet.delete(task.id);
                          else newSet.add(task.id);
                          setSelectedIds(newSet);
                        } else {
                          onEdit(task);
                        }
                      }}
                      onDragStart={() => !batchMode && setDraggedTaskId(task.id)}
                      onDragEnd={() => { setDraggedTaskId(null); setDragOverStatus(null); }}
                      onLongPress={() => !batchMode && setStatusChangeTaskId(task.id)}
                      isDragging={draggedTaskId === task.id}
                      onStartPomodoro={onStartPomodoro}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {/* 状态切换 ActionSheet（长按任务触发） */}
      {statusChangeTaskId && (
        <SwipeableSheet onClose={() => setStatusChangeTaskId(null)} zIndex={80} showEdgeIndicator={false}>
            <div className="text-center text-[15px] font-semibold py-2 border-b border-slate-100 dark:border-slate-800">
              移动到分类
            </div>
            <div className="p-3 space-y-2">
              {STATUS_ORDER.map(s => {
                const sc = STATUS_COLORS[s];
                const isCurrent = s === (tasks.find(t => t.id === statusChangeTaskId)?.status);
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
                onClick={() => setStatusChangeTaskId(null)}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[15px] font-medium"
              >取消</button>
            </div>
        </SwipeableSheet>
      )}

      {/* 顶部分类切换 ActionSheet */}
      {showCategorySheet && (
        <SwipeableSheet onClose={() => setShowCategorySheet(false)} zIndex={80} showEdgeIndicator={false}>
            <div className="text-center text-[15px] font-semibold py-2 border-b border-slate-100 dark:border-slate-800">
              选择分类
            </div>
            <div className="p-3 space-y-2">
              {STATUS_ORDER.map(s => {
                const sc = STATUS_COLORS[s];
                const isCurrent = s === selectedStatus;
                const count = columns[s].length;
                return (
                  <button
                    key={s}
                    onClick={() => { setSelectedStatus(s); setShowCategorySheet(false); }}
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
                    <span className={`text-[12px] px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                      {count}
                    </span>
                    {isCurrent && <span className="text-emerald-500 text-lg">✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="px-3 pb-2">
              <button
                onClick={() => setShowCategorySheet(false)}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[15px] font-medium"
              >取消</button>
            </div>
        </SwipeableSheet>
      )}
    </div>
  );
}

interface KanbanCardProps {
  task: Task;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onLongPress: () => void;
  isDragging: boolean;
  onStartPomodoro?: (t: Task) => void;
}

function KanbanCard({ task, onClick, onDragStart, onDragEnd, onLongPress, isDragging, onStartPomodoro }: KanbanCardProps) {
  const priorityColor = PRIORITY_COLORS[task.priority];
  const overdue = isOverdue(task);
  const [pressTimer, setPressTimer] = useState<number | null>(null);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const { updateTask } = useTaskStore();
  const subtaskDone = task.subtasks.filter(s => s.done).length;
  const subtaskTotal = task.subtasks.length;

  function handleTouchStart() {
    const timer = window.setTimeout(() => {
      onLongPress();
    }, 500);
    setPressTimer(timer);
  }

  function handleTouchEnd() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={`ios-card p-3 cursor-pointer active:scale-[0.98] transition-transform ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* 优先级色条 */}
      <div className={`h-1 rounded-full mb-2 ${priorityColor.dot}`} />

      {/* 标题 */}
      <div className={`text-[14px] font-medium leading-snug ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>
        {task.title}
      </div>

      {/* 描述 */}
      {task.description && (
        <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
          {task.description}
        </div>
      )}

      {/* 标签 */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map(t => (
            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_COLORS.emerald}`}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={overdue ? 'text-rose-500 font-medium' : ''}>
              📅 {formatDate(task.dueDate)}
            </span>
          )}
          {subtaskTotal > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSubtasks(!showSubtasks); }}
              className={`px-1.5 py-0.5 rounded-full font-medium active:scale-95 transition-transform ${
                subtaskDone === subtaskTotal
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'
              }`}
            >
              {subtaskDone === subtaskTotal ? '✓' : '◐'} {subtaskDone}/{subtaskTotal} {showSubtasks ? '▴' : '▾'}
            </button>
          )}
          {task.recurrence && (
            <span>🔁 {task.recurrence === 'daily' ? '日' : task.recurrence === 'weekly' ? '周' : '月'}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.pomodoros > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onStartPomodoro) onStartPomodoro(task);
              }}
              className="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 font-medium active:scale-95 transition-transform"
              title="点击开始番茄钟"
            >🍅 {task.pomodoros}</button>
          )}
          <span className={`px-1.5 py-0.5 rounded ${priorityColor.bg} ${priorityColor.text} font-medium`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        </div>
      </div>

      {/* 子任务展开列表 */}
      {showSubtasks && subtaskTotal > 0 && (
        <div className="mt-2 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800 fade-in">
          {task.subtasks.map(s => (
            <div
              key={s.id}
              className="flex items-center gap-2 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={async () => {
                  const newSubs = task.subtasks.map(x =>
                    x.id === s.id ? { ...x, done: !x.done } : x
                  );
                  await updateTask(task.id, { subtasks: newSubs });
                }}
                className={`ios-checkbox ${s.done ? 'checked' : ''}`}
                style={{ width: 18, height: 18 }}
              />
              <span className={`flex-1 text-[12px] ${s.done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                {s.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 拖拽提示 */}
      <div className="text-[10px] text-slate-300 dark:text-slate-600 mt-1.5 text-center">
        ⋮⋮ 长按拖拽切换分类
      </div>
    </div>
  );
}
