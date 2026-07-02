// ============================================================
// Smart-Tasks v6.0 — Task Templates
// Predefined templates that users can quickly select when
// creating a new task. Selecting a template pre-fills the
// TaskEditor with template data (title, description, priority,
// tags, subtasks).
// ============================================================

export interface TaskTemplate {
  id: string;
  name: string;
  icon: string;       // emoji
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  subtasks: { title: string }[];
}

// 8 predefined templates per spec
export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tpl-meeting',
    name: '会议',
    icon: '📋',
    title: '参加会议',
    description: '准备并参加一场会议，记录要点并跟进后续事项。',
    priority: 'medium',
    tags: ['工作'],
    subtasks: [
      { title: '准备材料' },
      { title: '记录要点' },
      { title: '跟进事项' },
    ],
  },
  {
    id: 'tpl-study',
    name: '学习',
    icon: '📖',
    title: '学习新知识',
    description: '系统学习一个新主题，包含阅读、笔记和实践。',
    priority: 'medium',
    tags: ['学习'],
    subtasks: [
      { title: '阅读资料' },
      { title: '做笔记' },
      { title: '实践练习' },
    ],
  },
  {
    id: 'tpl-dev',
    name: '开发任务',
    icon: '💻',
    title: '开发功能',
    description: '完整的开发流程：需求、编码、测试、部署。',
    priority: 'high',
    tags: ['工作', '开发'],
    subtasks: [
      { title: '需求分析' },
      { title: '编写代码' },
      { title: '测试' },
      { title: '部署' },
    ],
  },
  {
    id: 'tpl-exercise',
    name: '运动',
    icon: '🏃',
    title: '运动锻炼',
    description: '保持身体健康，每日运动打卡。',
    priority: 'low',
    tags: ['健康'],
    subtasks: [],
  },
  {
    id: 'tpl-shopping',
    name: '购物',
    icon: '🛒',
    title: '购物清单',
    description: '列出需要购买的物品。',
    priority: 'low',
    tags: ['生活'],
    subtasks: [],
  },
  {
    id: 'tpl-email',
    name: '邮件',
    icon: '📧',
    title: '回复重要邮件',
    description: '处理重要邮件，及时回复避免遗漏。',
    priority: 'high',
    tags: ['工作'],
    subtasks: [],
  },
  {
    id: 'tpl-report',
    name: '报告',
    icon: '📝',
    title: '撰写报告',
    description: '完整撰写一份报告，从数据收集到最终提交。',
    priority: 'high',
    tags: ['工作'],
    subtasks: [
      { title: '收集数据' },
      { title: '写初稿' },
      { title: '审核修改' },
      { title: '提交' },
    ],
  },
  {
    id: 'tpl-project',
    name: '项目',
    icon: '🎯',
    title: '项目任务',
    description: '管理一个项目的主要阶段：规划、执行、验收。',
    priority: 'high',
    tags: ['工作', '项目'],
    subtasks: [
      { title: '规划' },
      { title: '执行' },
      { title: '验收' },
    ],
  },
];
