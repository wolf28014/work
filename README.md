# 智能待办 Smart-Tasks

> 一款 AI 驱动的全平台任务管理工具，集任务管理、番茄钟、笔记、日历、AI 助手于一体。
> 支持 Android (APK) 和 Web 双端，数据云端实时同步。

## 📦 下载安装

### Android

👉 **[下载最新版 APK](https://github.com/wolf28014/work/releases/latest)**

- 支持系统：Android 7.0 (API 24) 及以上
- 已签名，可直接覆盖安装
- 也可以在 App 内「设置 → 检查更新」直接下载

### Web 在线使用

👉 **[https://wolf28014.github.io/work/](https://wolf28014.github.io/work/)**

- 无需安装，浏览器直接使用
- 支持桌面端和移动端
- 数据与 Android 端实时同步

## ✨ 核心功能

### 📋 任务管理

- **自然语言创建**：「明天下午 3 点开会」AI 自动解析标题、日期、优先级、标签
- **日期模式**：「那天完成」单点任务 / 「那天之前完成」区间任务（日历区间显示）
- **重复任务**：每天 / 工作日（周一到周五）/ 每周 / 每月
- **子任务**：AI 自动拆解 3-6 个可执行子任务
- **智能搜索**：TF-IDF 关键词搜索 + AI 自然语言搜索（「昨天完成的任务」「跟设计有关的」）
- **批量操作**：批量完成、批量删除、批量置顶
- **排序**：优先级 / 截止日期 / 创建时间，升序降序可选
- **按标签分组**：一键切换分组视图

### 📅 日历视图

- 月历视图，支持月份切换
- 普通任务在截止日显示圆点
- 区间任务在起止区间内每天显示
- 重复任务按规则展开（每天/工作日/每周/每月）
- 已完成任务在完成日显示绿色打卡点
- 逾期任务红色标记

### 🍅 番茄钟

- 25 分钟专注 + 5 分钟休息
- 关联任务，自动记录专注时长
- 震动 + 系统通知提醒
- AI 专注建议（根据当前任务和今日番茄数给出建议）
- PC 端键盘空格快捷键

### 📝 笔记

- Markdown 语法支持
- 自动保存（输入 600ms 后自动存）
- 置顶、搜索、批量操作
- AI 笔记助手：摘要 / 续写 / 翻译成英文 / 翻译成中文
- **图片插入**：笔记编辑页工具栏点击图片图标即可插入图片（自动压缩为 JPEG，最长边 1280px，单张约 80~150KB），支持预览/编辑模式切换
- 云端实时同步

### 🤖 AI 助手

- **流式输出**：回复逐字渲染，可随时停止
- **Function Calling**：AI 能直接创建任务、完成任务、启动番茄钟
- **语音输入**：说话即可输入（Web Speech API）
- **多轮对话**：聊天历史持久化，支持上下文
- **Pro 免配置**：Pro 会员无需配置 API Key，直接使用内置 AI
- 支持智谱 GLM / OpenAI / DeepSeek / Moonshot 等

### 📊 仪表盘

- KPI 卡片：总任务 / 已完成 / 进行中 / 逾期
- 7 天完成趋势柱状图
- 状态分布、优先级分布、热门标签
- AI 智能周报（Markdown 渲染，自动归档）
- AI 目标拆解（输入目标生成月/周/日计划）

### ☁️ 多端同步

- 基于 Supabase 实时同步
- 任务、笔记、番茄钟、标签全量同步
- 实时 WebSocket + 30 秒轮询双保险
- 支持多设备同时使用

### 🎨 个性化

- **10 套主题**：海洋蓝 / 夕阳橙 / 森林绿 / 皇室紫 / 暗夜专业版 / 极光 / 樱花 / 午夜 / 暖沙 / 深海
- **自定义背景**：8 套预设背景色 + 自定义图片上传
- 深色/浅色模式
- PC 端侧边栏布局

## 💎 Pro 会员

### 免费版

| 功能 | 免费额度 |
|------|---------|
| AI 对话 | 10 条/天 |
| AI 解析/拆解/搜索/专注建议/笔记 | 3-5 次/天 |
| AI 总结/周报 | 1 次/天 |
| 主题 | 5 套基础主题 |
| 笔记 | 50 条 |
| 任务管理/日历/番茄钟/同步 | 全免费 |

### Pro 会员（限时 7 折）

| 套餐 | 价格 | 说明 |
|------|------|------|
| 月度 | ¥9.9/月 | 首月仅 ¥1 体验 |
| 年度 | ¥48/年（~~¥68~~） | 月均 ¥4，限时 7 折 |
| 终身 | ¥118（~~¥168~~） | 一次买断，限时 7 折 |

**Pro 权益：**
- ✅ AI 全功能无限次（对话/解析/拆解/总结/搜索/周报/笔记）
- ✅ 免配置 API Key（内置 AI 直接用）
- ✅ 语音输入
- ✅ AI 目标拆解（Pro 专属）
- ✅ AI 看板分类（Pro 专属）
- ✅ 全部 10 套主题 + 自定义背景
- ✅ 笔记无限创建

## 🔒 数据安全

- **本地优先**：所有数据存在 IndexedDB，离线完全可用
- **云端同步**：可选登录账号，数据加密传输到 Supabase
- **回收站**：删除的任务 30 天内可恢复
- **导出备份**：随时导出 JSON/CSV 到本地
- **导入恢复**：支持从备份文件恢复数据
- **API Key 加密**：AI API Key 混淆存储，不明文暴露
- **RLS 行级安全**：云端数据按用户隔离，互不可见

## 🛠️ 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS + Vite
- **移动端**：Capacitor 8（Android APK）
- **后端**：Supabase（PostgreSQL + Auth + Realtime）
- **AI**：OpenAI 兼容协议（智谱 GLM / OpenAI / DeepSeek 等）
- **数据存储**：IndexedDB（本地）+ Supabase PostgreSQL（云端）

## 📁 项目结构

```
smart-tasks-android/
├── src/
│   ├── components/     # 组件（TaskCard, TaskEditor, AIChatSheet 等）
│   ├── views/          # 视图（List, Kanban, Calendar, Pomodoro, Notes, Dashboard）
│   ├── lib/            # 工具库（db, auth, store, ai-client, themes 等）
│   └── index.css       # 全局样式 + CSS 变量主题
├── android/            # Capacitor Android 项目
├── sql/                # Supabase SQL 脚本
└── .github/workflows/  # CI/CD（自动构建 APK + 部署 Pages）
```

## 🚀 自动化部署

- **推送代码** → GitHub Actions 自动部署 Web 端到 GitHub Pages
- **打 Tag 发版** → GitHub Actions 自动构建 APK + 生成二维码 + 上传到 Release
- 无需手动操作，全自动化

## 📝 更新日志

详见 [Releases](https://github.com/wolf28014/work/releases)

## 📄 License

MIT License

## 💬 反馈

- 提 Issue：[https://github.com/wolf28014/work/issues](https://github.com/wolf28014/work/issues)
- 兑换码获取：联系开发者
