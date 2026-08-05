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

// ============================================================
// v6.10.2 — 富文本编辑模式（contentEditable）
// ============================================================
// 解决「编辑模式下图片显示为 base64 代码」的问题。
// 思路：用 contentEditable div 替代 textarea，图片以 <img> 元素
// 直接渲染在编辑器内，文字和图片同时可见、可编辑。
// 保存时把 DOM 序列化回 markdown，加载时把 markdown 转成可编辑 HTML。
// ============================================================

/** HTML 转义（用于安全设置 innerHTML） */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 把 markdown 转换为可编辑 HTML
 * - 图片 ![alt](src) → <img> 元素（contenteditable=false，不可编辑图片本身）
 * - 其他文本保持原样（# 标题、**粗体** 等以纯文本形式显示，由预览模式渲染）
 * - \n → <br>
 */
function markdownToEditableHtml(md: string): string {
  if (!md) return '';
  const parts: string[] = [];
  const regex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(md)) !== null) {
    const text = md.slice(lastIndex, match.index);
    if (text) parts.push(escHtml(text).replace(/\n/g, '<br/>'));
    const alt = escHtml(match[1]);
    const src = match[2]; // data URL 已经是 URL-safe，不需转义
    parts.push(`<img src="${src}" alt="${alt}" class="note-edit-img" contenteditable="false" />`);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < md.length) {
    parts.push(escHtml(md.slice(lastIndex)).replace(/\n/g, '<br/>'));
  }
  return parts.join('');
}

/**
 * 把 contentEditable 的 DOM 序列化回 markdown
 * - text node → 原样
 * - <br> → \n
 * - <img> → ![alt](src)
 * - <div>/<p>（块级）→ 递归 + 前后补换行
 * - 其他元素（strong/em/code/a 等）→ 递归取文本
 * 末尾会折叠 3+ 换行为 2 个（段落分隔）
 */
function editableDomToMarkdown(root: Node): string {
  const serialize = (node: Node): string => {
    let out = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'img') {
          const alt = el.getAttribute('alt') || '';
          const src = el.getAttribute('src') || '';
          out += `![${alt}](${src})`;
        } else if (tag === 'br') {
          out += '\n';
        } else if (tag === 'div' || tag === 'p') {
          // 块级元素：前后确保换行
          if (out && !out.endsWith('\n')) out += '\n';
          out += serialize(el);
          out += '\n';
        } else {
          // strong/em/code/a/span 等：递归取内容
          out += serialize(el);
        }
      }
    });
    return out;
  };
  let result = serialize(root);
  // 折叠 3+ 换行为 2 个
  result = result.replace(/\n{3,}/g, '\n\n');
  // 去掉末尾空白
  result = result.replace(/\s+$/, '');
  return result;
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
  // v6.10.2 — contentEditable 编辑器 ref（替代 textarea）
  const editorRef = useRef<HTMLDivElement>(null);
  // v6.10.2 — 保存光标位置（点击图片按钮会失焦，需要恢复）
  const savedRangeRef = useRef<Range | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // v6.10.4 — 修复 #dup：把 createdNoteId / createdNoteAt / persisting 改为 useRef
  // 之前用 useState，setCreatedNoteId 是异步的。如果 persist 被并发调用
  // （如定时器触发 + 用户点击"完成"几乎同时发生），两次 persist 都看到
  // createdNoteId === null，各自 genId() 生成不同 ID，导致同一条笔记被
  // 创建多次（截图里 14 条重复就是这个原因）。
  // useRef 是同步的，赋值后立即生效，彻底消除竞态。
  const createdNoteIdRef = useRef<string | null>(null);
  const createdNoteAtRef = useRef<number | null>(null);
  // v6.10.4 — 防止 persist 并发执行（in-flight 标志）
  const persistingRef = useRef(false);
  // 新建笔记时，第一次 persist 会生成 ID 并存到这里，
  // 后续 persist 复用这个 ID（变成 update 而不是 create），
  // 避免每次自动保存都创建一条新笔记。
  // v6.10.4 — 保留 state 版本用于触发重渲染（如标题栏文案），但逻辑判断走 ref
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  // v6.6 — 记录新建笔记的首次创建时间，避免每次自动保存把 createdAt 覆盖成当前时间
  const [createdNoteAt, setCreatedNoteAt] = useState<number | null>(null);
  // v6.7 — AI 笔记助手状态
  const [aiLoading, setAiLoading] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  // v6.10 — 预览模式 & 图片处理中
  const [previewMode, setPreviewMode] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  // v6.10.3 — 当前选中的图片元素（用于显示删除按钮）
  const [activeImageEl, setActiveImageEl] = useState<HTMLImageElement | null>(null);
  // v6.10 — 缓存预览 HTML（避免每次 render 重新解析 markdown）
  const previewHtml = useMemo(() => renderMarkdown(content), [content, previewMode]);
  // v6.10.1 — 检测笔记中是否含图片（用于编辑模式提示）
  const imageCount = useMemo(() => {
    const matches = content.match(/!\[[^\]]*\]\([^)]*\)/g);
    return matches ? matches.length : 0;
  }, [content]);
  const hasImages = imageCount > 0;

  useEffect(() => {
    // Auto-focus title for new notes
    if (!note) {
      setTimeout(() => titleRef.current?.focus(), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v6.10.2 — 初始化 contentEditable 内容
  // 仅在 note 切换或预览/编辑模式切换时同步，避免每次输入都重置光标
  useEffect(() => {
    if (!previewMode && editorRef.current) {
      editorRef.current.innerHTML = markdownToEditableHtml(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, previewMode]);

  async function persist(t: string, c: string, p: boolean) {
    // v6.10.4 — 修复 #dup：防止 persist 并发执行
    // 之前：如果定时器触发 + 用户点击"完成"几乎同时发生，两次 persist 都看到
    //       createdNoteId === null，各自 genId() 生成不同 ID，导致重复笔记
    // 现在：persistingRef 是同步的，第二个调用直接 return，避免竞态
    if (persistingRef.current) {
      console.log('[persist] already in-flight, skipping');
      return;
    }
    persistingRef.current = true;
    try {
      const now = Date.now();
      // v6.10.4 — 用 ref 而非 state，避免异步 state 更新导致的竞态
      const existingId = note?.id || createdNoteIdRef.current;

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
          createdAt: note?.createdAt || createdNoteAtRef.current || now,
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
        // v6.10.4 — 同步设置 ref（立即生效），再异步更新 state（触发重渲染）
        createdNoteIdRef.current = newId;
        createdNoteAtRef.current = now;
        setCreatedNoteId(newId);
        setCreatedNoteAt(now);
        await saveNote(created);
        syncNoteToCloud(created).catch(e => console.log('Sync failed:', e));
      }
    } catch (e: any) {
      showToast('保存失败：' + e.message, 'error');
    } finally {
      // v6.10.4 — 释放 in-flight 锁
      persistingRef.current = false;
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

  // v6.10.2 — contentEditable 输入处理：DOM → markdown → setContent + 自动保存
  function handleEditorInput() {
    if (!editorRef.current) return;
    const md = editableDomToMarkdown(editorRef.current);
    setContent(md);
    scheduleSave(title, md, pinned);
  }

  // v6.10.2 — 粘贴时强制纯文本（避免外部富文本污染 markdown）
  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    // 用 execCommand 在光标位置插入纯文本（保留换行）
    document.execCommand('insertText', false, text);
  }

  // v6.10.3 — 点击图片：选中该图片（让 Backspace/Delete 能删除）
  // contenteditable=false 的 img 默认无法删除，必须先选中
  function handleEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' && target.classList.contains('note-edit-img')) {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNode(target);
      sel.removeAllRanges();
      sel.addRange(range);
      // 显示删除按钮（通过 state 控制）
      setActiveImageEl(target as HTMLImageElement);
    } else {
      // 点击空白处隐藏删除按钮
      setActiveImageEl(null);
    }
  }

  // v6.10.3 — 删除当前选中的图片
  function handleDeleteActiveImage() {
    if (!activeImageEl || !editorRef.current) return;
    activeImageEl.remove();
    setActiveImageEl(null);
    handleEditorInput();
    showToast('图片已删除', 'info');
  }

  // v6.10.3 — 键盘删除：监听 keydown，Backspace/Delete 时若有图片被选中则删除
  // （contenteditable=false 的 img 浏览器有时不会自动处理）
  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // 选中的节点是 img
    const container = range.commonAncestorContainer;
    let imgEl: HTMLImageElement | null = null;
    if (container.nodeType === Node.ELEMENT_NODE) {
      const el = container as HTMLElement;
      if (el.tagName === 'IMG' && el.classList.contains('note-edit-img')) {
        imgEl = el as HTMLImageElement;
      }
    }
    if (imgEl) {
      e.preventDefault();
      imgEl.remove();
      setActiveImageEl(null);
      handleEditorInput();
    }
  }

  // v6.10.2 — 点击图片按钮：先保存光标位置，再触发文件选择
  // （点击按钮 contentEditable 会失焦，window.getSelection 会失效）
  function handleAddImage() {
    if (previewMode) {
      showToast('请先切回编辑模式再插入图片', 'info');
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    fileInputRef.current?.click();
  }

  // v6.10.2 — 文件选择回调：压缩 + 在光标位置插入 <img> 元素
  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageProcessing(true);
    try {
      const dataUrl = await compressImageFile(file);
      if (!dataUrl) return;

      const editor = editorRef.current;
      if (!editor) return;

      // 恢复之前保存的光标位置
      const sel = window.getSelection();
      let range: Range;
      if (savedRangeRef.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
        range = savedRangeRef.current;
      } else if (sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
      } else {
        // 兜底：在编辑器末尾插入
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }

      // 清除选区内容
      range.deleteContents();

      // 在光标位置插入：换行 → 图片 → 换行
      const br1 = document.createElement('br');
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '图片';
      img.className = 'note-edit-img';
      img.setAttribute('contenteditable', 'false');
      const br2 = document.createElement('br');

      range.insertNode(br1);
      range.setStartAfter(br1);
      range.collapse(true);
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      range.insertNode(br2);
      range.setStartAfter(br2);
      range.collapse(true);

      // 更新选区
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }

      // 触发保存（从 DOM 序列化为 markdown）
      handleEditorInput();
      showToast('图片已插入', 'success');
      // 不再强制切到预览模式 —— 编辑模式下图片直接可见
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
  // v6.10.2 — AI 生成的内容含 markdown 格式（标题、列表等），切到预览模式查看更清晰
  function getCurrentMarkdown(): string {
    if (!previewMode && editorRef.current) {
      return editableDomToMarkdown(editorRef.current);
    }
    return content;
  }

  async function handleAISummary() {
    const currentMd = getCurrentMarkdown();
    if (!currentMd.trim()) { showToast('请先输入笔记内容', 'error'); return; }
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setShowAIMenu(false);
    setAiLoading(true);
    try {
      const summary = await aiNoteSummary(currentMd);
      const newContent = currentMd + '\n\n---\n\n## AI 摘要\n\n' + summary;
      setContent(newContent);
      scheduleSave(title, newContent, pinned);
      // v6.10.2 — AI 内容含 markdown 格式，切到预览模式渲染
      setPreviewMode(true);
      showToast('摘要已生成', 'success');
    } catch (e: any) { showToast(e.message || 'AI 请求失败', 'error'); }
    finally { setAiLoading(false); }
  }

  async function handleAIContinue() {
    const currentMd = getCurrentMarkdown();
    if (!currentMd.trim()) { showToast('请先输入笔记内容', 'error'); return; }
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setShowAIMenu(false);
    setAiLoading(true);
    try {
      const continuation = await aiNoteContinue(currentMd);
      const newContent = currentMd + '\n\n' + continuation;
      setContent(newContent);
      scheduleSave(title, newContent, pinned);
      setPreviewMode(true);
      showToast('续写已生成', 'success');
    } catch (e: any) { showToast(e.message || 'AI 请求失败', 'error'); }
    finally { setAiLoading(false); }
  }

  async function handleAITranslate(lang: string) {
    const currentMd = getCurrentMarkdown();
    if (!currentMd.trim()) { showToast('请先输入笔记内容', 'error'); return; }
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setShowAIMenu(false);
    setAiLoading(true);
    try {
      const translated = await aiNoteTranslate(currentMd, lang);
      const newContent = currentMd + '\n\n---\n\n## ' + lang + '翻译\n\n' + translated;
      setContent(newContent);
      scheduleSave(title, newContent, pinned);
      setPreviewMode(true);
      showToast('翻译已生成', 'success');
    } catch (e: any) { showToast(e.message || 'AI 请求失败', 'error'); }
    finally { setAiLoading(false); }
  }

  async function handleDelete() {
    // v6.6 — 修复 #12：新建笔记（已自动保存到 IndexedDB）也要能删除
    // v6.10.4 — 用 ref 而非 state，避免 state 异步更新导致的竞态
    const idToDelete = note?.id || createdNoteIdRef.current;
    if (!idToDelete) { onClose(); return; }
    if (!confirm('确定删除此笔记？')) return;
    if (saveTimer) clearTimeout(saveTimer);
    await softDeleteNote(idToDelete);
    const now = Date.now();
    syncNoteToCloud({ ...(note || {}), id: idToDelete, title, content, pinned, createdAt: note?.createdAt || createdNoteAtRef.current || now, updatedAt: now, deletedAt: now } as Note)
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
          /* v6.10.2 — 编辑模式：contentEditable 富文本，图片直接以 <img> 显示 */
          <div className="relative">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onPaste={handleEditorPaste}
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
              className="note-editable ios-input min-h-[60vh]"
              data-placeholder="在此输入笔记内容… 支持 Markdown 格式，点击上方图片按钮可插入图片"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px',
                outline: 'none',
                lineHeight: 1.7,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif',
                wordBreak: 'break-word',
              }}
            />
            {/* v6.10.3 — 选中图片时显示删除按钮 */}
            {activeImageEl && (
              <div
                className="absolute right-2 top-2 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-full fade-in"
                style={{
                  background: 'var(--card)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  border: '1px solid var(--border)',
                }}
              >
                <button
                  onClick={handleDeleteActiveImage}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold active:scale-95 transition-transform flex items-center gap-1"
                  style={{ background: 'var(--pri-high)', color: '#ffffff' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  删除图片
                </button>
                <button
                  onClick={() => setActiveImageEl(null)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] active:scale-95"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >×</button>
              </div>
            )}
          </div>
        )}
        <div className="text-[11px] pt-1" style={{ color: 'var(--text-tertiary)' }}>
          {previewMode
            ? '👁️ 预览模式：渲染 Markdown 格式，点击眼睛图标切回编辑。'
            : '💡 编辑模式：文字和图片同时显示。点击图片可选中并删除。点击 👁️ 切到预览查看渲染后的标题/列表等格式。'}
        </div>
      </div>
    </SwipeableSheet>
  );
}
