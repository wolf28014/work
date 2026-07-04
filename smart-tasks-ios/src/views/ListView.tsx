import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import TaskCard from '../components/TaskCard';
import SwipeableSheet from '../components/SwipeableSheet';
import { tfidfSearch, todayStr, isOverdue, useToday } from '../lib/task-utils';
import { aiSearchTasks, getAISettings } from '../lib/ai-client';
import { showToast } from '../components/Toast';

interface Props {
  onEdit: (t: Task) => void;
  onNew: () => void;
  onStartPomodoro?: (t: Task) => void;
}

type FilterTab = 'all' | 'today' | 'overdue' | 'done';
type SortMode = 'priority' | 'dueDate' | 'created' | 'title';

const SORT_LABELS: Record<SortMode, string> = {
  priority: '优先级',
  dueDate: '截止日期',
  created: '创建时间',
  title: '标题',
};

const SORT_OPTIONS: { id: SortMode; label: string; icon: string }[] = [
  { id: 'priority', label: '优先级',    icon: '🔥' },
  { id: 'dueDate',  label: '截止日期',  icon: '📅' },
  { id: 'created',  label: '创建时间',  icon: '🕒' },
  { id: 'title',    label: '标题',      icon: '🔤' },
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const TAG_DOT: Record<string, string> = {
  emerald: 'var(--primary)', amber: 'var(--accent-amber)', rose: 'var(--pri-high)',
  violet: 'var(--accent-violet)', sky: 'var(--accent-sky)', teal: 'var(--primary)',
  orange: 'var(--accent-amber)', slate: 'var(--text-secondary)',
};

export default function ListView({ onEdit, onStartPomodoro }: Props) {
  const { tasks, tags, softDeleteTask } = useTaskStore();
  // v6.6 — 修复 #15：用 useToday 跨午夜自动刷新
  const today = useToday();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [groupByTag, setGroupByTag] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [sortAsc, setSortAsc] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // v6.7 — AI 自然语言搜索
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchIds, setAiSearchIds] = useState<Set<string> | null>(null);

  async function handleAISearch() {
    if (!query.trim()) { showToast('请输入搜索词', 'info'); return; }
    if (!getAISettings()) { showToast('请先配置 AI API', 'error'); return; }
    setAiSearchLoading(true);
    try {
      const ids = await aiSearchTasks(query, activeTasks);
      setAiSearchIds(new Set(ids));
      showToast(`AI 找到 ${ids.length} 个匹配任务`, 'success');
    } catch (e: any) { showToast(e.message || 'AI 搜索失败', 'error'); }
    finally { setAiSearchLoading(false); }
  }

  const activeTasks = useMemo(() => tasks.filter(t => !t.deletedAt), [tasks]);

  const filtered = useMemo(() => {
    let result = activeTasks;
    // v6.6 — 修复 #15：用 useToday 的 today，跨午夜自动刷新
    if (filter === 'today') {
      // v6.9.3 — 修复：今日筛选应该包含重复任务
      // 重复任务 dueDate <= today 且未完成 → 算今天的
      // 非重复任务 dueDate === today
      result = result.filter(t => {
        if (t.status === 'done' || t.status === 'cancelled') return false;
        if (t.recurrence) {
          // 重复任务：dueDate <= today 算今天需要做的
          return t.dueDate && t.dueDate <= today;
        }
        // 非重复：dueDate === today
        return t.dueDate === today;
      });
    } else if (filter === 'overdue') {
      result = result.filter(t => isOverdue(t));
    } else if (filter === 'done') {
      result = result.filter(t => t.status === 'done');
    } else {
      result = result.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    }
    return result;
  }, [activeTasks, filter, today]);

  const searchResults = useMemo(() => {
    // v6.7 — AI 搜索激活时，只显示 AI 匹配的任务
    if (aiSearchIds) {
      return filtered.filter(t => aiSearchIds.has(t.id)).map(t => ({ task: t, matchedFields: ['AI 匹配'] as string[] }));
    }
    if (!query.trim()) return filtered.map(t => ({ task: t, matchedFields: [] as string[] }));
    return tfidfSearch(filtered, query).map(r => ({ task: r.task, matchedFields: r.matchedFields }));
  }, [filtered, query, aiSearchIds]);

  const sorted = useMemo(() => {
    const arr = [...searchResults.map(r => r.task)];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortMode === 'priority') {
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (cmp === 0) {
          const ad = a.dueDate || '9999-12-31';
          const bd = b.dueDate || '9999-12-31';
          cmp = ad.localeCompare(bd);
        }
      } else if (sortMode === 'dueDate') {
        const ad = a.dueDate || '9999-12-31';
        const bd = b.dueDate || '9999-12-31';
        cmp = ad.localeCompare(bd);
        if (cmp === 0) cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      } else if (sortMode === 'created') {
        cmp = b.createdAt - a.createdAt;
      } else if (sortMode === 'title') {
        cmp = a.title.localeCompare(b.title, 'zh-CN');
      }
      return sortAsc ? -cmp : cmp;
    });
    return arr;
  }, [searchResults, sortMode, sortAsc]);

  const grouped = useMemo(() => {
    if (!groupByTag) return [{ key: '全部', tasks: sorted }];
    const map = new Map<string, Task[]>();
    sorted.forEach(task => {
      if (task.tags.length === 0) {
        if (!map.has('未分类')) map.set('未分类', []);
        map.get('未分类')!.push(task);
      } else {
        task.tags.forEach(tg => {
          if (!map.has(tg)) map.set(tg, []);
          map.get(tg)!.push(task);
        });
      }
    });
    return Array.from(map.entries()).map(([key, tasks]) => ({ key, tasks }));
  }, [sorted, groupByTag]);

  const counts = useMemo(() => ({
    all: activeTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length,
    // v6.9.3 — 修复：今日 count 也包含重复任务
    today: activeTasks.filter(t => {
      if (t.status === 'done' || t.status === 'cancelled') return false;
      if (t.recurrence) return t.dueDate && t.dueDate <= today;
      return t.dueDate === today;
    }).length,
    overdue: activeTasks.filter(t => isOverdue(t)).length,
    done: activeTasks.filter(t => t.status === 'done').length,
  }), [activeTasks, today]);

  const filterTabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',     label: '全部',   count: counts.all },
    { id: 'today',   label: '今日',   count: counts.today },
    { id: 'overdue', label: '逾期',   count: counts.overdue },
    { id: 'done',    label: '已完成', count: counts.done },
  ];

  return (
    <div className="pb-4 pc-content-wrap">
      {/* 搜索 + 工具栏 */}
      <div className="px-4 pt-3 pb-2 sticky top-0 z-20 app-header">
        <div className="flex items-center gap-2">
          {/* v6.7.2 — 搜索框拉长，用 flex-[2] 占更多空间 */}
          <div className="flex-[2_1_0%] relative min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ color: 'var(--text-tertiary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索任务…"
              className="ios-input w-full"
              data-search-input
              style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 36, paddingRight: query ? 62 : 36, borderRadius: 'var(--r-pill)' }}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setAiSearchIds(null); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center z-10"
                style={{ background: 'var(--bg-sunken)', color: 'var(--text-secondary)' }}
              >×</button>
            )}
            {/* v6.7 — AI 搜索按钮 */}
            {getAISettings() && (
              <button
                onClick={handleAISearch}
                disabled={aiSearchLoading || !query.trim()}
                className="absolute right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center z-10 disabled:opacity-30"
                style={{ background: aiSearchIds ? 'var(--primary-soft)' : 'var(--bg-sunken)', color: aiSearchIds ? 'var(--primary)' : 'var(--text-secondary)' }}
                aria-label="AI 搜索"
                title="AI 智能搜索"
              >{aiSearchLoading ? '⏳' : '✨'}</button>
            )}
          </div>
          {/* v6.7.2 — 排序按钮（合并了标签分组功能），名称改为"排序" */}
          <button
            onClick={() => setShowSortSheet(true)}
            className="px-3 py-2 rounded-full text-[12px] font-bold whitespace-nowrap flex items-center gap-1 active:scale-95 transition-transform"
            style={{
              background: (sortMode !== 'priority' || sortAsc || groupByTag) ? 'var(--primary-soft)' : 'var(--card)',
              border: `1px solid ${(sortMode !== 'priority' || sortAsc || groupByTag) ? 'var(--primary-border)' : 'var(--border)'}`,
              color: (sortMode !== 'priority' || sortAsc || groupByTag) ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            <span>↕</span>
            <span>排序</span>
          </button>
          <button
            onClick={() => {
              if (batchMode) setSelectedIds(new Set());
              setBatchMode(!batchMode);
            }}
            className="px-3 py-2 rounded-full text-[12px] font-bold whitespace-nowrap active:scale-95 transition-transform"
            style={{
              background: batchMode ? 'var(--pri-high-soft)' : 'var(--card)',
              border: `1px solid ${batchMode ? 'rgba(255,110,127,0.35)' : 'var(--border)'}`,
              color: batchMode ? 'var(--pri-high)' : 'var(--text-secondary)',
            }}
          >{batchMode ? '退出' : '批量'}</button>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      {batchMode && (
        <div
          className="px-4 py-2.5 fade-in flex items-center justify-between"
          style={{ background: 'var(--pri-high-soft)', borderBottom: '1px solid rgba(255,110,127,0.25)' }}
        >
          <span className="text-[12px] font-bold" style={{ color: 'var(--pri-high)' }}>
            已选 {selectedIds.size} 项
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const newSet = new Set(selectedIds);
                sorted.forEach(t => newSet.add(t.id));
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
            >🗑 删除</button>
          </div>
        </div>
      )}

      {/* 过滤标签 */}
      <div className="px-4 py-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          {filterTabs.map(tab => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className="px-3.5 py-1.5 rounded-full text-[13px] font-bold whitespace-nowrap transition-all active:scale-95"
                style={{
                  background: isActive ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                  border: `1px solid ${isActive ? 'var(--primary-border)' : 'var(--border)'}`,
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {tab.label} {tab.count > 0 && <span style={{ opacity: 0.7 }}>{tab.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 任务列表 */}
      <div className="px-4 space-y-2.5">
        {sorted.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center mb-3"
              style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)' }}
            >
              <span style={{ fontSize: 28, color: 'var(--primary)' }}>✦</span>
            </div>
            <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {query ? '没有找到匹配的任务' : filter === 'today' ? '今天没有任务' : filter === 'overdue' ? '没有逾期任务 🎉' : '点击右下角 + 创建任务'}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {query ? '换个关键词试试' : '开启高效的一天'}
            </div>
          </div>
        ) : (
          grouped.map(group => {
            const tagInfo = tags.find(t => t.name === group.key);
            const tagColor = tagInfo?.color || 'violet';
            const tagDot = TAG_DOT[tagColor] || 'var(--primary)';

            return (
              <div key={group.key}>
                {groupByTag ? (
                  <div className="flex items-center gap-2.5 mt-4 mb-2.5 px-1">
                    <div className="w-1 h-5 rounded-full" style={{ background: tagDot }} />
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: 'var(--text-tertiary)' }}>#</span>
                      <span className="text-[15px] font-bold" style={{ color: tagDot }}>{group.key}</span>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {group.tasks.length}
                    </span>
                    <div className="flex-1 h-px ml-1" style={{ background: 'var(--border)' }} />
                  </div>
                ) : null}
                <div className="space-y-2.5 task-list-grid">
                  {group.tasks.map(task => (
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
                        <TaskCard
                          task={task}
                          onEdit={batchMode ? () => {
                            const newSet = new Set(selectedIds);
                            if (newSet.has(task.id)) newSet.delete(task.id);
                            else newSet.add(task.id);
                            setSelectedIds(newSet);
                          } : onEdit}
                          onStartPomodoro={onStartPomodoro}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 排序选择 ActionSheet */}
      {showSortSheet && (
        <SwipeableSheet onClose={() => setShowSortSheet(false)} zIndex={80} showEdgeIndicator={false}>
            <div className="text-center text-[15px] font-bold py-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              排序方式
            </div>
            <div className="p-3 space-y-2">
              {SORT_OPTIONS.map(opt => {
                const isCurrent = opt.id === sortMode;
                return (
                  <button
                    key={opt.id}
                    onClick={() => { setSortMode(opt.id); setSortAsc(false); setShowSortSheet(false); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98]"
                    style={{
                      background: isCurrent ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                      border: `1px solid ${isCurrent ? 'var(--primary-border)' : 'var(--border)'}`,
                    }}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span className="flex-1 text-left text-[15px] font-medium" style={{ color: isCurrent ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {opt.label}
                    </span>
                    {isCurrent && <span style={{ color: 'var(--primary)', fontSize: 18 }}>✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="px-3 pb-2">
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl active:scale-[0.98] transition-transform"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <span className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>方向</span>
                <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                  {sortAsc ? '升序 ↑（低到高）' : '降序 ↓（高到低）'}
                </span>
              </button>
            </div>

            {/* v6.7.2 — 标签分组开关（从顶部工具栏合并进来） */}
            <div className="px-3 pb-2">
              <button
                onClick={() => setGroupByTag(!groupByTag)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl active:scale-[0.98] transition-transform"
                style={{
                  background: groupByTag ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                  border: `1px solid ${groupByTag ? 'var(--primary-border)' : 'var(--border)'}`,
                }}
              >
                <span className="text-[15px] font-medium" style={{ color: groupByTag ? 'var(--primary)' : 'var(--text-primary)' }}>
                  按标签分组
                </span>
                <span className="text-[13px]" style={{ color: groupByTag ? 'var(--primary)' : 'var(--text-secondary)' }}>
                  {groupByTag ? '开启 ✓' : '关闭'}
                </span>
              </button>
            </div>

            <div className="px-3 pb-2">
              <button
                onClick={() => setShowSortSheet(false)}
                className="w-full py-3 rounded-xl text-[15px] font-medium"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >完成</button>
            </div>
        </SwipeableSheet>
      )}
    </div>
  );
}
