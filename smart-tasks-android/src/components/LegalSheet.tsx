interface Props {
  onClose: () => void;
  type: 'privacy' | 'agreement' | 'about' | 'permissions';
}

const PRIVACY_POLICY = `
# 隐私政策

更新日期：2026-06-30

## 一、引言

智能待办（以下简称"本应用"）尊重并保护所有用户的个人隐私权。本隐私政策说明我们如何收集、使用、存储和保护您的信息。

## 二、信息收集与使用

### 1. 注册登录信息
当您选择注册账号时，我们会收集：
- 邮箱地址（用于账号注册和登录）
- 手机号（仅当您选择手机号登录时）
- 加密后的密码（不可逆，我们无法看到明文）

### 2. 任务数据
您创建的任务、标签、子任务、番茄钟记录、笔记等内容，存储在您的设备本地（IndexedDB）。当您登录账号后，这些数据会同步到云端数据库，用于多设备同步。

### 3. 应用设置
您的偏好设置（主题、背景、排序方式等）存储在本地。登录后会同步到云端。

### 4. AI 功能（可选）
本应用的 AI 功能由用户自行配置 API Key 后调用第三方服务（如智谱 GLM、OpenAI 等）。AI 请求由您的设备直接发送到您配置的 AI 服务商，本应用不经过任何中间服务器，不收集您的对话内容。

### 5. 自定义背景图片
您上传的自定义背景图片仅存储在您的设备本地，不会上传到服务器（除非您登录账号并开启了云同步）。

## 三、信息存储与安全

- **本地存储**：使用浏览器 IndexedDB，仅您本人可访问
- **云端存储**：使用 Supabase（PostgreSQL 数据库），启用行级安全策略（RLS），每个用户只能访问自己的数据
- **传输加密**：所有网络请求使用 HTTPS 加密
- **密码加密**：使用 bcrypt 算法哈希存储，不可逆

## 四、信息共享

我们不会将您的个人信息出售、出租或交易给第三方。在以下情况下可能共享：

- 获得您的明确同意
- 根据法律法规要求
- 为维护我们的合法权益（如应对诉讼）

## 五、您的权利

您有权：
- 访问您的个人数据
- 修改或删除您的账号和数据
- 导出您的全部数据（设置 → 数据 → 导出 JSON）
- 注销账号（联系开发者）

## 六、未成年人

本应用不面向 13 岁以下未成年人。如果您是未成年人，请在监护人同意后使用。

## 七、第三方服务

本应用使用以下第三方服务：
- Supabase（账号、数据库、存储）
- 用户自行配置的 AI 服务商（OpenAI、智谱 GLM 等）

这些服务有自己的隐私政策，请仔细阅读。

## 八、隐私政策变更

我们可能更新本隐私政策。更新后会在应用内提示您。

## 九、联系我们

如有任何隐私相关问题，请联系：
- 邮箱：124462327@qq.com
`;

const USER_AGREEMENT = `
# 用户协议

更新日期：2026-06-30

## 一、服务说明

智能待办是一款任务管理工具应用，提供任务列表、看板、日历、番茄钟、统计等功能。

## 二、使用规则

### 1. 您承诺
- 不利用本应用从事违法违规活动
- 不上传违法、侵权或有害信息
- 不破坏或干扰本应用的正常运行
- 不试图未经授权访问他人数据

### 2. 禁止行为
- 反向工程、反编译应用
- 未经授权批量注册账号
- 利用 AI 功能生成违法内容

## 三、账号

- 您需自行保管账号密码，因泄露造成的损失由您承担
- 我们有权对违反协议的账号进行封禁
- 长期不登录的账号，我们有权清理其云端数据

## 四、付费服务

### 1. Pro 会员
- Pro 会员为付费增值服务，提供 AI 无限、自定义背景、主题色等高级功能
- 付费方式：兑换码
- Pro 权益在到期后自动失效

### 2. 退款政策
- 兑换码未使用前可申请退款
- 已激活的兑换码不支持退款

## 五、知识产权

- 本应用的代码、UI 设计、图标等知识产权归开发者所有
- 您创建的任务内容归您所有
- 应用的所有权益归开发者所有

## 六、免责声明

- 本应用不保证服务持续可用，可能因维护、升级中断
- 因不可抗力（自然灾害、网络故障等）导致的服务中断，我们不承担责任
- 您应定期导出数据备份，因未备份导致的数据丢失，我们不承担责任

## 七、协议变更

我们可能更新本协议。更新后继续使用即视为同意。

## 八、适用法律

本协议适用中华人民共和国法律。

## 九、联系方式

- 邮箱：124462327@qq.com
`;

const PERMISSIONS_INFO = `
# 权限说明

本应用申请以下权限，每项权限的用途如下：

## 1. INTERNET（网络访问）
**用途**：
- AI 功能（智能解析、对话、周报、专注建议）联网调用 AI 服务
- 账号注册登录
- 云同步任务数据

**必要性**：必需。无此权限无法使用 AI 和账号功能（但本地任务管理仍可用）。

## 2. VIBRATE（震动）
**用途**：番茄钟结束时震动提醒

**必要性**：可选。可在系统设置中关闭。

## 3. WAKE_LOCK（保持唤醒）
**用途**：番茄钟运行期间防止屏幕自动关闭

**必要性**：可选。可在系统设置中关闭。

## 4. POST_NOTIFICATIONS（通知）
**用途**：任务到期、番茄钟结束等场景的通知（Android 13+）

**必要性**：可选。可在系统设置中关闭。

## 已移除的权限

以下权限在历史版本中存在，现已移除：
- SCHEDULE_EXACT_ALARM：番茄钟改用 setInterval 实现，不再需要精确定时权限

## 权限管理

您可以在手机系统的"设置 → 应用 → 智能待办 → 权限"中随时开启或关闭以上权限。

关闭网络权限后：
- ✅ 仍可使用：任务管理、看板、日历、番茄钟、统计、本地搜索
- ❌ 无法使用：AI 功能、云同步、账号登录
`;

const ABOUT_INFO = `
# 关于智能待办

## 应用信息
- 名称：智能待办
- 版本：v1.9.0
- 包名：com.smarttasks.android
- 支持系统：Android 7.0+

## 项目介绍

智能待办是一款专为 Android 设计的任务管理工具，集任务管理、番茄钟、AI 助手于一体。

### 核心功能
- 5 个视图：任务列表、看板、日历、番茄钟、统计仪表盘
- AI 助手：智能解析、对话、周报、专注建议、子任务拆解、任务总结
- 本地存储：IndexedDB，完全离线可用
- 云同步：登录后多设备同步（可选）
- 8 个高级预设背景 + 自定义图片
- 隐私保护：所有数据存本地或加密存云端

### 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS
- 数据层：IndexedDB + Supabase（PostgreSQL）
- 打包：Capacitor → Android APK
- AI：用户自配 API Key，直连第三方 AI 服务

## 项目声明
本项目为开发者独立开发的原创应用，所有权益归开发者所有。

## 联系方式
- 邮箱：124462327@qq.com

## 致谢
- 图标字体：Apple SF Pro、Noto Sans SC
- 后端服务：Supabase
`;

export default function LegalSheet({ onClose, type }: Props) {
  const title = {
    privacy: '隐私政策',
    agreement: '用户协议',
    about: '关于',
    permissions: '权限说明',
  }[type];

  const content = {
    privacy: PRIVACY_POLICY,
    agreement: USER_AGREEMENT,
    about: ABOUT_INFO,
    permissions: PERMISSIONS_INFO,
  }[type];

  return (
    <div className="fixed inset-0 z-[60] modal-mask flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white dark:bg-black slide-up max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-3xl"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 sticky top-0 bg-white dark:bg-black z-10 border-b border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="text-blue-500 text-[15px]">返回</button>
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="w-10" />
        </div>
        <div className="px-5 py-4 text-[14px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}
