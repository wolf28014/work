import { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../lib/store';
import { aiChat, getAISettings } from '../lib/ai-client';
import { showToast } from './Toast';
import SwipeableSheet from './SwipeableSheet';

interface Props { onClose: () => void; }
interface Message { role: 'user' | 'assistant'; content: string; }

export default function AIChatSheet({ onClose }: Props) {
  const { tasks } = useTaskStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send(text?: string) {
    const content = (text || input).trim();
    if (!content) return;
    if (!getAISettings()) { showToast('请先在设置中配置 AI API', 'error'); return; }
    setInput('');
    setMessages(m => [...m, { role: 'user', content }]);
    setLoading(true);
    try {
      const taskSummary = tasks.filter(t => !t.deletedAt).slice(0, 30)
        .map(t => `- [${t.status}] ${t.title}${t.dueDate ? ` (截止 ${t.dueDate})` : ''}${t.tags.length > 0 ? ` #${t.tags.join(' #')}` : ''}`)
        .join('\n');
      const system = `你是一个智能待办助手。用户当前的任务列表如下：\n${taskSummary}\n\n你的职责：1. 帮助用户分析任务、提供时间管理建议 2. 回答关于任务的问题 3. 给出执行建议 4. 鼓励用户、缓解焦虑。回答要简洁、有温度、像朋友聊天。不要输出 Markdown 标题，可用 emoji 和换行。`;
      const history = [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];
      const resp = await aiChat(history);
      setMessages(m => [...m, { role: 'assistant', content: resp }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ ' + (e.message || '请求失败') }]);
    } finally {
      setLoading(false);
    }
  }

  const quickPrompts = ['今天有哪些任务？', '哪个任务最紧急？', '帮我规划一下今天的工作', '我最近压力大吗？'];

  return (
    <SwipeableSheet onClose={onClose} fullScreen>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="text-blue-500 text-[15px]">关闭</button>
          <span className="text-[15px] font-semibold">✨ AI 助手</span>
          <span className="w-10" />
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✨</div>
              <div className="text-sm font-medium mb-1">你好，我是你的智能助手</div>
              <div className="text-[12px] text-slate-400 mb-4">我可以帮你分析任务、规划时间、提供建议</div>
              <div className="space-y-2">
                {quickPrompts.map(p => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="block w-full text-left px-4 py-2.5 ios-card text-[13px] active:scale-[0.98] transition-transform"
                  >{p}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-emerald-500 text-white rounded-br-md' : 'ios-card rounded-bl-md'
              }`}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="ios-card px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="问我任何关于任务的问题…"
              className="ios-input flex-1"
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center disabled:opacity-50 active:scale-90 transition-transform"
            >↑</button>
          </div>
        </div>
    </SwipeableSheet>
  );
}
