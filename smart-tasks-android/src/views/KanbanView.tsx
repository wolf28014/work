import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import {
  STATUS_LABELS, STATUS_ORDER, PRIORITY_LABELS,
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

// v3 design tokens
const STATUS_TOKEN: Record<string, { dot: string; soft: string; text: string }> = {
  todo:        { dot: 'var(--stat-todo)',      soft: 'rgba(91,200,255,0.14)',  text: 'var(--accent-sky)' },
  in_progress: { dot: 'var(--stat-progress)',  soft: 'rgba(245,181,68,0.14)',  text: 'var(--accent-amber)' },
  done:        { dot: 'var(--stat-done)',      soft: 'var(--primary-soft)',    text: 'var(--primary)' },
  cancelled:   { dot: 'var(--stat-cancelled)', soft: 'var(--card-hover)', text: 'var(--text-secondary)' },
};
const PRI_TOKEN: Record<string, { bar: string; soft: string; text: string }> = {
  high:   { bar: 'var(--pri-high)',    soft: 'var(--pri-high-soft)',    text: 'var(--pri-high)' },
  medium: { bar: 'var(--pri-medium)',  soft: 'var(--pri-medium-soft)',  text: 'var(--pri-medium)' },
  low:    { bar: 'var(--pri-low)',     soft: 'var(--pri-low-soft)',     text: 'var(--pri-low)' },
};
const TAG_DOT: Record<string, string> = {
  emerald: 'var(--primary)', amber: 'var(--accent-amber)', rose: 'var(--pri-high)',
  violet: 'var(--accent-violet)', sky: 'var(--accent-sky)', teal: 'var(--primary)',
  orange: 'var(--accent-amber)', slate: 'var(--text-secondary)',
};

export default function KanbanView({ onEdit, onStartPomodoro }: Props) {
  const { tasks, updateTask, softDeleteTask, tags } = useTaskStore();
  const [selectedStatus, setSelectedStatus] = useState<string>('todo');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [statusChangeTaskId, setStatusChangeTaskId] = useState<string | null>(null);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const columns = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], done: [], cancelled: [] };
    tasks.filter(t => !t.deletedAt).forEach(t => {
      if (map[t.status]) map[t.status].push(t);
    });
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

  const currentTasks = columns[selectedStatus] || [];
  const totalActive = tasks.filter(t => !t.deletedAt).length;

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

  return (
    <div className="h-full flex flex-col">
      {/* 顶部统计栏 */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ background: 'var(--bar-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}
      >
        <button onClick={() => !batchMode && setShowCategorySheet(true)} className="flex items-center gap-2 flex-1">
          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            共 {totalActive} 个任务 · 4 个分类
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--primary)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_TOKEN[selectedStatus].dot }} />
            <span>{STATUS_LABELS[selectedStatus]}（{currentTasks.length}）</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>▾</span>
          </span>
        </button>
        <button
          onClick={() => {
            if (batchMode) setSelectedIds(new Set());
            setBatchMode(!batchMode);
          }}
          className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform ml-2"
          style={{
            background: batchMode ? 'var(--pri-high-soft)' : 'var(--card)',
            border: `1px solid ${batchMode ? 'rgba(255,110,127,0.35)' : 'var(--border)'}`,
            color: batchMode ? 'var(--pri-high)' : 'var(--text-secondary)',
          }}
        >{batchMode ? '退出批量' : '🗑 批量'}</button>
      </div>

      {/* 批量操作工具栏 */}
      {batchMode && (
        <div
          className="px-4 py-2 fade-in flex items-center justify-between"
          style={{ background: 'var(--pri-high-soft)', borderBottom: '1px solid rgba(255,110,127,0.25)' }}
        >
          <span className="text-[12px] font-bold" style={{ color: 'var(--pri-high)' }}>
            已选 {selectedIds.size} / {currentTasks.length} 项
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const newSet = new Set(selectedIds);
                currentTasks.forEach(t => newSet.add(t.id));
                setSelectedIds(newSet);
              }}
              className="px-3 py-1.5 text-[12px] font-bold rounded-full active:scale-95 transition-transform"
              style={{ background: 'var(--card-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >全选</button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-[12px] font-bold rounded-full active:scale-95 transition-transform"
              style={{ background: 'var(--card-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
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
              className="px-3 py-1.5 text-[12px] font-bold rounded-full active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'var(--pri-high)', color: '#1A0B0E' }}
            >删除</button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：分类列表 */}
        <aside
          className="w-[92px] flex-shrink-0 overflow-y-auto no-scrollbar py-2.5 px-2 space-y-2"
          style={{ background: 'var(--bg-elevated)', borderRight: '1px solid var(--border)' }}
        >
          {STATUS_ORDER.map(status => {
            const sc = STATUS_TOKEN[status];
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
                className="relative w-full flex flex-col items-center justify-center py-3 px-1 rounded-2xl transition-all active:scale-95"
                style={{
                  background: isActive ? 'var(--primary-soft)' : isDragOver ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                  border: `1px solid ${isActive ? 'var(--primary-border)' : isDragOver ? 'var(--primary-border)' : 'var(--border)'}`,
                  boxShadow: isActive ? '0 4px 14px var(--primary-glow)' : 'none',
                }}
              >
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center mb-1.5 relative"
                  style={{ background: sc.soft, border: `1px solid ${sc.dot}40` }}
                >
                  <div
                    className="rounded-full transition-transform"
                    style={{ width: 14, height: 14, background: sc.dot, transform: isActive ? 'scale(1.15)' : 'none', boxShadow: `0 0 8px ${sc.dot}` }}
                  />
                  {count > 0 && (
                    <div
                      className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
                      style={{ background: isActive ? 'var(--primary)' : 'var(--card)', color: isActive ? '#ffffff' : 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                      {count > 99 ? '99+' : count}
                    </div>
                  )}
                </div>
                <div
                  className="text-[12px] font-bold leading-tight"
                  style={{ color: isActive ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {STATUS_LABELS[status]}
                </div>
              </button>
            );
          })}

          <div className="pt-2 px-1 text-center">
            <div className="text-[9px] leading-tight" style={{ color: 'var(--text-quaternary)' }}>
              拖拽任务<br/>到此切换
            </div>
          </div>
        </aside>

        {/* 右侧：任务列表 */}
        <main className="flex-1 overflow-y-auto no-scrollbar">
          {/* 当前列头部 */}
          <div
            className="px-4 py-3 sticky top-0 z-10"
            style={{ background: 'var(--bar-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full" style={{ background: STATUS_TOKEN[selectedStatus].dot, boxShadow: `0 0 8px ${STATUS_TOKEN[selectedStatus].dot}` }} />
                <span className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  {STATUS_LABELS[selectedStatus]}
                </span>
                <span
                  className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: STATUS_TOKEN[selectedStatus].soft, color: STATUS_TOKEN[selectedStatus].text, border: `1px solid ${STATUS_TOKEN[selectedStatus].dot}40` }}
                >
                  {currentTasks.length}
                </span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>长按拖拽</div>
            </div>
          </div>

          {/* 任务卡片列表 */}
          <div className="p-3 space-y-2.5 min-h-[200px] kanban-task-grid" onDragOver={e => e.preventDefault()}>
            {currentTasks.length === 0 ? (
              <div className="text-center py-16">
                <div
                  className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                >
                  <span style={{ fontSize: 22, color: 'var(--text-tertiary)' }}>📂</span>
                </div>
                <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  「{STATUS_LABELS[selectedStatus]}」分类下暂无任务
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
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
                      tagColorDot={(name: string) => TAG_DOT[tags.find(t => t.name === name)?.color || 'violet'] || 'var(--primary)'}
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
            <div className="text-center text-[15px] font-bold py-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              移动到分类
            </div>
            <div className="p-3 space-y-2">
              {STATUS_ORDER.map(s => {
                const sc = STATUS_TOKEN[s];
                const isCurrent = s === (tasks.find(t => t.id === statusChangeTaskId)?.status);
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98]"
                    style={{
                      background: isCurrent ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                      border: `1px solid ${isCurrent ? 'var(--primary-border)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ background: sc.dot }} />
                    <span className="flex-1 text-left text-[15px] font-medium" style={{ color: isCurrent ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {STATUS_LABELS[s]}
                    </span>
                    {isCurrent && <span style={{ color: 'var(--primary)', fontSize: 18 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="px-3 pb-2">
              <button
                onClick={() => setStatusChangeTaskId(null)}
                className="w-full py-3 rounded-xl text-[15px] font-medium"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >取消</button>
            </div>
        </SwipeableSheet>
      )}

      {/* 顶部分类切换 ActionSheet */}
      {showCategorySheet && (
        <SwipeableSheet onClose={() => setShowCategorySheet(false)} zIndex={80} showEdgeIndicator={false}>
            <div className="text-center text-[15px] font-bold py-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              选择分类
            </div>
            <div className="p-3 space-y-2">
              {STATUS_ORDER.map(s => {
                const sc = STATUS_TOKEN[s];
                const isCurrent = s === selectedStatus;
                const count = columns[s].length;
                return (
                  <button
                    key={s}
                    onClick={() => { setSelectedStatus(s); setShowCategorySheet(false); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98]"
                    style={{
                      background: isCurrent ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                      border: `1px solid ${isCurrent ? 'var(--primary-border)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ background: sc.dot }} />
                    <span className="flex-1 text-left text-[15px] font-medium" style={{ color: isCurrent ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {STATUS_LABELS[s]}
                    </span>
                    <span
                      className="text-[12px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: sc.soft, color: sc.text, border: `1px solid ${sc.dot}40` }}
                    >
                      {count}
                    </span>
                    {isCurrent && <span style={{ color: 'var(--primary)', fontSize: 18 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="px-3 pb-2">
              <button
                onClick={() => setShowCategorySheet(false)}
                className="w-full py-3 rounded-xl text-[15px] font-medium"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >取消</button>
            </div>
        </SwipeableSheet>
      )}
    </div>
  );
}

interface KanbanCardProps {
  task: Task;
  tagColorDot: (name: string) => string;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onLongPress: () => void;
  isDragging: boolean;
  onStartPomodoro?: (t: Task) => void;
}

function KanbanCard({ task, tagColorDot, onClick, onDragStart, onDragEnd, onLongPress, isDragging, onStartPomodoro }: KanbanCardProps) {
  const pri = PRI_TOKEN[task.priority];
  const overdue = isOverdue(task);
  const [pressTimer, setPressTimer] = useState<number | null>(null);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const { updateTask, tasks: allTasks } = useTaskStore();
  const subtaskDone = task.subtasks.filter(s => s.done).length;
  const subtaskTotal = task.subtasks.length;

  // 重复任务完成频次
  const recurrenceInfo = useMemo(() => {
    if (!task.recurrence) return null;
    const completed = allTasks.filter(t => !t.deletedAt && t.title === task.title && t.status === 'done' && t.completedAt);
    if (completed.length === 0) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - (now.getDay() * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastDone = completed.reduce((max, t) => t.completedAt! > max ? t.completedAt! : max, 0);
    const lastDoneDate = new Date(lastDone);
    const lastDoneStr = `${lastDoneDate.getMonth() + 1}月${lastDoneDate.getDate()}日`;
    if (task.recurrence === 'daily') {
      const todayDone = completed.filter(t => t.completedAt! >= todayStart);
      return { text: todayDone.length > 0 ? `${lastDoneStr}已完成` : '今日未完成', count: `本周${completed.filter(t => t.completedAt! >= weekStart).length}次`, done: todayDone.length > 0 };
    } else if (task.recurrence === 'weekly') {
      const weekDone = completed.filter(t => t.completedAt! >= weekStart);
      return { text: weekDone.length > 0 ? `${lastDoneStr}已完成` : '本周未完成', count: `本月${completed.filter(t => t.completedAt! >= monthStart).length}次`, done: weekDone.length > 0 };
    } else {
      const monthDone = completed.filter(t => t.completedAt! >= monthStart);
      return { text: monthDone.length > 0 ? `${lastDoneStr}已完成` : '本月未完成', count: `总计${completed.length}次`, done: monthDone.length > 0 };
    }
  }, [task, allTasks]);

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
      className="v3-card p-3 cursor-pointer active:scale-[0.98] transition-transform"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {/* 优先级色条 */}
      <div className="h-1 rounded-full mb-2" style={{ background: pri.bar, boxShadow: `0 0 8px ${pri.bar}` }} />

      {/* 标题 */}
      <div
        className="text-[14px] font-semibold leading-snug"
        style={{
          color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </div>

      {/* 描述 */}
      {task.description && (
        <div className="text-[12px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {task.description}
        </div>
      )}

      {/* 标签 */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {task.tags.slice(0, 3).map(t => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              <span style={{ color: tagColorDot(t) }}>#</span>{t}
            </span>
          ))}
        </div>
      )}

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className="font-medium" style={{ color: overdue ? 'var(--pri-high)' : 'var(--text-secondary)' }}>
              📅 {formatDate(task.dueDate)}
            </span>
          )}
          {subtaskTotal > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSubtasks(!showSubtasks); }}
              className="px-1.5 py-0.5 rounded-full font-bold active:scale-95 transition-transform"
              style={{
                background: subtaskDone === subtaskTotal ? 'var(--primary-soft)' : 'var(--card)',
                color: subtaskDone === subtaskTotal ? 'var(--primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {subtaskDone === subtaskTotal ? '✓' : '◐'} {subtaskDone}/{subtaskTotal} {showSubtasks ? '▴' : '▾'}
            </button>
          )}
          {task.recurrence && (
            <span style={{ color: recurrenceInfo?.done ? 'var(--stat-done, #10B981)' : 'var(--text-tertiary)', fontWeight: recurrenceInfo?.done ? 600 : 400 }}>
              ↻ {task.recurrence === 'daily' ? '日' : task.recurrence === 'weekly' ? '周' : '月'}
              {recurrenceInfo && ` · ${recurrenceInfo.text} · ${recurrenceInfo.count}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.pomodoros > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); if (onStartPomodoro) onStartPomodoro(task); }}
              className="px-1.5 py-0.5 rounded-full font-bold active:scale-95 transition-transform"
              style={{ background: 'rgba(255,110,127,0.12)', color: 'var(--pri-high)', border: '1px solid rgba(255,110,127,0.3)' }}
              title="点击开始番茄钟"
            >🍅 {task.pomodoros}</button>
          )}
          <span
            className="px-1.5 py-0.5 rounded font-bold"
            style={{ background: pri.soft, color: pri.text, border: `1px solid ${pri.bar}40` }}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
        </div>
      </div>

      {/* 子任务展开列表 */}
      {showSubtasks && subtaskTotal > 0 && (
        <div className="mt-2 space-y-1 pt-2 border-t fade-in" style={{ borderColor: 'var(--border)' }}>
          {task.subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-1" onClick={(e) => e.stopPropagation()}>
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
              <span
                className="flex-1 text-[12px]"
                style={{
                  color: s.done ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  textDecoration: s.done ? 'line-through' : 'none',
                }}
              >
                {s.title}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--text-quaternary)' }}>
        ⋮⋮ 长按拖拽切换分类
      </div>
    </div>
  );
}
