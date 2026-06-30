# Smart-Tasks Android

> 参考仓库 [wolf28014/Smart-Tasks](https://github.com/wolf28014/Smart-Tasks) 制作的安卓原生 APK 版本，开箱即装即用。

## 📦 直接下载安装

如果你只是想用，不需要自己编译，直接下载 APK 即可：

👉 **[下载 Smart-Tasks-v1.0.apk](./release/Smart-Tasks-v1.0.apk)** (3.0 MB)

- 支持系统：Android 7.0 (API 24) 及以上
- 架构：通用 (armeabi-v7a / arm64-v8a / x86 / x86_64)
- 已签名，可直接安装

### 安装步骤

1. 把 `Smart-Tasks-v1.0.apk` 传到安卓手机
2. 文件管理器中找到该文件，点击安装
3. 系统提示"未知来源"时，按引导允许安装即可
4. 桌面会出现 **智能待办** 图标（翡翠绿对勾 ✅）

## ✨ 核心功能

### 5 个视图（底部 Tab 切换）

| 视图 | 说明 |
|------|------|
| 📋 任务 | 列表视图，TF-IDF 全文搜索、按标签分组、4 种筛选（全部/今日/逾期/已完成） |
| 📊 看板 | 4 列拖拽切换状态（待办 → 进行中 → 已完成 → 已取消） |
| 📅 日历 | 月历视图，按状态颜色显示任务圆点，点击日期查看当天任务 |
| 🍅 番茄 | 25 分钟专注 + 5 分钟休息，可关联任务、自动记录番茄数 |
| 📈 统计 | 完成率、状态分布、优先级分布、近 7 天趋势、番茄钟统计、热门标签 |

### 任务模型

- 标题、描述、截止日期
- 优先级（低 / 中 / 高）
- 状态机（待办 → 进行中 → 已完成 / 已取消）
- 重复任务（每天 / 每周 / 每月，完成后自动生成下一次实例）
- 标签（彩色）
- 子任务（含勾选）
- 番茄钟计数
- 软删除 + 30 天回收站

### 其他特性

- **✨ AI 助手**：顶部 ✨ 按钮打开对话，可问"今天有哪些任务"、"哪个最紧急"等
- **✨ AI 智能解析**：新建任务时点 ✨ 按钮，从自然语言自动提取标题/截止/优先级/标签（如"明天下午3点开会"）
- **✨ AI 周报**：统计页面底部"生成周报"按钮，AI 根据本周数据自动生成回顾
- **🌗 深色模式**：设置 → 通用 → 深色模式
- **💾 数据导入导出**：JSON 备份 / CSV 导出 / JSON 恢复
- **🗑️ 回收站**：设置 → 回收站，30 天自动清理
- **🎨 iOS 风格 + 翡翠绿主色**：毛玻璃顶栏、底部 Tab Bar、大圆角卡片

## 🔧 AI 配置（可选）

如需使用 AI 功能，在 **设置 → AI** 中填入：

| 平台 | Base URL | 模型 | 获取 Key |
|------|---------|------|---------|
| 智谱 GLM（推荐，免费） | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | https://open.bigmodel.cn |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | https://platform.openai.com |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | https://platform.deepseek.com |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | https://platform.moonshot.cn |

不配置 AI 也能正常使用所有核心功能，AI 仅用于智能解析、对话、周报三个增强场景。

## 💾 数据存储

- 所有数据存储在手机本地 **IndexedDB** 中
- **完全离线可用**（除 AI 功能需要联网）
- 卸载 App 会丢失数据，建议定期在 **设置 → 数据 → 导出 JSON** 备份
- 换设备可通过 JSON 文件迁移

## 🛠️ 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS
- **数据层**：IndexedDB（替代原 Prisma + SQLite）
- **打包**：Capacitor 6 → Android APK
- **构建**：Android SDK 34 + Gradle 8.14 + JDK 21
- **签名**：自签名证书（36500 天有效期）

## 📁 项目结构

```
smart-tasks-android/
├── src/                          # React 源码
│   ├── App.tsx                   # 主框架 + 底部 Tab Bar
│   ├── main.tsx                  # 入口
│   ├── index.css                 # iOS 风格全局样式
│   ├── lib/
│   │   ├── db.ts                 # IndexedDB 数据层
│   │   ├── task-utils.ts         # 状态机/搜索/序列化
│   │   ├── ai-client.ts          # AI API 客户端
│   │   └── store.tsx             # 全局状态 Context
│   ├── views/
│   │   ├── ListView.tsx          # 列表视图
│   │   ├── KanbanView.tsx        # 看板视图
│   │   ├── CalendarView.tsx      # 日历视图
│   │   ├── PomodoroView.tsx      # 番茄钟
│   │   └── DashboardView.tsx     # 仪表盘
│   └── components/
│       ├── TaskCard.tsx          # 任务卡片
│       ├── TaskEditor.tsx        # 任务编辑器
│       ├── SettingsSheet.tsx     # 设置面板
│       ├── AIChatSheet.tsx       # AI 对话
│       └── Toast.tsx             # 提示
├── android/                      # Capacitor 生成的 Android 工程
├── capacitor.config.ts           # Capacitor 配置
└── package.json
```

## 🔨 本地构建

如果想自己修改后重新打包 APK：

```bash
# 1. 安装依赖
cd smart-tasks-android
npm install

# 2. 构建前端
npm run build

# 3. 同步到 Android 工程
npx cap sync android

# 4. 构建 APK（需要 Android SDK + JDK 21）
cd android
./gradlew assembleRelease

# 5. APK 输出位置
# android/app/build/outputs/apk/release/app-release.apk
```

### 签名说明

仓库自带签名密钥 `smart-tasks.keystore`（位于 `android/` 目录），密码为 `smarttasks123`。如需更换正式签名，删除该文件并重新生成：

```bash
keytool -genkeypair -alias smart-tasks -keyalg RSA -keysize 2048 -validity 36500 \
  -keystore smart-tasks.keystore \
  -dname "CN=YourOrg, O=YourOrg, L=City, ST=State, C=CN"
```

然后修改 `android/app/build.gradle` 中的 `signingConfigs.release` 配置。

## 🔒 权限说明

| 权限 | 用途 |
|------|------|
| INTERNET | AI 功能联网 |
| VIBRATE | 番茄钟结束震动提示 |
| WAKE_LOCK | 番茄钟运行时保持屏幕 |
| SCHEDULE_EXACT_ALARM | 精确定时 |
| POST_NOTIFICATIONS | 完成通知（Android 13+） |

无任何后台数据上传、无账号、无追踪。

## 📝 与原项目的差异

| 项目 | 原 Web 版 | 本 Android 版 |
|------|---------|--------------|
| 框架 | Next.js 16 | React + Vite |
| 数据库 | Prisma + SQLite | IndexedDB |
| 视图数 | 7 | 5（去掉甘特图、笔记图谱、回收站视图，回收站收纳进设置） |
| AI | 服务端 API 路由 | 客户端直连 |
| 安装 | Web/PWA | 原生 APK |
| 拖拽 | @dnd-kit | HTML5 Drag & Drop |
| 图表 | Recharts | 自绘 CSS 柱状图 |

## 📜 许可证

MIT
