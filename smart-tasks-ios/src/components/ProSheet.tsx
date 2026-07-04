import { useState } from 'react';
import SwipeableSheet from './SwipeableSheet';
import { showToast } from './Toast';
import { useAuth, redeemCode } from '../lib/auth';

interface Props {
  onClose: () => void;
}

interface PlanDef {
  id: string;
  name: string;
  price: string;
  originalPrice?: string;  // v6.8.2 — 原价（划线价）
  period: string;
  tagline: string;
  highlight?: boolean;
  badge?: string;
}

// v6.8.2 — 方案 A + 首月优惠 + 限时折扣
// 限时折扣：原价 ¥9.9/月 ¥68/年 ¥168/终身，限时 7 折
// 首月优惠：月度首月 ¥1
const PLANS: PlanDef[] = [
  {
    id: 'monthly', name: '月度',
    price: '¥9.9', period: '/月',
    tagline: '首月仅 ¥1 体验，次月 ¥9.9/月，随时可取消',
    badge: '首月¥1',
  },
  {
    id: 'yearly', name: '年度',
    price: '¥48', originalPrice: '¥68', period: '/年',
    tagline: '限时 7 折！月均仅 ¥4，比月度省 60%',
    highlight: true, badge: '限时7折',
  },
  {
    id: 'lifetime', name: '终身',
    price: '¥118', originalPrice: '¥168', period: '一次性',
    tagline: '限时 7 折！一次买断，相当于 2.5 年年费',
    badge: '超值',
  },
];

const PRO_FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: '✦', title: 'AI 全功能无限',    desc: '对话/解析/拆解/总结/搜索/周报/笔记 AI 全部无限次，免配置 API Key' },
  { icon: '🎤', title: '语音输入',         desc: 'AI 助手支持语音说话输入，解放双手' },
  { icon: '✿', title: '高级主题与背景',   desc: '解锁极光/樱花/午夜/暖沙/深海 5 套高级主题，自定义背景图' },
  { icon: '🎯', title: 'AI 目标拆解',     desc: '输入目标自动拆解成月/周/日计划' },
  { icon: '▦', title: 'AI 看板分类',      desc: 'AI 自动建议任务归类到看板列' },
  { icon: '☁', title: '云同步扩容',       desc: '多设备无限同步，云端存储扩容' },
];

export default function ProSheet({ onClose }: Props) {
  const { user, pro, isConfigured } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string>('yearly');
  const [redeemInput, setRedeemInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  async function handleRedeem() {
    if (!redeemInput.trim()) return;
    if (!user) {
      showToast('请先登录账号再兑换', 'error');
      return;
    }
    setRedeeming(true);
    try {
      await redeemCode(redeemInput.trim());
      showToast('🎉 兑换成功，已开通 Pro', 'success');
      setRedeemInput('');
    } catch (e: any) {
      showToast(e.message || '兑换失败，请检查兑换码', 'error');
    } finally {
      setRedeeming(false);
    }
  }

  function handlePurchase() {
    if (!user) {
      showToast('请先登录账号', 'info');
      return;
    }
    if (!isConfigured) {
      showToast('当前未配置云服务，无法在线支付，请使用兑换码', 'info');
      return;
    }
    showToast('支付通道接入中，请使用兑换码激活', 'info');
  }

  return (
    <SwipeableSheet onClose={onClose} fullScreen>
      <div className="px-5 pb-6 fade-in">
        {/* 头部 */}
        <div className="text-center pt-2 pb-4">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-3xl glow-pulse mb-3"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))' }}
          >
            <span style={{ fontSize: 30, color: '#ffffff', fontWeight: 900 }}>✦</span>
          </div>
          <h2 className="text-[26px] font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Smart-Tasks <span style={{ color: 'var(--primary)' }}>Pro</span>
          </h2>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            解锁全部高级功能，让效率飞跃
          </p>
          {pro?.isPro && (
            <div
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-[12px] font-bold"
              style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)', color: 'var(--primary)' }}
            >
              <span>✓</span>
              <span>您已是 Pro 会员</span>
              {pro.expiresAt && (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  · 至 {new Date(pro.expiresAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 功能列表 */}
        <div className="v3-card p-4 mb-4">
          <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Pro 专属权益
          </div>
          <div className="grid grid-cols-1 gap-3">
            {PRO_FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}
                >
                  <span style={{ fontSize: 16 }}>{f.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{f.title}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 套餐选择 */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            选择套餐
          </div>
          {/* v6.8.2 — 限时折扣标签 */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--pri-high-soft)', color: 'var(--pri-high)' }}>
            <span>🔥 限时 7 折</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PLANS.map(p => {
            const isSelected = selectedPlan === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className="relative p-3 rounded-2xl transition-all active:scale-[0.97]"
                style={{
                  background: isSelected ? 'var(--primary-soft)' : 'var(--bg-elevated)',
                  border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {p.badge && (
                  <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap"
                    style={{
                      background: p.highlight ? 'linear-gradient(135deg, var(--primary), var(--primary-strong))' : 'var(--accent-violet)',
                      color: '#ffffff',
                    }}
                  >
                    {p.badge}
                  </div>
                )}
                <div className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{p.name}</div>
                <div className="flex items-baseline gap-1 justify-center">
                  {p.originalPrice && (
                    <span className="text-[11px] line-through" style={{ color: 'var(--text-tertiary)' }}>{p.originalPrice}</span>
                  )}
                  <span className="text-[18px] font-black" style={{ color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>{p.price}</span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.period}</div>
              </button>
            );
          })}
        </div>

        {/* 套餐说明 */}
        <div className="text-[11px] mb-4 px-1 text-center" style={{ color: 'var(--text-tertiary)' }}>
          {PLANS.find(p => p.id === selectedPlan)?.tagline}
        </div>

        {/* 购买按钮 */}
        <button
          onClick={handlePurchase}
          className="w-full py-3.5 rounded-full text-[15px] font-bold active:scale-[0.98] transition-transform mb-5"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))',
            color: '#ffffff',
            boxShadow: '0 8px 20px var(--primary-glow)',
          }}
        >
          {selectedPlan === 'monthly' ? '¥1 体验首月' : selectedPlan === 'yearly' ? '¥48 开通年度' : '¥118 终身买断'}
        </button>

        {/* 兑换码 */}
        <div className="v3-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: 'var(--accent-violet)' }}>🎁</span>
            <div className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>使用兑换码</div>
          </div>
          <div className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
            拥有激活码？输入后立即激活 Pro 权益
          </div>
          <div className="flex gap-2">
            <input
              value={redeemInput}
              onChange={e => setRedeemInput(e.target.value)}
              placeholder="输入兑换码"
              className="ios-input"
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <button
              onClick={handleRedeem}
              disabled={!redeemInput.trim() || redeeming}
              className="px-5 py-3 rounded-full text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-40"
              style={{ background: 'rgba(139,124,255,0.16)', border: '1px solid rgba(139,124,255,0.35)', color: 'var(--accent-violet)' }}
            >
              {redeeming ? '兑换中…' : '兑换'}
            </button>
          </div>
        </div>

        {/* 底部说明 */}
        <div className="text-center text-[10px] mt-4 leading-relaxed" style={{ color: 'var(--text-quaternary)' }}>
          订阅自动续费，可随时在设置中取消<br />
          继续即表示同意 <span style={{ color: 'var(--text-tertiary)' }}>用户协议</span> 与 <span style={{ color: 'var(--text-tertiary)' }}>隐私政策</span>
        </div>
      </div>
    </SwipeableSheet>
  );
}
