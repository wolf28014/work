import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import TaskCard from '../components/TaskCard';
import SwipeableSheet from '../components/SwipeableSheet';
import { tfidfSearch, todayStr, isOverdue, TAG_COLORS } from '../lib/task-utils';

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
  { id: 'priority', label: '优先级', icon: '🔥' },
  { id: 'dueDate', label: '截止日期', icon: '📅' },
  { id: 'created', label: '创建时间', icon: '🕒' },
  { id: 'title', label: '标题', icon: '🔤' },
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function ListView({ onEdit, onStartPomodoro }: Props) {
  const { tasks, tags, softDeleteTask } = useTaskStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [groupByTag, setGroupByTag] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [sortAsc, setSortAsc] = useState(false); // false = 降序（高优先级在前 / 早日期在前）
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeTasks = useMemo(() => tasks.filter(t => !t.deletedAt), [tasks]);

  const filtered = useMemo(() => {
    let result = activeTasks;
    const today = todayStr();
    if (filter === 'today') {
      result = result.filter(t => t.dueDate === today && t.status !== 'done' && t.status !== 'cancelled');
    } else if (filter === 'overdue') {
      result = result.filter(t => isOverdue(t));
    } else if (filter === 'done') {
      result = result.filter(t => t.status === 'done');
    } else {
      result = result.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    }
    return result;
  }, [activeTasks, filter]);

  // 应用搜索
  const searchResults = useMemo(() => {
    if (!query.trim()) return filtered.map(t => ({ task: t, matchedFields: [] as string[] }));
    return tfidfSearch(filtered, query).map(r => ({ task: r.task, matchedFields: r.matchedFields }));
  }, [filtered, query]);

  // 应用排序
  const sorted = useMemo(() => {
    const arr = [...searchResults.map(r => r.task)];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortMode === 'priority') {
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (cmp === 0) {
          // 优先级相同时，按截止日期升序
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
        cmp = b.createdAt - a.createdAt; // 默认新的在前
      } else if (sortMode === 'title') {
        cmp = a.title.localeCompare(b.title, 'zh-CN');
      }
      return sortAsc ? -cmp : cmp;
    });
    return arr;
  }, [searchResults, sortMode, sortAsc]);

  // 分组
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
    today: activeTasks.filter(t => t.dueDate === todayStr() && t.status !== 'done' && t.status !== 'cancelled').length,
    overdue: activeTasks.filter(t => isOverdue(t)).length,
    done: activeTasks.filter(t => t.status === 'done').length,
  }), [activeTasks]);

  return (
    <div className="pb-4">
      <div className="px-4 pt-3 pb-2 sticky top-0 z-20 glass">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none z-10">🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索任务…"
              className="ios-input"
              style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 36, paddingRight: query ? 36 : 14 }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 text-white text-xs flex items-center justify-center z-10"
              >×</button>
            )}
          </div>
          <button
            onClick={() => setShowSortSheet(true)}
            className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1 ${
              sortMode !== 'priority' || sortAsc ? 'bg-emerald-500 text-white' : 'ios-card text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>↕</span>
            <span>{SORT_LABELS[sortMode]}</span>
          </button>
          <button
            onClick={() => setGroupByTag(!groupByTag)}
            className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap ${
              groupByTag ? 'bg-emerald-500 text-white' : 'ios-card text-slate-600 dark:text-slate-300'
            }`}
          >按标签</button>
          <button
            onClick={() => {
              if (batchMode) {
                setSelectedIds(new Set());
              }
              setBatchMode(!batchMode);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap ${
              batchMode ? 'bg-rose-500 text-white' : 'ios-card text-slate-600 dark:text-slate-300'
            }`}
          >{batchMode ? '退出' : '批量'}</button>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      {batchMode && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border-y border-rose-200 dark:border-rose-900/40 fade-in flex items-center justify-between">
          <span className="text-[12px] text-rose-700 dark:text-rose-300 font-medium">
            已选 {selectedIds.size} 项
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // 全选当前列表
                const newSet = new Set(selectedIds);
                sorted.forEach(t => newSet.add(t.id));
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
            >🗑 删除</button>
          </div>
        </div>
      )}

      <div className="px-4 py-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          {([
            { id: 'all', label: '全部', count: counts.all },
            { id: 'today', label: '今日', count: counts.today },
            { id: 'overdue', label: '逾期', count: counts.overdue },
            { id: 'done', label: '已完成', count: counts.done },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all ${
                filter === tab.id ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {tab.label} {tab.count > 0 && <span className="opacity-70">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📝</div>
            <div className="text-slate-400 text-sm">
              {query ? '没有找到匹配的任务' : filter === 'today' ? '今天没有任务' : filter === 'overdue' ? '没有逾期任务 🎉' : '点击右下角 + 创建任务'}
            </div>
          </div>
        ) : (
          grouped.map(group => {
            // 查找标签对应的颜色
            const tagInfo = tags.find(t => t.name === group.key);
            const tagColor = tagInfo?.color || 'emerald';
            const tagColorClass = TAG_COLORS[tagColor] || TAG_COLORS.emerald;
            const tagBarClass = {
              emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
              violet: 'bg-violet-500', sky: 'bg-sky-500', teal: 'bg-teal-500',
              orange: 'bg-orange-500', slate: 'bg-slate-400',
            }[tagColor] || 'bg-emerald-500';

            return (
              <div key={group.key}>
                {groupByTag ? (
                  // 按标签分组的标题（重新设计）
                  <div className="flex items-center gap-2.5 mt-4 mb-2.5 px-1">
                    {/* 左侧色条 */}
                    <div className={`w-1 h-5 rounded-full ${tagBarClass}`} />
                    {/* 标签名 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 text-sm">#</span>
                      <span className={`text-[15px] font-bold ${tagColorClass.includes('emerald') ? 'text-emerald-600 dark:text-emerald-300' :
                        tagColorClass.includes('amber') ? 'text-amber-600 dark:text-amber-300' :
                        tagColorClass.includes('rose') ? 'text-rose-600 dark:text-rose-300' :
                        tagColorClass.includes('violet') ? 'text-violet-600 dark:text-violet-300' :
                        tagColorClass.includes('sky') ? 'text-sky-600 dark:text-sky-300' :
                        tagColorClass.includes('teal') ? 'text-teal-600 dark:text-teal-300' :
                        tagColorClass.includes('orange') ? 'text-orange-600 dark:text-orange-300' :
                        'text-slate-600 dark:text-slate-300'
                      }`}>
                        {group.key}
                      </span>
                    </div>
                    {/* 任务数徽章 */}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tagColorClass}`}>
                      {group.tasks.length}
                    </span>
                    {/* 右侧分割线 */}
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700 ml-1" />
                  </div>
                ) : null}
                <div className="space-y-2">
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
                            // 批量模式下点击切换选中
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
            <div className="text-center text-[15px] font-semibold py-2 border-b border-slate-100 dark:border-slate-800">
              排序方式
            </div>
            <div className="p-3 space-y-2">
              {SORT_OPTIONS.map(opt => {
                const isCurrent = opt.id === sortMode;
                return (
                  <button
                    key={opt.id}
                    onClick={() => { setSortMode(opt.id); setSortAsc(false); setShowSortSheet(false); }}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98] ${
                      isCurrent
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-400'
                        : 'bg-slate-50 dark:bg-slate-800/50'
                    }`}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span className={`flex-1 text-left text-[15px] font-medium ${isCurrent ? 'text-emerald-600 dark:text-emerald-300' : ''}`}>
                      {opt.label}
                    </span>
                    {isCurrent && <span className="text-emerald-500 text-lg">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* 升降序切换 */}
            <div className="px-3 pb-2">
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 active:scale-[0.98] transition-transform"
              >
                <span className="text-[15px] font-medium">方向</span>
                <span className="text-[13px] text-slate-500">
                  {sortAsc ? '升序 ↑（低到高）' : '降序 ↓（高到低）'}
                </span>
              </button>
            </div>

            <div className="px-3 pb-2">
              <button
                onClick={() => setShowSortSheet(false)}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[15px] font-medium"
              >完成</button>
            </div>
        </SwipeableSheet>
      )}
    </div>
  );
}
