import { useState, useRef } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import {
  PRIORITY_LABELS, STATUS_LABELS, STATUS_ORDER, formatDate, isOverdue,
} from '../lib/task-utils';
import { showToast } from './Toast';
import SwipeableSheet from './SwipeableSheet';

interface Props {
  task: Task;
  onEdit: (t: Task) => void;
  onStartPomodoro?: (t: Task) => void;
  compact?: boolean;
}

// v4 design tokens (mirror of CSS variables for inline use)
const PRI_VAR: Record<Task['priority'], { bar: string; soft: string; text: string }> = {
  high:   { bar: 'var(--pri-high)',    soft: 'var(--pri-high-soft)',    text: 'var(--pri-high)' },
  medium: { bar: 'var(--pri-medium)',  soft: 'var(--pri-medium-soft)',  text: 'var(--pri-medium)' },
  low:    { bar: 'var(--pri-low)',     soft: 'var(--pri-low-soft)',     text: 'var(--pri-low)' },
};
const STATUS_VAR: Record<string, { soft: string; text: string; dot: string }> = {
  todo:        { soft: 'var(--pri-low-soft)',     text: 'var(--pri-low)',     dot: 'var(--stat-todo)' },
  in_progress: { soft: 'var(--pri-medium-soft)',  text: 'var(--pri-medium)',  dot: 'var(--stat-progress)' },
  done:        { soft: 'var(--primary-soft)',     text: 'var(--primary)',     dot: 'var(--stat-done)' },
  cancelled:   { soft: 'var(--bg-elevated)',      text: 'var(--text-secondary)', dot: 'var(--stat-cancelled)' },
};

const SWIPE_THRESHOLD = 88;

export default function TaskCard({ task, onEdit, onStartPomodoro, compact = false }: Props) {
  const { completeTask, updateTask, softDeleteTask, tags } = useTaskStore();
  const [showActions, setShowActions] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false);

  // Swipe gesture state
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontal = useRef<boolean | null>(null);

  const pri = PRI_VAR[task.priority];
  const stat = STATUS_VAR[task.status];
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

  // === Swipe handlers ===
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    isHorizontal.current = null;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    if (isHorizontal.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy) * 1.2;
    }
    if (isHorizontal.current === true) {
      if (e.cancelable) e.preventDefault();
      // 左滑揭示删除；右滑揭示完成
      const clamped = Math.max(-140, Math.min(140, dx));
      setDragX(clamped);
    }
  }

  function onTouchEnd() {
    if (touchStartX.current === null) return;
    setDragging(false);
    if (isHorizontal.current === true) {
      // 超过阈值后保持揭示，等待用户点击确认按钮
      if (dragX <= -SWIPE_THRESHOLD) {
        setDragX(-88);
      } else if (dragX >= SWIPE_THRESHOLD) {
        setDragX(88);
      } else {
        setDragX(0);
      }
    } else {
      setDragX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontal.current = null;
  }

  const tagColor = (name: string) => {
    const tg = tags.find(t => t.name === name);
    return tg?.color || 'violet';
  };
  const TAG_DOT: Record<string, string> = {
    emerald: 'var(--primary)', amber: 'var(--accent-amber)', rose: 'var(--pri-high)',
    violet: 'var(--accent-violet)', sky: 'var(--accent-sky)', teal: 'var(--primary)',
    orange: 'var(--accent-amber)', slate: 'var(--text-secondary)',
  };

  return (
    <>
      <div className="relative overflow-hidden" style={{ borderRadius: 'var(--r-card)' }}>
        {/* 左侧揭示：完成确认按钮 */}
        <button
          className="absolute inset-y-0 left-0 flex items-center justify-center"
          style={{
            width: 88,
            transform: dragX > 0 ? `translateX(${dragX - 88}px)` : 'translateX(-88px)',
            transition: dragging ? 'none' : 'transform 0.25s',
            background: 'var(--primary)',
            border: 'none',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setDragX(0);
            handleCheck();
          }}
        >
          <div className="flex flex-col items-center" style={{ color: '#ffffff' }}>
            <span style={{ fontSize: 22 }}>{isDone ? '↺' : '✓'}</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{isDone ? '恢复' : '完成'}</span>
          </div>
        </button>

        {/* 右侧揭示：删除确认按钮 */}
        <button
          className="absolute inset-y-0 right-0 flex items-center justify-center"
          style={{
            width: 88,
            transform: dragX < 0 ? `translateX(${dragX + 88}px)` : 'translateX(88px)',
            transition: dragging ? 'none' : 'transform 0.25s',
            background: 'var(--pri-high)',
            border: 'none',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setDragX(0);
            softDeleteTask(task.id);
            showToast('已移入回收站', 'info');
          }}
        >
          <div className="flex flex-col items-center" style={{ color: '#ffffff' }}>
            <span style={{ fontSize: 22 }}>🗑</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>删除</span>
          </div>
        </button>

        {/* 卡片本体 — 白色卡片 + 左侧优先级色条 */}
        <div
          className="ios-card relative"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
            opacity: isDone ? 0.6 : 1,
          }}
          onClick={() => onEdit(task)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex">
            {/* 左侧优先级色条 */}
            <div
              className="priority-bar"
              style={{ background: pri.bar, margin: '12px 0 12px 14px', width: 4, borderRadius: 4 }}
            />
            <div className="flex-1 p-3.5">
              <div className="flex items-start gap-2.5">
                <button
                  className={`ios-checkbox ${isDone ? 'checked' : ''} mt-0.5`}
                  onClick={(e) => { e.stopPropagation(); handleCheck(); }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[15px] font-semibold leading-snug"
                    style={{
                      color: isDone ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </div>
                  {task.description && !compact && (
                    <div className="text-[13px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {task.description}
                    </div>
                  )}
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: pri.soft, color: pri.text, border: `1px solid ${pri.bar}40` }}
                >
                  {PRIORITY_LABELS[task.priority]}
                </span>
              </div>

              {task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                  {task.tags.slice(0, 4).map(tagName => (
                    <span
                      key={tagName}
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ color: TAG_DOT[tagColor(tagName)] }}>#</span>{tagName}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-2 ml-8 text-[11px] flex-wrap">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowStatusSheet(true); }}
                  className="px-2 py-0.5 rounded-full font-bold active:scale-95 transition-transform"
                  style={{ background: stat.soft, color: stat.text, border: `1px solid ${stat.dot}40` }}
                >
                  {STATUS_LABELS[task.status]} ▾
                </button>
                {task.dueDate && (
                  <span
                    className="font-medium flex items-center gap-1"
                    style={{ color: overdue ? 'var(--pri-high)' : 'var(--text-secondary)' }}
                  >
                    <span>{overdue ? '⚠' : '◷'}</span>
                    <span>{formatDate(task.dueDate)}</span>
                  </span>
                )}
                {task.recurrence && (
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    ↻ {task.recurrence === 'daily' ? '每日' : task.recurrence === 'weekly' ? '每周' : '每月'}
                  </span>
                )}
                {subtaskTotal > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSubtasks(!showSubtasks); }}
                    className="px-2 py-0.5 rounded-full font-bold active:scale-95 transition-transform"
                    style={{
                      background: subtaskDone === subtaskTotal ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                      color: subtaskDone === subtaskTotal ? 'var(--primary)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {subtaskDone === subtaskTotal ? '✓' : '◐'} {subtaskDone}/{subtaskTotal} {showSubtasks ? '▴' : '▾'}
                  </button>
                )}
                {task.pomodoros > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onStartPomodoro) {
                        onStartPomodoro(task);
                      } else {
                        showToast('请到专注页面开始专注', 'info');
                      }
                    }}
                    className="px-2 py-0.5 rounded-full font-bold active:scale-95 transition-transform"
                    style={{
                      background: 'var(--pri-high-soft)',
                      color: 'var(--pri-high)',
                      border: '1px solid var(--pri-high)40',
                    }}
                    title="点击开始番茄钟"
                  >🍅 {task.pomodoros}</button>
                )}
              </div>

              {showSubtasks && subtaskTotal > 0 && (
                <div className="mt-2 ml-8 space-y-1 fade-in">
                  {task.subtasks.map(s => (
                    <div key={s.id} className="flex items-center gap-2 py-1">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
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
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }}
              className="px-3 active:opacity-60"
              style={{ color: 'var(--text-tertiary)' }}
            >⋯</button>
          </div>

          {showActions && (
            <div className="flex border-t fade-in" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowActions(false); onEdit(task); }}
                className="flex-1 py-2.5 text-[13px] font-semibold"
                style={{ color: 'var(--accent-sky)' }}
              >编辑</button>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <button
                onClick={(e) => { e.stopPropagation(); setShowActions(false); setShowStatusSheet(true); }}
                className="flex-1 py-2.5 text-[13px] font-semibold"
                style={{ color: 'var(--primary)' }}
              >切换状态</button>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <button
                onClick={(e) => { e.stopPropagation(); setShowActions(false); softDeleteTask(task.id); showToast('已移入回收站', 'info'); }}
                className="flex-1 py-2.5 text-[13px] font-semibold"
                style={{ color: 'var(--pri-high)' }}
              >删除</button>
            </div>
          )}
        </div>
      </div>

      {/* 状态选择 ActionSheet */}
      {showStatusSheet && (
        <SwipeableSheet onClose={() => setShowStatusSheet(false)} zIndex={80} showEdgeIndicator={false}>
            <div className="text-center text-[15px] font-semibold py-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              选择状态
            </div>
            <div className="p-3 space-y-2">
              {STATUS_ORDER.map(s => {
                const sc = STATUS_VAR[s];
                const isCurrent = s === task.status;
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
                onClick={() => setShowStatusSheet(false)}
                className="w-full py-3 rounded-xl text-[15px] font-medium"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >取消</button>
            </div>
        </SwipeableSheet>
      )}
    </>
  );
}
