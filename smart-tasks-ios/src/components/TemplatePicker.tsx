import SwipeableSheet from './SwipeableSheet';
import { TASK_TEMPLATES, type TaskTemplate } from '../lib/templates';

interface Props {
  onClose: () => void;
  onPick: (template: TaskTemplate | null) => void;
}

/**
 * Template picker sheet — shown when user clicks "新建任务".
 * Lets the user pick a predefined template or start with a blank task.
 */
export default function TemplatePicker({ onClose, onPick }: Props) {
  function handlePick(tpl: TaskTemplate | null) {
    onPick(tpl);
    onClose();
  }

  return (
    <SwipeableSheet onClose={onClose}>
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={onClose} className="text-[15px]" style={{ color: 'var(--primary)' }}>
          取消
        </button>
        <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          选择模板
        </span>
        <span className="w-10" />
      </div>

      <div className="px-4 py-2 pb-6">
        {/* Blank task — first option, full-width */}
        <button
          onClick={() => handlePick(null)}
          className="w-full ios-card p-3.5 mb-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
          style={{
            borderColor: 'var(--primary-border)',
            background: 'linear-gradient(135deg, var(--primary-soft), transparent)',
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', color: '#ffffff' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              空白任务
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              从头开始创建一个新任务
            </div>
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 18 }}>›</span>
        </button>

        {/* Templates grid */}
        <div className="text-[12px] font-medium mb-2 px-1" style={{ color: 'var(--text-secondary)' }}>
          快速模板
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {TASK_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handlePick(tpl)}
              className="ios-card p-3 text-left active:scale-[0.97] transition-transform"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--primary-soft)' }}
                >
                  <span style={{ fontSize: 20 }}>{tpl.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {tpl.name}
                  </div>
                  <PriorityTag priority={tpl.priority} />
                </div>
              </div>
              <div className="text-[12px] line-clamp-2 leading-snug mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {tpl.title}
              </div>
              {tpl.subtasks.length > 0 && (
                <div className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span>{tpl.subtasks.length} 个子任务</span>
                </div>
              )}
              {tpl.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {tpl.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                      }}
                    >#{tag}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        <div
          className="ios-card p-3 mt-3"
          style={{ background: 'var(--card)' }}
        >
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--accent-amber)' }}>
            💡 选择模板后会自动填充任务标题、描述、优先级、标签和子任务，可在此基础上修改。
          </div>
        </div>
      </div>
    </SwipeableSheet>
  );
}

function PriorityTag({ priority }: { priority: 'low' | 'medium' | 'high' }) {
  const labels = { low: '低', medium: '中', high: '高' };
  const colors = {
    low: 'var(--pri-low)',
    medium: 'var(--pri-medium)',
    high: 'var(--pri-high)',
  };
  const softColors = {
    low: 'var(--pri-low-soft)',
    medium: 'var(--pri-medium-soft)',
    high: 'var(--pri-high-soft)',
  };
  return (
    <span
      className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: softColors[priority], color: colors[priority] }}
    >
      {labels[priority]}
    </span>
  );
}
