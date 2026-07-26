import { useState, useEffect, useRef, useMemo } from 'react';
import type { Note } from '../lib/db';
import { getAllNotes, saveNote, deleteNotePermanent, softDeleteNote, genId, getNoteById } from '../lib/db';
import { syncNoteToCloud, getCurrentProStatus } from '../lib/auth';
import { showToast } from '../components/Toast';
import SwipeableSheet from '../components/SwipeableSheet';
import { aiNoteSummary, aiNoteContinue, aiNoteTranslate, getAISettings } from '../lib/ai-client';

// v6.10 — 笔记图片支持
// ============================================================
// 图片以 base64 data URL 内嵌在 markdown 中（![alt](data:image/jpeg;base64,...)）
// 上传前会经过压缩（最大 1280px、JPEG 质量 0.75），单张约 80~150KB
// 云端同步 content 上限已提升到 1MB，可容纳多张图片
// ============================================================

const IMAGE_MAX_SIZE = 1280;       // 压缩后最长边像素
const IMAGE_QUALITY = 0.75;        // JPEG 质量
const IMAGE_MAX_FILE_BYTES = 15 * 1024 * 1024; // 单张原始文件上限 15MB

/**
 * 把图片文件压缩为 JPEG data URL。
 * - PNG/GIF 等格式也会被统一转成 JPEG（体积更小，方便 base64 内嵌）
 * - 超过 IMAGE_MAX_SIZE 的图会等比缩小
 * - 失败时返回 null，由调用方提示用户
 */
async function compressImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error');
    return null;
  }
  if (file.size > IMAGE_MAX_FILE_BYTES) {
    showToast('图片过大（>15MB），请选择更小的图片', 'error');
    return null;
  }
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onerror = () => reject(new Error('图片解析失败'));
      im.onload = () => resolve(im);
      im.src = dataUrl;
    });
    let { width, height } = img;
    if (width > IMAGE_MAX_SIZE || height > IMAGE_MAX_SIZE) {
      if (width >= height) {
        height = Math.round((height * IMAGE_MAX_SIZE) / width);
        width = IMAGE_MAX_SIZE;
      } else {
        width = Math.round((width * IMAGE_MAX_SIZE) / height);
        height = IMAGE_MAX_SIZE;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    // 白底，避免透明 PNG 转 JPG 后变黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
  } catch (e: any) {
    console.error('[compressImageFile]', e);
    showToast('图片处理失败：' + (e?.message || '未知错误'), 'error');
    return null;
  }
}

/**
 * 极简 Markdown → HTML 渲染（不引入第三方库）
 * 支持：标题、粗体、斜体、行内代码、无序/有序列表、链接、图片、引用、分隔线、段落
 * 图片单独成段，方便点击查看
 */
function renderMarkdown(md: string): string {
  if (!md) return '';
  // 1. 转义 HTML
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const text = para.join(' ');
      html.push('<p>' + inline(text) + '</p>');
      para = [];
    }
  };
  const closeLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  function inline(s: string): string {
    let t = esc(s);
    // 图片：![alt](src)
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
      return `<img alt="${alt}" src="${src}" class="note-md-img" loading="lazy" />`;
    });
    // 链接：[text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 粗体
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // 斜体
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
    // 行内代码
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushPara();
      closeLists();
      continue;
    }
    // 代码块
    if (line.trim().startsWith('```')) {
      flushPara();
      closeLists();
      if (inCode) { html.push('</code></pre>'); inCode = false; }
      else { html.push('<pre><code>'); inCode = true; }
      continue;
    }
    if (inCode) { html.push(esc(raw)); continue; }
    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushPara();
      closeLists();
      html.push('<hr/>');
      continue;
    }
    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeLists();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    // 引用
    if (/^>\s+/.test(line)) {
      flushPara();
      closeLists();
      html.push('<blockquote>' + inline(line.replace(/^>\s+/, '')) + '</blockquote>');
      continue;
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push('<li>' + inline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>');
      continue;
    }
    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push('<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>');
      continue;
    }
    closeLists();
    para.push(line.trim());
  }
  flushPara();
  closeLists();
  if (inCode) html.push('</code></pre>');
  return html.join('\n');
}

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
  // 批量模式
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    // v6.8 — 免费用户笔记 50 条限制
    const pro = getCurrentProStatus();
    const isPro = pro.isPro && (!pro.expiresAt || pro.expiresAt > Date.now());
    if (!isPro && notes.length >= 50) {
      showToast('免费版最多 50 条笔记，升级 Pro 解锁无限', 'info');
      return;
    }
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

  // ============ 批量操作 ============
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(visibleNotes.map(n => n.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function batchTogglePin(pin: boolean) {
    if (selectedIds.size === 0) {
      showToast('请先选择笔记', 'info');
      return;
    }
    const targets = visibleNotes.filter(n => selectedIds.has(n.id) && n.pinned !== pin);
    if (targets.length === 0) {
      showToast(pin ? '所选笔记已全部置顶' : '所选笔记均未置顶', 'info');
      return;
    }
    const now = Date.now();
    await Promise.all(targets.map(async n => {
      const updated = { ...n, pinned: pin, updatedAt: now };
      await saveNote(updated);
      syncNoteToCloud(updated).catch(e => console.log('Sync failed:', e));
    }));
    await refresh();
    showToast(`已${pin ? '置顶' : '取消置顶'} ${targets.length} 条`, 'info');
    clearSelection();
  }

  async function batchDelete() {
    if (selectedIds.size === 0) {
      showToast('请先选择笔记', 'info');
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条笔记？`)) return;
    const targets = visibleNotes.filter(n => selectedIds.has(n.id));
    const now = Date.now();
    await Promise.all(targets.map(async n => {
      await softDeleteNote(n.id);
      syncNoteToCloud({ ...n, deletedAt: now }).catch(e => console.log('Sync failed:', e));
    }));
    await refresh();
    showToast(`已删除 ${targets.length} 条`, 'info');
    clearSelection();
    setBatchMode(false);
  }

  function exitBatchMode() {
    setBatchMode(false);
    clearSelection();
  }

  const visibleNotes = filtered();

  // v6.6 — 修复 #29：缓存所有笔记的 preview，避免每次 render 在 map 内跑多轮 regex
  const previewMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of visibleNotes) m.set(n.id, preview(n.content));
    return m;
  }, [visibleNotes]);

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  function preview(content: string): string {
    // Strip markdown-ish syntax for a clean preview
    // v6.10 — 先统计并剥离图片（避免 base64 data URL 污染预览）
    let imageCount = 0;
    let text = content.replace(/!\[[^\]]*\]\([^)]*\)/g, () => {
      imageCount++;
      return '';
    });
    text = text
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    // v6.10 — 若笔记仅有图片，预览显示图片占位
    if (!text && imageCount > 0) return `📷 ${imageCount} 张图片`;
    if (imageCount > 0) return text + `  📷${imageCount}`;
    return text;
  }

  return (
    <div className="px-4 py-3 pb-6 pc-content-wrap">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>笔记</h2>
          {batchMode && (
            <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              已选 {selectedIds.size}
            </span>
          )}
        </div>
        {batchMode ? (
          <button
            onClick={exitBatchMode}
            className="px-3.5 h-9 rounded-full flex items-center gap-1 active:scale-95 transition-transform"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="text-[13px] font-bold">完成</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {notes.length > 0 && (
              <button
                onClick={() => setBatchMode(true)}
                className="px-3 h-9 rounded-full flex items-center gap-1 active:scale-95 transition-transform"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
                aria-label="批量操作"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span className="text-[12px] font-semibold">批量</span>
              </button>
            )}
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
        )}
      </div>

      {/* 批量模式工具栏 */}
      {batchMode && visibleNotes.length > 0 && (
        <div className="flex items-center justify-between mb-3 px-1 fade-in">
          <button
            onClick={selectedIds.size === visibleNotes.length ? clearSelection : selectAll}
            className="text-[12px] font-medium active:scale-95 transition-transform"
            style={{ color: 'var(--primary)' }}
          >
            {selectedIds.size === visibleNotes.length && visibleNotes.length > 0 ? '取消全选' : '全选'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => batchTogglePin(true)}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium active:scale-95 transition-transform disabled:opacity-40"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >置顶</button>
            <button
              onClick={() => batchTogglePin(false)}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium active:scale-95 transition-transform disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >取消置顶</button>
            <button
              onClick={batchDelete}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium active:scale-95 transition-transform disabled:opacity-40"
              style={{ background: 'var(--pri-high-soft)', color: 'var(--pri-high)' }}
            >删除</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ color: 'var(--text-tertiary)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索笔记…"
          className="ios-input"
          style={{
            background: 'var(--bg-elevated)',
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 36,
            paddingRight: query ? 36 : 14,
            borderRadius: 'var(--r-pill)',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center z-10"
            style={{ background: 'var(--bg-sunken)', color: 'var(--text-secondary)' }}
            aria-label="清除"
          >×</button>
        )}
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
            const previewText = previewMap.get(note.id) || '';
            const isSelected = selectedIds.has(note.id);
            return (
              <div
                key={note.id}
                className="ios-card p-3.5 cursor-pointer fade-in active:scale-[0.98] transition-transform"
                onClick={() => batchMode ? toggleSelect(note.id) : onOpenEditor(note)}
                style={{
                  ...(note.pinned ? { borderColor: 'var(--primary-border)', boxShadow: '0 2px 12px var(--primary-glow)' } : {}),
                  ...(batchMode && isSelected ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 2px var(--primary)' } : {}),
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {batchMode && (
                      <div
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all"
                        style={{
                          background: isSelected ? 'var(--primary)' : 'transparent',
                          border: isSelected ? '1.5px solid var(--primary)' : '1.5px solid var(--border-strong)',
                        }}
                      >
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {note.pinned && <span style={{ color: 'var(--primary)', fontSize: 12 }}>📌</span>}
                        <h3 className="text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {note.title || '无标题'}
                        </h3>
                      </div>
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
                {!batchMode && (
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
                )}
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
  // v6.10 — content textarea ref（用于在光标位置插入图片）
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 新建笔记时，第一次 persist 会生成 ID 并存到这里，
  // 后续 persist 复用这个 ID（变成 update 而不是 create），
  // 避免每次自动保存都创建一条新笔记。
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  // v6.6 — 记录新建笔记的首次创建时间，避免每次自动保存把 createdAt 覆盖成当前时间
  const [createdNoteAt, setCreatedNoteAt] = useState<number | null>(null);
  // v6.7 — AI 笔记助手状态
  const [aiLoading, setAiLoading] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  // v6.10 — 预览模式 & 图片处理中
  const [previewMode, setPreviewMode] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  // v6.10 — 缓存预览 HTML（避免每次 render 重新解析 markdown）
  const previewHtml = useMemo(() => renderMarkdown(content), [content, previewMode]);

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
      const existingId = note?.id || createdNoteId;

      // v6.6 — 修复 #13：编辑现有笔记时，如果远端已删除（deletedAt 不为 null），不覆盖
      if (existingId) {
        const current = await getNoteById(existingId);
        if (current && current.deletedAt !== null) {
          showToast('该笔记已被删除', 'info');
          onSaved();
          onClose();
          return;
        }
      }

      if (existingId) {
        // Update existing note (either editing an old one, or re-saving a newly created one)
        // v6.6 — 修复 createdAt 覆盖 bug：新建笔记用 createdNoteAt，编辑笔记用 note.createdAt
        // v6.6 — 修复 #13：保留 existing.deletedAt 而非强制 null
        const current = await getNoteById(existingId);
        const updated: Note = {
          id: existingId,
          title: t,
          content: c,
          pinned: p,
          createdAt: note?.createdAt || createdNoteAt || now,
          updatedAt: now,
          deletedAt: current?.deletedAt ?? null,
        };
        await saveNote(updated);
        syncNoteToCloud(updated).catch(e => console.log('Sync failed:', e));
      } else {
        // First save of a brand-new note — generate ID once, remember it
        const newId = genId();
        const created: Note = {
          id: newId,
          title: t,
          content: c,
          pinned: p,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        setCreatedNoteId(newId);
        setCreatedNoteAt(now);
        await saveNote(created);
        syncNoteToCloud(created).catch(e => console.log('Sync failed:', e));
      }
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

  // v6.10 — 在 textarea 当前光标位置插入文本，并把光标移到插入文本末尾
  function insertAtCursor(text: string, selectInside?: { start: number; end: number }) {
    const ta = contentRef.current;
    if (!ta) {
      // 兜底：直接追加到末尾
      const newContent = content + text;
      handleChangeContent(newContent);
      return;
    }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const newContent = before + text + after;
    handleChangeContent(newContent);
    // 等下一帧再设置光标（React 还没把新值回填到 DOM）
    requestAnimationFrame(() => {
      if (!ta) return;
      if (selectInside) {
        ta.focus();
        ta.setSelectionRange(start + selectInside.start, start + selectInside.end);
      } else {
        const pos = start + text.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  // v6.10 — 点击图片按钮：触发文件选择
  function handleAddImage() {
    if (previewMode) {
      showToast('请先切回编辑模式再插入图片', 'info');
      return;
    }
    fileInputRef.current?.click();
  }

  // v6.10 — 文件选择回调：压缩 + 插入 markdown 图片
  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 清空 input 的 value，否则连续选同一张图不会触发 change
    e.target.value = '';
    if (!file) return;
    setImageProcessing(true);
    try {
      const dataUrl = await compressImageFile(file);
      if (!dataUrl) return;
      // 在光标位置插入图片 markdown（前后各空一行，确保单独成段）
      const insertText = `\n\n![图片](${dataUrl})\n\n`;
      insertAtCursor(insertText);
      showToast('图片已插入', 'success');
    } finally {
      setImageProcessing(false);
    }
  }

  // v6.10 — 切换预览/编辑模式
  function handleTogglePreview() {
    if (!previewMode && !content.trim()) {
      showToast('笔记为空，无内容可预览', 'info');
      return;
    }
    setPreviewMode(!previewMode);
    // 切换前收起 AI 菜单，避免遮挡
    if (showAIMenu) setShowAIMenu(false);
  }

  // v6.7 — AI 笔记助手
  async function handleAISummary() {
    if (!content.trim()) { showToast('请先输入笔记内容', 'error'); return; }
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setShowAIMenu(false);
    setAiLoading(true);
    try {
      const summary = await aiNoteSummary(content);
      // 把摘要追加到笔记末尾
      const newContent = content + '\n\n---\n\n## AI 摘要\n\n' + summary;
      handleChangeContent(newContent);
      showToast('摘要已生成', 'success');
    } catch (e: any) { showToast(e.message || 'AI 请求失败', 'error'); }
    finally { setAiLoading(false); }
  }

  async function handleAIContinue() {
    if (!content.trim()) { showToast('请先输入笔记内容', 'error'); return; }
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setShowAIMenu(false);
    setAiLoading(true);
    try {
      const continuation = await aiNoteContinue(content);
      handleChangeContent(content + '\n\n' + continuation);
      showToast('续写已生成', 'success');
    } catch (e: any) { showToast(e.message || 'AI 请求失败', 'error'); }
    finally { setAiLoading(false); }
  }

  async function handleAITranslate(lang: string) {
    if (!content.trim()) { showToast('请先输入笔记内容', 'error'); return; }
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setShowAIMenu(false);
    setAiLoading(true);
    try {
      const translated = await aiNoteTranslate(content, lang);
      handleChangeContent(content + '\n\n---\n\n## ' + lang + '翻译\n\n' + translated);
      showToast('翻译已生成', 'success');
    } catch (e: any) { showToast(e.message || 'AI 请求失败', 'error'); }
    finally { setAiLoading(false); }
  }

  async function handleDelete() {
    // v6.6 — 修复 #12：新建笔记（已自动保存到 IndexedDB）也要能删除
    const idToDelete = note?.id || createdNoteId;
    if (!idToDelete) { onClose(); return; }
    if (!confirm('确定删除此笔记？')) return;
    if (saveTimer) clearTimeout(saveTimer);
    await softDeleteNote(idToDelete);
    const now = Date.now();
    syncNoteToCloud({ ...(note || {}), id: idToDelete, title, content, pinned, createdAt: note?.createdAt || createdNoteAt || now, updatedAt: now, deletedAt: now } as Note)
      .catch(e => console.log('Sync failed:', e));
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
          {/* v6.10 — 插入图片 */}
          <button
            onClick={handleAddImage}
            disabled={imageProcessing || previewMode}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
            }}
            aria-label="插入图片"
          >
            {imageProcessing ? (
              <span className="block w-4 h-4 rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--primary)', animation: 'spinSlow 0.8s linear infinite' }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            )}
          </button>
          {/* v6.10 — 预览/编辑切换 */}
          <button
            onClick={handleTogglePreview}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{
              background: previewMode ? 'var(--primary-soft)' : 'transparent',
              color: previewMode ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            aria-label="预览/编辑切换"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {previewMode ? (
                <>
                  <path d="M12 19l7-7-7-7" />
                  <path d="M19 12H5" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
          {/* v6.7 — AI 笔记助手 */}
          <div className="relative">
            <button
              onClick={() => setShowAIMenu(!showAIMenu)}
              disabled={aiLoading}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
              style={{
                background: showAIMenu ? 'var(--primary-soft)' : 'transparent',
                color: showAIMenu ? 'var(--primary)' : 'var(--text-secondary)',
              }}
              aria-label="AI 助手"
            >
              <span style={{ fontSize: 14 }}>✨</span>
            </button>
            {showAIMenu && (
              <div
                className="absolute right-0 top-11 z-20 rounded-xl py-1 min-w-[140px]"
                style={{
                  background: 'var(--card)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  border: '1px solid var(--border)',
                }}
              >
                <button onClick={handleAISummary} className="block w-full text-left px-3 py-2 text-[13px] active:bg-[var(--bg-elevated)]">📝 生成摘要</button>
                <button onClick={handleAIContinue} className="block w-full text-left px-3 py-2 text-[13px] active:bg-[var(--bg-elevated)]">✍️ 续写内容</button>
                <button onClick={() => handleAITranslate('英文')} className="block w-full text-left px-3 py-2 text-[13px] active:bg-[var(--bg-elevated)]">🌐 翻译成英文</button>
                <button onClick={() => handleAITranslate('中文')} className="block w-full text-left px-3 py-2 text-[13px] active:bg-[var(--bg-elevated)]">🌐 翻译成中文</button>
              </div>
            )}
            {aiLoading && (
              <div className="absolute right-0 top-11 z-20 rounded-xl py-2 px-3 text-[12px]" style={{ background: 'var(--card)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                AI 处理中…
              </div>
            )}
          </div>
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

      {/* v6.10 — 隐藏的图片选择 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelected}
        style={{ display: 'none' }}
      />

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
        {previewMode ? (
          /* v6.10 — 预览模式：渲染 markdown 为 HTML，图片可直接显示 */
          <div
            className="note-md-preview ios-input min-h-[60vh]"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
            style={{
              background: 'transparent',
              padding: '8px 4px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif',
            }}
          />
        ) : (
          <textarea
            ref={contentRef}
            value={content}
            onChange={e => handleChangeContent(e.target.value)}
            placeholder="在此输入笔记内容… 支持 Markdown 格式，可点击上方图片按钮插入图片"
            className="ios-input min-h-[60vh] resize-none leading-relaxed"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '8px 4px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif',
            }}
          />
        )}
        <div className="text-[11px] pt-1" style={{ color: 'var(--text-tertiary)' }}>
          {previewMode
            ? '👁️ 预览模式：点击眼睛图标可切回编辑。'
            : '💡 笔记会自动保存。支持 Markdown（# 标题、**粗体**、- 列表 等），点击 🖼️ 可插入图片。'}
        </div>
      </div>
    </SwipeableSheet>
  );
}
