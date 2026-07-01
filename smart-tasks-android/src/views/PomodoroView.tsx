import { useState, useEffect, useRef, useCallback } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import { STATUS_LABELS, formatDate } from '../lib/task-utils';
import { showToast } from '../components/Toast';
import { aiFocusSuggestion, getAISettings } from '../lib/ai-client';
import { Haptics } from '@capacitor/haptics';

interface Props {
  onEdit: (t: Task) => void;
  initialTaskId?: string;
}

const WORK_MINUTES = 25;
const BREAK_MINUTES = 5;

export default function PomodoroView({ onEdit, initialTaskId }: Props) {
  const { tasks, recordPomodoro, pomodoros } = useTaskStore();
  const [focusSuggestion, setFocusSuggestion] = useState<string>('');
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');

  useEffect(() => {
    if (initialTaskId) setSelectedTaskId(initialTaskId);
  }, [initialTaskId]);

  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [secondsLeft, setSecondsLeft] = useState(WORK_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const totalSeconds = mode === 'work' ? WORK_MINUTES * 60 : BREAK_MINUTES * 60;
  const progress = 1 - secondsLeft / totalSeconds;

  const availableTasks = tasks.filter(t => !t.deletedAt && t.status !== 'done' && t.status !== 'cancelled');

  const handleComplete = useCallback(async () => {
    setRunning(false);
    try {
      await Haptics.vibrate({ duration: 800 });
      setTimeout(() => Haptics.vibrate({ duration: 800 }), 400);
      setTimeout(() => Haptics.vibrate({ duration: 800 }), 800);
    } catch (e) {}
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.requestPermissions();
      if (mode === 'work') {
        await LocalNotifications.schedule({
          notifications: [{
            id: Date.now(),
            title: '🍅 专注完成！',
            body: '坚持了一整个番茄钟，去休息 5 分钟吧～',
            schedule: { at: new Date(Date.now() + 100) },
          }],
        });
      } else {
        await LocalNotifications.schedule({
          notifications: [{
            id: Date.now(),
            title: '☕ 休息结束',
            body: '精力充沛，继续下一个番茄钟吧！',
            schedule: { at: new Date(Date.now() + 100) },
          }],
        });
      }
    } catch (e) {}
    if (mode === 'work') {
      if (selectedTaskId) await recordPomodoro(selectedTaskId, WORK_MINUTES * 60);
      setCompletedCount(c => c + 1);
      showToast('🍅 专注完成！休息一下吧', 'success');
      setMode('break');
      setSecondsLeft(BREAK_MINUTES * 60);
    } else {
      showToast('休息结束，继续加油 💪', 'info');
      setMode('work');
      setSecondsLeft(WORK_MINUTES * 60);
    }
  }, [mode, selectedTaskId, recordPomodoro]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { handleComplete(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, handleComplete]);

  function toggle() {
    if (secondsLeft === 0) setSecondsLeft(totalSeconds);
    setRunning(r => !r);
  }
  function reset() { setRunning(false); setSecondsLeft(totalSeconds); }
  function skip() { setRunning(false); setSecondsLeft(0); handleComplete(); }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  // 圆形计时器几何
  const size = 280;
  const stroke = 12;
  const radius = (size - stroke * 2) / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const accentColor = mode === 'work' ? 'var(--primary)' : 'var(--accent-sky)';
  const accentGlow  = mode === 'work' ? 'var(--primary-glow)' : 'rgba(91,200,255,0.5)';

  return (
    <div className="px-5 py-5 h-full flex flex-col">
      {/* 模式切换 */}
      <div
        className="flex p-1 mb-6 rounded-full"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
      >
        <button
          onClick={() => { if (mode !== 'work') { setMode('work'); setSecondsLeft(WORK_MINUTES * 60); setRunning(false); } }}
          className="flex-1 py-2.5 rounded-full text-[13px] font-bold transition-all"
          style={{
            background: mode === 'work' ? 'linear-gradient(135deg, var(--primary), var(--primary-strong))' : 'transparent',
            color: mode === 'work' ? '#06140F' : 'var(--text-secondary)',
            boxShadow: mode === 'work' ? '0 4px 14px var(--primary-glow)' : 'none',
          }}
        >专注 {WORK_MINUTES} 分钟</button>
        <button
          onClick={() => { if (mode !== 'break') { setMode('break'); setSecondsLeft(BREAK_MINUTES * 60); setRunning(false); } }}
          className="flex-1 py-2.5 rounded-full text-[13px] font-bold transition-all"
          style={{
            background: mode === 'break' ? 'linear-gradient(135deg, var(--accent-sky), #3BAAE0)' : 'transparent',
            color: mode === 'break' ? '#06140F' : 'var(--text-secondary)',
            boxShadow: mode === 'break' ? '0 4px 14px rgba(91,200,255,0.4)' : 'none',
          }}
        >休息 {BREAK_MINUTES} 分钟</button>
      </div>

      {/* 发光圆形计时器 */}
      <div className="flex justify-center mb-6">
        <div className="relative" style={{ width: size, height: size }}>
          {/* 外层光晕 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${accentGlow} 0%, transparent 65%)`,
              opacity: running ? 0.6 : 0.3,
              animation: running ? 'pulse 2.4s ease-in-out infinite' : 'none',
            }}
          />
          <svg width={size} height={size} className="absolute inset-0 -rotate-90 glow-ring">
            <defs>
              <linearGradient id="pomoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={mode === 'work' ? '#2EE6A6' : '#5BC8FF'} />
                <stop offset="100%" stopColor={mode === 'work' ? '#25C98F' : '#3BAAE0'} />
              </linearGradient>
            </defs>
            {/* 背景轨道 */}
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke="var(--card)" strokeWidth={stroke}
            />
            {/* 进度环 */}
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke="url(#pomoGrad)" strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear', filter: `drop-shadow(0 0 8px ${accentGlow})` }}
            />
          </svg>
          {/* 中心数字 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="text-[56px] font-black tabular-nums leading-none"
              style={{
                color: accentColor,
                animation: running ? 'pulse 2s ease-in-out infinite' : 'none',
                textShadow: `0 0 24px ${accentGlow}`,
              }}
            >
              {mm}:{ss}
            </div>
            <div className="text-[12px] mt-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {mode === 'work' ? '保持专注' : '放松一下'}
            </div>
            {completedCount > 0 && (
              <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                今日完成 🍅 × {completedCount}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 关联任务 */}
      {mode === 'work' && (
        <div className="mb-4">
          <div className="text-[13px] font-bold mb-2 px-1" style={{ color: 'var(--text-secondary)' }}>
            关联任务（可选）
          </div>
          {selectedTask ? (
            <div
              onClick={() => onEdit(selectedTask)}
              className="v3-card p-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
            >
              <div
                className="priority-bar"
                style={{
                  background: selectedTask.priority === 'high' ? 'var(--pri-high)' : selectedTask.priority === 'medium' ? 'var(--pri-medium)' : 'var(--pri-low)',
                  width: 4, borderRadius: 4,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{selectedTask.title}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {STATUS_LABELS[selectedTask.status]}
                  {selectedTask.dueDate && ` · ${formatDate(selectedTask.dueDate)}`}
                  {selectedTask.pomodoros > 0 && ` · 🍅 ${selectedTask.pomodoros}`}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedTaskId(''); }}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--card)', color: 'var(--text-secondary)' }}
              >×</button>
            </div>
          ) : (
            <select value={selectedTaskId} onChange={e => setSelectedTaskId(e.target.value)} className="ios-input">
              <option value="">不关联任务</option>
              {availableTasks.map(t => (<option key={t.id} value={t.id}>{t.title}</option>))}
            </select>
          )}
        </div>
      )}

      {/* AI 专注建议 */}
      {getAISettings() && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: 'var(--accent-violet)' }}>
              <span>✦</span>
              <span>AI 专注建议</span>
            </div>
            <button
              onClick={async () => {
                setLoadingSuggestion(true);
                setFocusSuggestion('');
                try {
                  const r = await aiFocusSuggestion(tasks, pomodoros);
                  setFocusSuggestion(r);
                } catch (e: any) {
                  showToast(e.message || '获取建议失败', 'error');
                } finally {
                  setLoadingSuggestion(false);
                }
              }}
              disabled={loadingSuggestion}
              className="text-[11px] px-3 py-1.5 rounded-full font-bold active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'rgba(139,124,255,0.16)', border: '1px solid rgba(139,124,255,0.35)', color: 'var(--accent-violet)' }}
            >
              {loadingSuggestion ? '思考中…' : focusSuggestion ? '重新建议' : '获取建议'}
            </button>
          </div>
          {focusSuggestion && (
            <div className="v3-card p-3.5 fade-in" style={{ background: 'rgba(139,124,255,0.08)' }}>
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                {focusSuggestion}
              </div>
            </div>
          )}
          {!focusSuggestion && !loadingSuggestion && (
            <div className="text-[11px] px-1" style={{ color: 'var(--text-tertiary)' }}>
              AI 会根据你的任务列表和今日番茄钟数，给出最该专注的事情
            </div>
          )}
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex gap-3 mt-auto">
        <button
          onClick={reset}
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl active:scale-90 transition-transform"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >↻</button>
        <button
          onClick={toggle}
          className="flex-1 h-14 rounded-full text-[15px] font-bold active:scale-95 transition-transform"
          style={{
            background: mode === 'work'
              ? 'linear-gradient(135deg, var(--primary), var(--primary-strong))'
              : 'linear-gradient(135deg, var(--accent-sky), #3BAAE0)',
            color: '#06140F',
            boxShadow: mode === 'work' ? '0 8px 20px var(--primary-glow)' : '0 8px 20px rgba(91,200,255,0.4)',
          }}
        >
          {running ? '暂停' : (secondsLeft === totalSeconds ? '开始' : '继续')}
        </button>
        <button
          onClick={skip}
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl active:scale-90 transition-transform"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >⏭</button>
      </div>
    </div>
  );
}
