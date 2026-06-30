import { useState, useEffect } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import { PRIORITY_LABELS, STATUS_LABELS, STATUS_ORDER, todayStr } from '../lib/task-utils';
import { parseTaskWithAI, getAISettings, aiSplitSubtasks, aiTaskSummary } from '../lib/ai-client';
import { showToast } from './Toast';

interface Props {
  task: Task | null;
  onClose: () => void;
}

export default function TaskEditor({ task, onClose }: Props) {
  const { createTask, updateTask, tags, ensureTag } = useTaskStore();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [status, setStatus] = useState(task?.status || 'todo');
  const [recurrence, setRecurrence] = useState(task?.recurrence || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(task?.tags || []);
  const [subtasks, setSubtasks] = useState(task?.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [parsing, setParsing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [loadingSummary, setLoadingSummary] = useState(false);

  async function handleAIParse() {
    if (!title.trim()) return;
    setParsing(true);
    try {
      const parsed = await parseTaskWithAI(title, todayStr());
      if (parsed.title) setTitle(parsed.title);
      if (parsed.dueDate) setDueDate(parsed.dueDate);
      if (parsed.priority) setPriority(parsed.priority);
      if (parsed.tags) {
        const merged = Array.from(new Set([...selectedTags, ...parsed.tags]));
        setSelectedTags(merged);
        for (const t of parsed.tags) await ensureTag(t);
      }
      if (parsed.description) setDescription(parsed.description);
      showToast('AI 解析完成 ✨', 'success');
    } catch (e: any) {
      showToast(e.message || 'AI 解析失败', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleAISplit() {
    if (!title.trim()) { showToast('请先填写任务标题', 'error'); return; }
    setSplitting(true);
    try {
      const result = await aiSplitSubtasks(title, description);
      // 合并到现有子任务，避免重复
      const existingTitles = new Set(subtasks.map(s => s.title));
      const newSubs = result
        .filter(t => !existingTitles.has(t))
        .map((t, i) => ({ id: 'sub_' + Date.now() + '_' + i, title: t, done: false, order: subtasks.length + i }));
      if (newSubs.length === 0) {
        showToast('AI 生成的子任务已存在', 'info');
      } else {
        setSubtasks([...subtasks, ...newSubs]);
        showToast(`AI 生成了 ${newSubs.length} 个子任务 ✨`, 'success');
      }
    } catch (e: any) {
      showToast(e.message || 'AI 拆解失败', 'error');
    } finally {
      setSplitting(false);
    }
  }

  async function handleAISummary() {
    if (!task) { showToast('请先保存任务', 'error'); return; }
    setLoadingSummary(true);
    setSummary('');
    try {
      const result = await aiTaskSummary({
        ...task,
        title, description, priority, status,
        dueDate: dueDate || null,
        tags: selectedTags,
        subtasks,
      });
      setSummary(result);
    } catch (e: any) {
      showToast(e.message || 'AI 总结失败', 'error');
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) { showToast('请填写任务标题', 'error'); return; }
    const data = {
      title: title.trim(), description: description.trim(),
      dueDate: dueDate || null, priority, status,
      recurrence: recurrence || null, tags: selectedTags, subtasks,
    };
    if (task) { await updateTask(task.id, data); showToast('已保存', 'success'); }
    else { await createTask(data); showToast('已创建', 'success'); }
    onClose();
  }

  function addSubtask() {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: 'sub_' + Date.now(), title: newSubtask.trim(), done: false, order: subtasks.length }]);
    setNewSubtask('');
  }

  function toggleSubtask(id: string) {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s));
  }

  function removeSubtask(id: string) {
    setSubtasks(subtasks.filter(s => s.id !== id));
  }

  function toggleTag(name: string) {
    setSelectedTags(selectedTags.includes(name) ? selectedTags.filter(t => t !== name) : [...selectedTags, name]);
  }

  return (
    <div className="fixed inset-0 z-50 modal-mask flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white dark:bg-black slide-up max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-3xl"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-2 sticky top-0 bg-white dark:bg-black z-10">
          <button onClick={onClose} className="text-blue-500 text-[15px]">取消</button>
          <span className="text-[15px] font-semibold">{task ? '编辑任务' : '新建任务'}</span>
          <button onClick={handleSave} className="text-emerald-500 text-[15px] font-semibold">保存</button>
        </div>

        <div className="px-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="任务标题…"
                className="ios-input flex-1 font-medium"
                autoFocus={!task}
              />
              {getAISettings() && (
                <button
                  onClick={handleAIParse}
                  disabled={parsing || !title.trim()}
                  className="px-3 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-medium whitespace-nowrap disabled:opacity-50"
                >
                  {parsing ? '解析中…' : '✨ AI'}
                </button>
              )}
            </div>
            {!getAISettings() && title.length > 5 && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                💡 在设置中配置 AI 后，可用自然语言自动解析（如"明天下午3点开会"）
              </div>
            )}
          </div>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述（可选）"
            className="ios-input min-h-[80px] resize-none"
          />

          <div className="ios-list-group">
            <div className="ios-list-item">
              <span className="text-sm text-slate-500 w-20">截止日期</span>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="flex-1 bg-transparent text-right text-[15px] outline-none"
              />
            </div>
            <div className="ios-list-item">
              <span className="text-sm text-slate-500 w-20">重复</span>
              <select
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
                className="flex-1 bg-transparent text-right text-[15px] outline-none"
              >
                <option value="">不重复</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-[13px] font-medium text-slate-500 mb-2 px-1">优先级</div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setPriority(k as any)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                    priority === k ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >{v}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[13px] font-medium text-slate-500 mb-2 px-1">状态</div>
            <div className="grid grid-cols-4 gap-2">
              {STATUS_ORDER.map(k => (
                <button
                  key={k}
                  onClick={() => setStatus(k as any)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    status === k ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >{STATUS_LABELS[k]}</button>
              ))}
            </div>
          </div>

          {tags.length > 0 && (
            <div>
              <div className="text-[13px] font-medium text-slate-500 mb-2 px-1">标签</div>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.name)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                      selectedTags.includes(tag.name)
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ring-2 ring-offset-1 ring-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >#{tag.name}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-[13px] font-medium text-slate-500">子任务</div>
              {getAISettings() && (
                <button
                  onClick={handleAISplit}
                  disabled={splitting || !title.trim()}
                  className="text-[11px] px-2.5 py-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full font-medium disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {splitting ? '✨ 拆解中…' : '✨ AI 拆解子任务'}
                </button>
              )}
            </div>
            <div className="ios-list-group mb-2">
              {subtasks.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-400 text-center">
                  暂无子任务
                  {getAISettings() && <span className="block text-[11px] mt-1 text-violet-500">点上方 ✨ 让 AI 帮你拆解</span>}
                </div>
              )}
              {subtasks.map(s => (
                <div key={s.id} className="ios-list-item">
                  <button onClick={() => toggleSubtask(s.id)} className={`ios-checkbox ${s.done ? 'checked' : ''}`} />
                  <span className={`flex-1 text-[14px] ${s.done ? 'line-through text-slate-400' : ''}`}>{s.title}</span>
                  <button onClick={() => removeSubtask(s.id)} className="text-slate-400 text-lg px-2">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSubtask(); }}
                placeholder="添加子任务…"
                className="ios-input flex-1"
              />
              <button onClick={addSubtask} className="px-4 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-medium">添加</button>
            </div>
          </div>

          {/* AI 任务总结（仅编辑模式可用） */}
          {task && getAISettings() && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-[13px] font-medium text-slate-500">✨ AI 任务总结</div>
                <button
                  onClick={handleAISummary}
                  disabled={loadingSummary}
                  className="text-[11px] px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-medium disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {loadingSummary ? '生成中…' : summary ? '重新生成' : '生成总结'}
                </button>
              </div>
              {summary && (
                <div className="ios-card p-3.5 bg-emerald-50/50 dark:bg-emerald-900/20 fade-in">
                  <div className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {summary}
                  </div>
                </div>
              )}
              {!summary && !loadingSummary && (
                <div className="text-[11px] text-slate-400 px-1">
                  AI 会分析任务现状、风险点，给出下一步建议
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
