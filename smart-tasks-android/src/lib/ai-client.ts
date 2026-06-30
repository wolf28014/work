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

// AI 拆解子任务：根据任务标题和描述自动生成 3-6 个子任务
export async function aiSplitSubtasks(title: string, description: string): Promise<string[]> {
  const s = getAISettings();
  if (!s) throw new Error('未配置 AI API');
  const system = `你是一个项目管理专家。根据用户提供的任务标题和描述，拆解出 3-6 个具体可执行的子任务。
要求：
- 每个子任务都是独立的、可勾选完成的动作
- 用动词开头（如"完成"、"整理"、"撰写"等）
- 简洁明了，每个不超过 15 个字
- 按 Logical 顺序排列（先做什么，后做什么）
- 返回 JSON 数组格式：["子任务1", "子任务2", ...]
- 只输出 JSON，不要任何额外文字`;

  const user = `任务标题：${title}\n任务描述：${description || '（无描述）'}`;
  const resp = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  const match = resp.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI 响应格式错误');
  const arr = JSON.parse(match[0]);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('AI 未生成有效子任务');
  return arr.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim());
}

// AI 任务总结：根据任务详情生成进展总结和下一步建议
export async function aiTaskSummary(task: any): Promise<string> {
  const s = getAISettings();
  if (!s) throw new Error('未配置 AI API');
  const system = `你是一个任务管理助手。根据用户提供的任务信息，生成简洁的进展总结。
要求：
- 控制在 200 字以内
- 包含：当前进展评估、风险点（如果有）、下一步建议
- 语气专业但亲切
- 使用纯文本，可用 emoji 和换行，不要 Markdown 标题`;

  const taskInfo = {
    标题: task.title,
    描述: task.description || '（无）',
    状态: task.status,
    优先级: task.priority,
    截止日期: task.dueDate || '无',
    标签: task.tags,
    子任务: task.subtasks.map((s: any) => ({ 标题: s.title, 完成: s.done })),
    子任务完成率: task.subtasks.length > 0
      ? `${task.subtasks.filter((s: any) => s.done).length}/${task.subtasks.length}`
      : '无子任务',
    番茄钟数: task.pomodoros,
  };

  return await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `请分析这个任务：\n${JSON.stringify(taskInfo, null, 2)}` },
  ]);
}

// AI 专注建议：根据当前任务列表给出专注建议
export async function aiFocusSuggestion(tasks: any[], recentPomodoros: any[]): Promise<string> {
  const s = getAISettings();
  if (!s) throw new Error('未配置 AI API');
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayPomodoros = recentPomodoros.filter(p => p.endedAt >= todayStart.getTime());
  const pendingTasks = tasks.filter(t => !t.deletedAt && t.status !== 'done' && t.status !== 'cancelled');
  const overdueTasks = pendingTasks.filter(t => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10));

  const summary = {
    '当前未完成任务数': pendingTasks.length,
    '逾期任务数': overdueTasks.length,
    '今日已完成番茄钟数': todayPomodoros.length,
    '待办任务（按优先级）': pendingTasks.slice(0, 10).map(t => ({
      '标题': t.title,
      '优先级': t.priority,
      '截止': t.dueDate || '无',
      '是否逾期': t.dueDate ? t.dueDate < new Date().toISOString().slice(0, 10) : false,
    })),
  };

  const system = `你是一个专注力教练。根据用户当前的任务和今日番茄钟数据，给出 100 字以内的专注建议。
要求：
- 直接给出建议，不要客套
- 优先考虑逾期任务和高优先级任务
- 如果今日番茄钟较少，建议专注；如果较多，建议休息
- 语气亲切有动力，像朋友一样
- 使用纯文本，可用 emoji`;

  return await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `当前状态：\n${JSON.stringify(summary, null, 2)}` },
  ]);
}
