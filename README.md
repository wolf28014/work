# 智能待办 Smart-Tasks

> 一款专为 Android 设计的智能任务管理工具，集任务管理、番茄钟、AI 助手于一体。

## 📦 下载安装

### 直接下载 APK

👉 **[下载最新版 APK](https://github.com/wolf28014/work/releases/latest)**

- **当前版本**：v2.15
- **大小**：5.2 MB
- **支持系统**：Android 7.0 (API 24) 及以上
- **架构**：通用 (armeabi-v7a / arm64-v8a / x86 / x86_64)
- **已签名**，可直接安装

### 安装步骤

1. 点击上方链接下载 APK 文件
2. 在文件管理器中找到下载的 APK，点击安装
3. 系统提示"未知来源"时，按引导允许安装即可
4. 桌面会出现 **智能待办** 图标（翡翠绿对勾 ✅）

> 💡 也可以在 App 内「设置 → 检查更新」直接下载新版本

## ✨ 核心功能

### 5 个视图（底部 Tab 切换）

| 视图 | 说明 |
|------|------|
| 📋 **任务** | 列表视图，TF-IDF 全文搜索、按标签分组、4 种筛选、4 种排序、批量删除 |
| 📊 **看板** | 左右布局，分类侧边栏 + 任务列表，长按拖拽切换状态，批量删除 |
| 📅 **日历** | 月历视图，按状态颜色显示任务圆点，点击日期查看当天任务 |
| 🍅 **番茄钟** | 25 分钟专注 + 5 分钟休息，关联任务、震动提醒、系统通知、AI 专注建议 |
| 📈 **统计** | 完成率、状态分布、优先级分布、近 7 天趋势、番茄钟统计、热门标签、AI 周报 |

### 任务模型

- 标题、描述、截止日期
- 优先级（低 / 中 / 高）
- 状态机（待办 → 进行中 → 已完成 / 已取消）
- 重复任务（每天 / 每周 / 每月，完成后自动生成下一次实例）
- 标签（8 种颜色，可管理）
- 子任务（可勾选，支持展开/收起）
- 番茄钟计数
- 软删除 + 30 天回收站

### AI 助手（6 大场景）

| 位置 | 功能 | 说明 |
|------|------|------|
| 顶部 ✨ AI 按钮 | AI 对话助手 | 基于任务列表对话，可问"今天有哪些任务"等 |
| 任务编辑器标题 | AI 智能解析 | 从自然语言提取标题/截止/优先级/标签（如"明天下午3点开会"） |
| 任务编辑器子任务 | AI 拆解子任务 | 自动生成 3-6 个可执行子任务 |
| 任务编辑器底部 | AI 任务总结 | 分析任务现状、风险点，给出下一步建议 |
| 番茄钟页面 | AI 专注建议 | 根据任务列表和今日番茄钟数给出专注建议 |
| 统计页面 | AI 周报 | AI 根据本周数据生成回顾报告 |

> AI 功能需在「设置 → AI」中配置 API Key，支持智谱 GLM（免费）、OpenAI、DeepSeek、Moonshot 等

### 账号与云同步

- ✅ 邮箱 + 密码注册登录
- ✅ 手机号 + 短信验证码登录
- ✅ 任务、番茄钟、标签自动同步到云端
- ✅ 首次登录合并本地数据到云端（去重）
- ✅ 多设备数据共享
- ✅ 数据安全（Supabase RLS 行级安全）

### 其他特性

- **🎨 8 个高级预设背景** + 自定义图片上传（最大 5MB）
- **🌗 深色模式**：一键切换
- **💾 数据导入导出**：JSON 备份 / CSV 导出 / JSON 恢复
- **🗑️ 回收站**：30 天自动清理
- **🏷️ 标签管理**：添加、删除、修改颜色
- **🔄 应用更新**：启动检查 + 手动检查 + 一键下载
- **📱 全面屏手势**：系统返回键原生支持，MIUI 左右边缘内滑返回
- **🔔 番茄钟提醒**：震动 + 系统通知
- **⭐ Pro 会员**：兑换码激活，支持永久/月度/年度

## 🔧 AI 配置

在 App 内「设置 → AI」中填入：

| 平台 | Base URL | 模型 | 获取 Key |
|------|---------|------|---------|
| 智谱 GLM（推荐，免费） | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | https://open.bigmodel.cn |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | https://platform.openai.com |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | https://platform.deepseek.com |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | https://platform.moonshot.cn |

不配置 AI 也能正常使用所有核心功能，AI 仅用于智能解析、对话、周报等增强场景。

## 💾 数据存储

- **本地存储**：IndexedDB，完全离线可用
- **云端存储**：Supabase（PostgreSQL），启用 RLS 行级安全
- **传输加密**：所有网络请求使用 HTTPS
- **数据导出**：支持 JSON / CSV 导出，可随时备份

## 🛠️ 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS
- **数据层**：IndexedDB + Supabase（PostgreSQL）
- **打包**：Capacitor 6 → Android APK
- **AI**：用户自配 API Key，直连第三方 AI 服务
- **构建**：Android SDK 34 + Gradle 8.14 + JDK 21

## 📁 项目结构

```
smart-tasks-android/
├── src/                          # React 源码
│   ├── App.tsx                   # 主框架 + 底部 Tab Bar + 系统返回键
│   ├── main.tsx                  # 入口
│   ├── index.css                 # 全局样式（iOS 风格）
│   ├── css.d.ts                  # CSS 模块声明
│   ├── lib/
│   │   ├── db.ts                 # IndexedDB 数据层
│   │   ├── task-utils.ts         # 状态机/搜索/序列化
│   │   ├── ai-client.ts          # AI API 客户端
│   │   ├── auth.ts               # 账号 + 云同步
│   │   ├── supabase.ts           # Supabase 客户端
│   │   ├── background.ts         # 背景设置
│   │   ├── updater.ts            # 应用更新检查
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
│       ├── AuthSheet.tsx         # 登录注册
│       ├── LegalSheet.tsx        # 法律文档
│       ├── PrivacyConsentSheet.tsx # 隐私政策同意
│       ├── SwipeableSheet.tsx    # 可滑动子页面容器
│       └── Toast.tsx             # 提示
├── sql/
│   ├── schema.sql                # 数据库 Schema
│   └── app_versions.sql          # 应用版本表
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

# 2. 配置 Supabase（可选，不配置也能用本地功能）
#    编辑 src/lib/supabase.ts，填入你的 Supabase URL 和 anon key
#    在 Supabase SQL Editor 执行 sql/schema.sql

# 3. 构建前端
npm run build

# 4. 同步到 Android 工程
npx cap sync android

# 5. 构建 APK（需要 Android SDK + JDK 21）
cd android
./gradlew assembleRelease

# 6. APK 输出位置
# android/app/build/outputs/apk/release/app-release.apk
```

### 签名说明

仓库自带签名密钥 `android/smart-tasks.keystore`，密码为 `smarttasks123`。如需更换正式签名，删除该文件并重新生成：

```bash
keytool -genkeypair -alias smart-tasks -keyalg RSA -keysize 2048 -validity 36500 \
  -keystore smart-tasks.keystore \
  -dname "CN=YourOrg, O=YourOrg, L=City, ST=State, C=CN"
```

然后修改 `android/app/build.gradle` 中的 `signingConfigs.release` 配置。

## 🔒 权限说明

| 权限 | 用途 |
|------|------|
| INTERNET | AI 功能联网、账号、云同步 |
| VIBRATE | 番茄钟结束震动提醒 |
| WAKE_LOCK | 番茄钟运行时保持屏幕 |
| POST_NOTIFICATIONS | 番茄钟完成通知（Android 13+） |

无任何后台数据上传、无账号追踪、无广告。

## 📋 系统要求

- Android 7.0 (API 24) 及以上
- 架构：armeabi-v7a / arm64-v8a / x86 / x86_64
- 无需 Root
- 网络连接（仅 AI 功能和云同步需要）

## 📞 联系方式

- 邮箱：124462327@qq.com

## 📄 版本历史

| 版本 | 主要更新 |
|------|---------|
| v2.15 | 全面代码检查修复（17 个 TS 错误 + 系统返回键冲突 bug） |
| v2.14 | 接管系统返回手势，原生 MIUI 全面屏体验 |
| v2.13 | MIUI 全面屏手势优化 |
| v2.10 | 番茄图标跳转番茄钟 + 完成震动通知 + 更新下载优化 |
| v2.5 | AI 按钮加文字 + 批量删除 + 文档更新 |
| v2.0 | 账号体系 + 云同步 + 应用更新 + 合规改造 |
| v1.5 | 背景设置功能（8 预设 + 自定义图片） |
| v1.0 | 首个版本，5 视图 + AI + 番茄钟 |
