// AI 客户端 - OpenAI 兼容接口
export interface AISettings {
  baseURL: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'ai-settings';

export function getAISettings(): AISettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveAISettings(s: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearAISettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function aiChat(messages: { role: string; content: string }[], settings?: AISettings): Promise<string> {
  const s = settings || getAISettings();
  if (!s) throw new Error('未配置 AI API，请先在设置中填入');
  const url = s.baseURL.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
    body: JSON.stringify({ model: s.model, messages, temperature: 0.7, stream: false }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`AI 请求失败 (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function parseTaskWithAI(input: string, todayISO: string): Promise<{
  title: string; priority: 'low' | 'medium' | 'high'; dueDate: string | null; tags: string[]; description: string;
}> {
  const system = `你是一个任务解析助手。从用户的自然语言中提取任务信息，返回严格的 JSON 格式：
{"title":"任务标题","priority":"low|medium|high","dueDate":"YYYY-MM-DD 或 null","tags":["标签"],"description":"补充说明"}
规则：今天是 ${todayISO}；"明天"、"后天"等相对日期要换算成 YYYY-MM-DD；"紧急"、"马上" → high；"重要" → medium；其他默认 low；没有明确截止日期 → null；标签最多 3 个；仅输出 JSON。`;
  const resp = await aiChat([{ role: 'system', content: system }, { role: 'user', content: input }]);
  const match = resp.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 响应格式错误');
  return JSON.parse(match[0]);
}

export async function generateWeeklyReport(tasks: any[], pomodoros: any[]): Promise<string> {
  const s = getAISettings();
  if (!s) throw new Error('未配置 AI API');
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const recentTasks = tasks.filter(t => t.updatedAt >= weekAgo);
  const recentPomodoros = pomodoros.filter(p => p.endedAt >= weekAgo);
  const summary = {
    统计周期: `${new Date(weekAgo).toLocaleDateString('zh-CN')} 至 ${new Date(now).toLocaleDateString('zh-CN')}`,
    本周更新任务数: recentTasks.length,
    本周完成任务数: recentTasks.filter(t => t.status === 'done').length,
    本周番茄钟数: recentPomodoros.length,
    本周专注分钟数: Math.round(recentPomodoros.reduce((s, p) => s + p.duration, 0) / 60),
    任务详情: recentTasks.slice(0, 30).map(t => ({ 标题: t.title, 状态: t.status, 优先级: t.priority, 截止: t.dueDate, 标签: t.tags })),
  };
  const system = `你是一个时间管理教练。根据用户本周数据生成简洁有温度的周报，Markdown 格式，包含：1. 本周概览 2. 亮点回顾 3. 改进建议 4. 下周寄语。语气亲切，控制在 300 字以内。`;
  return await aiChat([{ role: 'system', content: system }, { role: 'user', content: `本周数据：\n${JSON.stringify(summary, null, 2)}` }]);
}
