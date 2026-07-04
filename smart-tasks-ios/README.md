# Smart-Tasks iOS

> AI 智能任务管理工具 - iOS 版本

## ⚠️ 构建环境要求

- **macOS**（必须，无法在 Windows/Linux 构建 iOS）
- **Xcode 15+**（从 App Store 下载）
- **CocoaPods**（`sudo gem install cocoapods`）
- **Node.js 18+**
- **Apple Developer 账号**（$99/年，用于签名和分发）

## 🚀 构建步骤

### 1. 安装依赖

```bash
cd smart-tasks-ios
npm install
```

### 2. 构建前端

```bash
npm run build
```

### 3. 添加 iOS 平台（首次）

```bash
npx cap add ios
```

### 4. 同步前端到 iOS

```bash
npx cap sync ios
```

### 5. 用 Xcode 打开

```bash
npx cap open ios
```

### 6. 在 Xcode 中配置

1. **设置签名**：左侧选 App → Signing & Capabilities → 选你的 Team
2. **设置 Bundle Identifier**：改成你的唯一标识（如 `com.yourname.smarttasks`）
3. **设置版本号**：General → Version 填 `6.9.6`，Build 填 `60906`

### 7. 构建运行

- **模拟器**：选模拟器 → 点 ▶️ 运行
- **真机调试**：连 iPhone → 选设备 → 点 ▶️ 运行
- **打包 IPA**：Product → Archive → Distribute App

## 📱 平台差异说明

### 状态栏
- iOS 用 `StatusBar` 插件设置样式
- 安全区通过 CSS `env(safe-area-inset-top)` 处理（代码已支持）

### 返回手势
- iOS 用边缘滑动返回（SwipeableSheet 已支持）
- 系统返回键由 Capacitor App 插件处理

### 推送通知
- iOS 需要在 Xcode 开启 Push Notifications capability
- Local Notifications 插件已集成

### 键盘
- 加了 `@capacitor/keyboard` 插件处理键盘弹出
- `resize: 'body'` 让页面在键盘弹出时调整

### Haptics（震动）
- 震动反馈用 `@capacitor/haptics`（已集成）
- iOS 支持 Taptic Engine（比 Android 震动更细腻）

### 热更新
- `@capgo/capacitor-updater` 已集成
- 需要在 Capgo 后台配置 iOS channel

## 🔄 与 Android 版本的关系

| 项目 | 前端代码 | 原生壳 |
|------|---------|--------|
| `smart-tasks-android/` | 共享 src/ | Android (Java/Kotlin) |
| `smart-tasks-ios/` | 共享 src/ | iOS (Swift) |

前端代码（React + TypeScript）完全相同，功能一致。区别仅在原生层：
- Android 用 Gradle 构建 APK
- iOS 用 Xcode 构建 IPA

## 📦 发布到 App Store

1. Xcode → Product → Archive
2. Organizer → Distribute App → App Store Connect
3. 在 App Store Connect 填写应用信息、截图、描述
4. 提交审核（通常 1-3 天）

## 📄 数据同步

iOS 版与 Android 版共享同一个 Supabase 后端，登录同一账号即可同步数据。

## 📝 License

MIT
