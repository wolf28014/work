import { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { aiChatStream, getEffectiveAISettings, parseAIActions, type AIAction, createVoiceRecognizer } from '../lib/ai-client';
import { canUse, recordUsage } from '../lib/ai-quota';
import { showToast } from './Toast';
import SwipeableSheet from './SwipeableSheet';
import { todayStr } from '../lib/task-utils';

interface Props { onClose: () => void; }
interface Message { role: 'user' | 'assistant'; content: string; }

const CHAT_HISTORY_KEY = 'ai-chat-history';
const MAX_HISTORY = 50;
const MAX_CONTEXT_TURNS = 10;

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}
function saveHistory(msgs: Message[]) {
  try {
    const trimmed = msgs.slice(-MAX_HISTORY);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
}

export default function AIChatSheet({ onClose }: Props) {
  const { tasks, createTask, completeTask } = useTaskStore();
  const { pro } = useAuth();
  const isPro = !!(pro?.isPro && (!pro.expiresAt || pro.expiresAt > Date.now()));
  const [messages, setMessages] = useState<Message[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // v6.7 — 语音输入
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceRef = useRef<ReturnType<typeof createVoiceRecognizer> | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingContent]);

  useEffect(() => { saveHistory(messages); }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  // v6.7 — 执行 AI 返回的操作指令
  async function executeAction(action: AIAction): Promise<string> {
    try {
      if (action.type === 'create_task') {
        const d = action.data || {};
        await createTask({
          title: d.title || '新任务',
          description: d.description || '',
          dueDate: d.dueDate || null,
          priority: ['low', 'medium', 'high'].includes(d.priority) ? d.priority : 'medium',
          tags: Array.isArray(d.tags) ? d.tags.slice(0, 3) : [],
        });
        return `✓ 已创建任务：${d.title || '新任务'}`;
      } else if (action.type === 'complete_task') {
        const title = action.data?.title;
        if (!title) return '✗ 完成任务需要 title';
        const target = tasks.find(t => !t.deletedAt && t.status !== 'done' && t.title.includes(title));
        if (!target) return `✗ 未找到任务：${title}`;
        await completeTask(target.id);
        return `✓ 已完成任务：${target.title}`;
      } else if (action.type === 'start_pomodoro') {
        // 番茄钟需要切换视图，这里只提示
        const title = action.data?.title;
        return title ? `🍅 请手动选择「${title}」开始番茄钟` : '🍅 请切到番茄钟页开始专注';
      }
      return '';
    } catch (e: any) {
      return `✗ 执行失败：${e.message}`;
    }
  }

  async function send(text?: string) {
    const content = (text || input).trim();
    if (!content) return;
    // v6.8 — 配额检查 + Pro Key
    if (!canUse('chat', isPro)) {
      showToast('今日 AI 对话次数已用完，升级 Pro 解锁无限', 'info');
      return;
    }
    const settings = await getEffectiveAISettings();
    if (!settings) {
      showToast('请先在设置中配置 AI API，或升级 Pro 免配置', 'error');
      return;
    }
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content }];
    setMessages(newMessages);
    setLoading(true);
    setStreamingContent('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const today = todayStr();
      const taskSummary = tasks.filter(t => !t.deletedAt).slice(0, 30)
        .map(t => `- [${t.status}] ${t.title}${t.dueDate ? ` (截止 ${t.dueDate})` : ''}${t.tags.length > 0 ? ` #${t.tags.join(' #')}` : ''}`)
        .join('\n');
      const system = `你是一个智能待办助手。今天是 ${today}。用户当前的任务列表如下：\n${taskSummary}\n\n你可以：
1. 用自然语言回复用户
2. 执行操作（创建任务、完成任务、启动番茄钟）

当你需要执行操作时，在回复中插入指令块，格式：
<<<ACTION>>>{"type":"操作类型","data":{...}}<<<END>>>

可执行的操作：
- create_task: {"type":"create_task","data":{"title":"任务标题","dueDate":"YYYY-MM-DD","priority":"low|medium|high","tags":["标签"],"description":"描述"}}
- complete_task: {"type":"complete_task","data":{"title":"任务标题关键词"}}
- start_pomodoro: {"type":"start_pomodoro","data":{"title":"任务标题"}}

示例：
用户："帮我创建明天的会议任务"
回复：好的，我帮你创建一个会议任务 <<<ACTION>>>{"type":"create_task","data":{"title":"会议","dueDate":"${today}","priority":"medium"}}<<<END>>> 已创建！

注意：指令块前后可以有正常文字；JSON 必须合法；日期用 YYYY-MM-DD。其他时候正常聊天，回答简洁有温度。`;

      const recentHistory = newMessages.slice(-MAX_CONTEXT_TURNS * 2);
      const history = [
        { role: 'system', content: system },
        ...recentHistory.map(m => ({ role: m.role, content: m.content })),
      ];

      let full = '';
      await aiChatStream(history, (delta) => {
        full += delta;
        setStreamingContent(full);
      }, { signal: controller.signal, settings });
      // v6.8 — 记录配额使用（成功后，recordUsage 内部判断 Pro 不计数）
      if (!isPro) recordUsage('chat');

      // v6.7 — 解析并执行操作指令
      const { actions, reply } = parseAIActions(full);
      let finalReply = reply;
      if (actions.length > 0) {
        const results: string[] = [];
        for (const action of actions) {
          const result = await executeAction(action);
          results.push(result);
        }
        finalReply = reply + (reply ? '\n\n' : '') + results.join('\n');
      }

      setMessages(m => [...m, { role: 'assistant', content: finalReply }]);
      setStreamingContent('');
    } catch (e: any) {
      const errMsg = e.message || '请求失败';
      if (errMsg === '已取消') {
        if (streamingContent) {
          setMessages(m => [...m, { role: 'assistant', content: streamingContent + '\n\n[已停止]' }]);
          setStreamingContent('');
        }
      } else {
        setMessages(m => [...m, { role: 'assistant', content: '⚠️ ' + errMsg }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stopGeneration() {
    if (abortRef.current) abortRef.current.abort();
  }

  // v6.7 — 语音输入
  function toggleVoice() {
    if (voiceActive) {
      voiceRef.current?.stop();
      setVoiceActive(false);
      return;
    }
    const recognizer = createVoiceRecognizer(
      (text) => setInput(text),
      () => setVoiceActive(false)
    );
    if (!recognizer.isSupported) {
      showToast('当前浏览器不支持语音识别', 'error');
      return;
    }
    voiceRef.current = recognizer;
    recognizer.start();
    setVoiceActive(true);
  }

  function clearChat() {
    if (loading) { showToast('请先停止当前对话', 'info'); return; }
    if (!confirm('清空所有对话历史？')) return;
    setMessages([]);
    localStorage.removeItem(CHAT_HISTORY_KEY);
  }

  const quickPrompts = ['今天有哪些任务？', '帮我创建一个明天的会议任务', '哪个任务最紧急？', '帮我规划一下今天的工作'];

  return (
    <SwipeableSheet onClose={onClose} fullScreen>
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] flex-shrink-0">
          <button onClick={onClose} className="text-blue-500 text-[15px]">关闭</button>
          <span className="text-[15px] font-semibold">✨ AI 助手</span>
          <button
            onClick={clearChat}
            disabled={messages.length === 0 || loading}
            className="text-[13px] text-[color:var(--text-tertiary)] disabled:opacity-30"
          >清空</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
          {messages.length === 0 && !streamingContent && (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✨</div>
              <div className="text-sm font-medium mb-1">你好，我是你的智能助手</div>
              <div className="text-[12px] text-[color:var(--text-tertiary)] mb-4">我可以帮你分析任务、创建任务、规划时间</div>
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
                m.role === 'user' ? 'bg-[var(--primary)] text-[color:#ffffff] rounded-br-md' : 'ios-card rounded-bl-md'
              }`}>{m.content}</div>
            </div>
          ))}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-bl-md ios-card text-[14px] leading-relaxed whitespace-pre-wrap">
                {streamingContent}
                <span className="inline-block w-1.5 h-3.5 bg-[var(--primary)] ml-0.5 animate-pulse" />
              </div>
            </div>
          )}
          {loading && !streamingContent && (
            <div className="flex justify-start">
              <div className="ios-card px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[var(--text-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[var(--text-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[var(--text-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-[var(--border)]">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={voiceActive ? '正在听…请说话' : '问我任何问题，或让我帮你创建任务…（Shift+Enter 换行）'}
              className="ios-input flex-1 resize-none"
              rows={1}
              disabled={loading}
              style={{ maxHeight: 120 }}
            />
            {/* v6.7 — 语音输入按钮 */}
            <button
              onClick={toggleVoice}
              disabled={loading}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
              style={{
                background: voiceActive ? 'var(--pri-high)' : 'var(--bg-elevated)',
                color: voiceActive ? '#ffffff' : 'var(--text-secondary)',
              }}
              aria-label="语音输入"
            >{voiceActive ? '🔴' : '🎤'}</button>
            {loading ? (
              <button
                onClick={stopGeneration}
                className="w-10 h-10 bg-[var(--pri-high)] text-[color:#ffffff] rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                aria-label="停止生成"
              >⏹</button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="w-10 h-10 bg-[var(--primary)] text-[color:#ffffff] rounded-xl flex items-center justify-center disabled:opacity-50 active:scale-90 transition-transform"
              >↑</button>
            )}
          </div>
        </div>
    </SwipeableSheet>
  );
}
