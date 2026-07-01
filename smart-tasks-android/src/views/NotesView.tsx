import { useState, useEffect, useRef } from 'react';
import type { Note } from '../lib/db';
import { getAllNotes, saveNote, deleteNotePermanent, softDeleteNote, genId } from '../lib/db';
import { syncNoteToCloud } from '../lib/auth';
import { showToast } from '../components/Toast';
import SwipeableSheet from '../components/SwipeableSheet';

interface Props {
  /** Open the editor for a given note (or null = create new). */
  onOpenEditor: (note: Note | null) => void;
}

/**
 * Notes view — list of notes (title + preview + date), with create / delete.
 * Editing happens through the parent (which opens NoteEditor as a sheet).
 */
export default function NotesView({ onOpenEditor }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const all = await getAllNotes();
      setNotes(all);
    } catch (e) {
      console.error('Failed to load notes', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // v6.1 — listen for real-time note changes from another device (PC ↔ mobile sync).
  // When a remote INSERT/UPDATE/DELETE arrives, re-query IndexedDB (the realtime
  // handler in auth.ts already saved the change to IndexedDB) and refresh the list.
  useEffect(() => {
    const handler = () => { refresh(); };
    window.addEventListener('notes-realtime-change', handler);
    return () => window.removeEventListener('notes-realtime-change', handler);
  }, []);

  function filtered() {
    if (!query.trim()) return notes;
    const q = query.trim().toLowerCase();
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }

  async function handleCreate() {
    onOpenEditor(null);
  }

  async function handleTogglePin(note: Note) {
    const updated = { ...note, pinned: !note.pinned, updatedAt: Date.now() };
    await saveNote(updated);
    syncNoteToCloud(updated).catch(e => console.log('Sync failed:', e));
    await refresh();
    showToast(updated.pinned ? '已置顶' : '已取消置顶', 'info');
  }

  async function handleDelete(note: Note) {
    if (!confirm(`确定删除笔记 "${note.title || '无标题'}" ？`)) return;
    await softDeleteNote(note.id);
    syncNoteToCloud({ ...note, deletedAt: Date.now() }).catch(e => console.log('Sync failed:', e));
    await refresh();
    showToast('已删除', 'info');
  }

  const visibleNotes = filtered();

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  function preview(content: string): string {
    // Strip markdown-ish syntax for a clean preview
    return content
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  return (
    <div className="px-4 py-3 pb-6 pc-content-wrap">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>笔记</h2>
        <button
          onClick={handleCreate}
          className="px-3.5 h-9 rounded-full flex items-center gap-1 active:scale-95 transition-transform"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))',
            color: '#ffffff',
            boxShadow: 'var(--shadow-fab)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-[13px] font-bold">新建</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索笔记…"
          className="ios-input pl-9"
          style={{ background: 'var(--bg-elevated)' }}
        />
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--primary)', animation: 'spinSlow 1s linear infinite' }} />
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>加载中…</div>
        </div>
      ) : visibleNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-3 opacity-70">{query.trim() ? '🔍' : '📝'}</div>
          <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {query.trim() ? '没有匹配的笔记' : '还没有笔记'}
          </div>
          <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            {query.trim() ? '换个关键词试试' : '点击右上角"新建"创建你的第一条笔记'}
          </div>
        </div>
      ) : (
        <div className="notes-grid space-y-2.5">
          {visibleNotes.map(note => {
            const previewText = preview(note.content);
            return (
              <div
                key={note.id}
                className="ios-card p-3.5 cursor-pointer fade-in active:scale-[0.98] transition-transform"
                onClick={() => onOpenEditor(note)}
                style={note.pinned ? { borderColor: 'var(--primary-border)', boxShadow: '0 2px 12px var(--primary-glow)' } : undefined}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {note.pinned && <span style={{ color: 'var(--primary)', fontSize: 12 }}>📌</span>}
                      <h3 className="text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {note.title || '无标题'}
                      </h3>
                    </div>
                  </div>
                  <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDate(note.updatedAt)}
                  </span>
                </div>
                {previewText ? (
                  <p className="text-[13px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {previewText}
                  </p>
                ) : (
                  <p className="text-[12px] italic" style={{ color: 'var(--text-tertiary)' }}>（空白笔记）</p>
                )}
                <div className="flex items-center gap-2 mt-2.5 -mb-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium active:scale-95 transition-transform"
                    style={{
                      background: note.pinned ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                      color: note.pinned ? 'var(--primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {note.pinned ? '已置顶' : '置顶'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(note); }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium active:scale-95 transition-transform"
                    style={{
                      background: 'var(--pri-high-soft)',
                      color: 'var(--pri-high)',
                    }}
                  >删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// NoteEditor — sub-component (rendered as a SwipeableSheet by parent)
// ============================================================

interface EditorProps {
  note: Note | null;
  onClose: () => void;
  onSaved: () => void;
}

export function NoteEditor({ note, onClose, onSaved }: EditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [pinned, setPinned] = useState(note?.pinned || false);
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus title for new notes
    if (!note) {
      setTimeout(() => titleRef.current?.focus(), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(t: string, c: string, p: boolean) {
    try {
      const now = Date.now();
      const updated: Note = note
        ? { ...note, title: t, content: c, pinned: p, updatedAt: now }
        : {
            id: genId(),
            title: t,
            content: c,
            pinned: p,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
      await saveNote(updated);
      syncNoteToCloud(updated).catch(e => console.log('Sync failed:', e));
    } catch (e: any) {
      showToast('保存失败：' + e.message, 'error');
    }
  }

  // Auto-save (debounced) on content change
  function scheduleSave(t: string, c: string, p: boolean) {
    if (saveTimer) clearTimeout(saveTimer);
    const timer = setTimeout(() => {
      persist(t, c, p);
    }, 600);
    setSaveTimer(timer);
  }

  function handleChangeTitle(v: string) {
    setTitle(v);
    scheduleSave(v, content, pinned);
  }
  function handleChangeContent(v: string) {
    setContent(v);
    scheduleSave(title, v, pinned);
  }
  function handleTogglePin() {
    const newPinned = !pinned;
    setPinned(newPinned);
    scheduleSave(title, content, newPinned);
  }

  async function handleClose() {
    if (saveTimer) clearTimeout(saveTimer);
    // Save immediately on close (even if no changes since last debounce)
    if (title.trim() || content.trim()) {
      await persist(title, content, pinned);
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!note) { onClose(); return; }
    if (!confirm('确定删除此笔记？')) return;
    if (saveTimer) clearTimeout(saveTimer);
    await softDeleteNote(note.id);
    syncNoteToCloud({ ...note, deletedAt: Date.now() }).catch(e => console.log('Sync failed:', e));
    showToast('已删除', 'info');
    onSaved();
    onClose();
  }

  return (
    <SwipeableSheet onClose={handleClose} fullScreen>
      <div
        className="flex items-center justify-between px-4 py-2 sticky top-0 z-10"
        style={{
          background: 'var(--bar-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button onClick={handleClose} className="text-[15px]" style={{ color: 'var(--primary)' }}>
          完成
        </button>
        <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          {note ? '编辑笔记' : '新建笔记'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleTogglePin}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{
              background: pinned ? 'var(--primary-soft)' : 'transparent',
              color: pinned ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            aria-label="置顶"
          >
            <span style={{ fontSize: 16 }}>📌</span>
          </button>
          {note && (
            <button
              onClick={handleDelete}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: 'var(--pri-high)' }}
              aria-label="删除"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <input
          ref={titleRef}
          value={title}
          onChange={e => handleChangeTitle(e.target.value)}
          placeholder="标题"
          className="ios-input text-[18px] font-semibold"
          style={{ background: 'transparent', border: 'none', padding: '8px 4px' }}
          maxLength={100}
        />
        <textarea
          value={content}
          onChange={e => handleChangeContent(e.target.value)}
          placeholder="在此输入笔记内容… 支持 Markdown 格式"
          className="ios-input min-h-[60vh] resize-none leading-relaxed"
          style={{
            background: 'transparent',
            border: 'none',
            padding: '8px 4px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif',
          }}
        />
        <div className="text-[11px] pt-1" style={{ color: 'var(--text-tertiary)' }}>
          💡 笔记会自动保存。支持 Markdown 语法（# 标题、**粗体**、- 列表 等）。
        </div>
      </div>
    </SwipeableSheet>
  );
}
