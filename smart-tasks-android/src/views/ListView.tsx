import { useState, useMemo } from 'react';
import type { Task } from '../lib/db';
import { useTaskStore } from '../lib/store';
import TaskCard from '../components/TaskCard';
import { tfidfSearch, todayStr, isOverdue } from '../lib/task-utils';

interface Props {
  onEdit: (t: Task) => void;
  onNew: () => void;
}

type FilterTab = 'all' | 'today' | 'overdue' | 'done';

export default function ListView({ onEdit }: Props) {
  const { tasks } = useTaskStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [groupByTag, setGroupByTag] = useState(false);

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

  const searchResults = useMemo(() => {
    if (!query.trim()) return filtered.map(t => ({ task: t, matchedFields: [] as string[] }));
    return tfidfSearch(filtered, query).map(r => ({ task: r.task, matchedFields: r.matchedFields }));
  }, [filtered, query]);

  const grouped = useMemo(() => {
    if (!groupByTag) return [{ key: '全部', tasks: searchResults.map(r => r.task) }];
    const map = new Map<string, Task[]>();
    searchResults.forEach(({ task }) => {
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
  }, [searchResults, groupByTag]);

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
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索任务…"
              className="ios-input pl-9"
              style={{ paddingTop: 8, paddingBottom: 8 }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 text-white text-xs flex items-center justify-center"
              >×</button>
            )}
          </div>
          <button
            onClick={() => setGroupByTag(!groupByTag)}
            className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap ${
              groupByTag ? 'bg-emerald-500 text-white' : 'ios-card text-slate-600 dark:text-slate-300'
            }`}
          >按标签</button>
        </div>
      </div>

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
        {searchResults.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📝</div>
            <div className="text-slate-400 text-sm">
              {query ? '没有找到匹配的任务' : filter === 'today' ? '今天没有任务' : filter === 'overdue' ? '没有逾期任务 🎉' : '点击右下角 + 创建任务'}
            </div>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.key}>
              {groupByTag && (
                <div className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 mt-3 mb-1.5 px-1 uppercase tracking-wide">
                  #{group.key} · {group.tasks.length}
                </div>
              )}
              <div className="space-y-2">
                {group.tasks.map(task => (
                  <TaskCard key={task.id} task={task} onEdit={onEdit} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
