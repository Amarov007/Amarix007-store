import React from 'react';
import { useStore } from '../context/StoreContext';
import {
  ShieldAlert,
  Send,
  ExternalLink,
  Mail,
  HelpCircle,
  FileText,
  Clock,
  CheckCircle2,
  Lock
} from 'lucide-react';

export const Footer: React.FC = () => {
  const { lang, navigate, partnerConfig } = useStore();

  return (
    <footer className="w-full bg-[#0d0e13] border-t border-[#2c2e3d] mt-16 pt-12 pb-8 text-[#a4a7b5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Partner Banner Card */}
        {partnerConfig.on && (
          <div className="mb-12 p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#191a23] to-[#1e231e] border border-[#b9ff66]/20 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
            <div className="flex items-center gap-4 text-center sm:text-start">
              <div className="w-12 h-12 rounded-xl bg-[#b9ff66] text-[#191a23] font-black text-xl flex items-center justify-center shrink-0">
                U
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#b9ff66]">
                  {lang === 'ar' ? 'الشريك الرسمي' : 'OFFICIAL PARTNER'}
                </span>
                <h4 className="text-base sm:text-lg font-bold text-[#f3f3f3] mt-0.5">
                  {lang === 'ar' ? partnerConfig.ar : partnerConfig.en}
                </h4>
              </div>
            </div>
            <a
              href={partnerConfig.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-xl bg-[#b9ff66] text-[#191a23] font-black text-xs hover:bg-[#cdff8f] transition-all flex items-center gap-2 shrink-0 shadow-md"
            >
              <span>{lang === 'ar' ? partnerConfig.ba : partnerConfig.be}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* 4-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-12 border-b border-[#2c2e3d]/80">
          
          {/* Brand Info */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[#191a23] border border-[#b9ff66]/30 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 25.5L14 7L16.5 12" stroke="#B9FF66" strokeWidth="2.75" />
                  <path d="M10 18.5H19" stroke="#F3F3F3" strokeWidth="2.25" />
                  <path d="M16.5 12L20.5 18L26 8" stroke="#B9FF66" strokeWidth="2.75" />
                  <circle cx="26" cy="8" r="1.75" fill="#B9FF66" />
                </svg>
              </div>
              <span className="text-lg font-black text-[#f3f3f3] font-['Urbanist',sans-serif]">
                AMARIX<span className="text-[#b9ff66]">007</span>
              </span>
            </div>
            <p className="text-xs text-[#a4a7b5] leading-relaxed mb-4">
              {lang === 'ar'
                ? 'متجر الأصول الرقمية المعتمد: روبوتات تداول آلية MT5، شحن ألعاب، خدمات رشق وحسابات ممولة مع تسليم رقمي سريع ودعم فني على مدار الساعة.'
                : 'Verified digital assets store: MT5 algorithmic bots, instant game top-ups, social boost engagement, and funded accounts with 24/7 technical support.'}
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://t.me/amarix007"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-[#1b1c26] text-[#229ed9] hover:bg-[#232430] flex items-center justify-center border border-[#2c2e3d] transition-colors"
                title="Telegram"
              >
                <Send className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com/amarix007"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-[#1b1c26] text-[#e1306c] hover:bg-[#232430] flex items-center justify-center border border-[#2c2e3d] transition-colors"
                title="Instagram"
              >
                <span className="text-xs font-bold">IG</span>
              </a>
              <a
                href="https://x.com/amarix007"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-[#1b1c26] text-[#f3f3f3] hover:bg-[#232430] flex items-center justify-center border border-[#2c2e3d] transition-colors"
                title="X (Twitter)"
              >
                <span className="text-xs font-bold">𝕏</span>
              </a>
              <a
                href="mailto:amarov0077@gmail.com"
                className="w-8 h-8 rounded-lg bg-[#1b1c26] text-[#b9ff66] hover:bg-[#232430] flex items-center justify-center border border-[#2c2e3d] transition-colors"
                title="Email"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Sections */}
          <div>
            <h4 className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider mb-3">
              {lang === 'ar' ? 'الأقسام الرئيسية' : 'Key Categories'}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => navigate('#/c/bots')} className="hover:text-[#b9ff66] transition-colors">
                  {lang === 'ar' ? 'روبوتات وخوارزميات التداول' : 'Trading Bots & Algos'}
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/boost')} className="hover:text-[#b9ff66] transition-colors">
                  {lang === 'ar' ? 'خدمات الرشق والمتابعين' : 'Followers & Social Boost'}
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/g/games')} className="hover:text-[#b9ff66] transition-colors">
                  {lang === 'ar' ? 'شحن الألعاب وشدات ببجي' : 'Game Top-up & PUBG UC'}
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/g/apps')} className="hover:text-[#b9ff66] transition-colors">
                  {lang === 'ar' ? 'اشتراكات التطبيقات والذكاء الاصطناعي' : 'Apps & AI Subscriptions'}
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/c/numbers')} className="hover:text-[#b9ff66] transition-colors">
                  {lang === 'ar' ? 'أرقام التفعيل واستقبال الرموز' : 'Virtual SMS Numbers'}
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/c/funded')} className="hover:text-[#b9ff66] transition-colors">
                  {lang === 'ar' ? 'شراء حسابات التداول الممولة' : 'Funded Trading Accounts'}
                </button>
              </li>
            </ul>
          </div>

          {/* Customer Service & Orders */}
          <div>
            <h4 className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider mb-3">
              {lang === 'ar' ? 'خدمة العملاء والطلبات' : 'Customer Center'}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => navigate('#/orders')} className="hover:text-[#b9ff66] transition-colors flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#b9ff66]" />
                  <span>{lang === 'ar' ? 'متابعة وتتبع طلباتي' : 'Track My Orders'}</span>
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/cart')} className="hover:text-[#b9ff66] transition-colors flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#b9ff66]" />
                  <span>{lang === 'ar' ? 'سلة المشتريات والدفع' : 'Shopping Cart & Checkout'}</span>
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/support')} className="hover:text-[#b9ff66] transition-colors flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-[#b9ff66]" />
                  <span>{lang === 'ar' ? 'تذاكر الدعم والمساعدة' : 'Support Tickets Desk'}</span>
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/faq')} className="hover:text-[#b9ff66] transition-colors flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#b9ff66]" />
                  <span>{lang === 'ar' ? 'الأسئلة الشائعة (FAQ)' : 'Frequently Asked Questions'}</span>
                </button>
              </li>
              <li>
                <button onClick={() => navigate('#/policies')} className="hover:text-[#b9ff66] transition-colors flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#b9ff66]" />
                  <span>{lang === 'ar' ? 'شروط الخدمة والسياسات' : 'Terms & Store Policies'}</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Accepted Payments & Trust */}
          <div>
            <h4 className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider mb-3">
              {lang === 'ar' ? 'طرق الدفع والعملات' : 'Accepted Payments'}
            </h4>
            <p className="text-xs text-[#a4a7b5] mb-3">
              {lang === 'ar'
                ? 'ندعم التحويل المباشر بالدولار الرقمي USDT والليرة السورية بدون وساطة مع تأكيد يدوي فوري.'
                : 'Direct manual payments accepted via USDT BEP20, Binance Pay, Syriatel Cash & Sham Cash.'}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-[#1b1c26] text-[#26A17B] border border-[#2c2e3d] font-bold">
                USDT BEP20
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#1b1c26] text-[#F0B90B] border border-[#2c2e3d] font-bold">
                Binance Pay
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#1b1c26] text-[#E30613] border border-[#2c2e3d] font-bold">
                Syriatel Cash
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#1b1c26] text-[#0B7A4B] border border-[#2c2e3d] font-bold">
                Sham Cash
              </span>
            </div>
          </div>

        </div>

        {/* Risk Warning & Copyright */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#5b5e6e]">
          <div className="flex items-center gap-2 text-center md:text-start">
            <ShieldAlert className="w-4 h-4 text-[#fbbf24] shrink-0" />
            <span>
              {lang === 'ar'
                ? 'إخلاء مسؤولية: التداول ينطوي على مخاطر مالية ولا نعد بأي أرباح مؤكدة. جميع المنتجات والخدمات رقمية وتُسلَّم إلكترونياً.'
                : 'Risk Disclaimer: Trading carries significant financial risk. All items and services are digital and delivered electronically.'}
            </span>
          </div>
          <div className="shrink-0 text-center">
            {lang === 'ar' ? '© 2026 AMARIX007. جميع الحقوق محفوظة.' : '© 2026 AMARIX007. All rights reserved.'}
          </div>
        </div>

      </div>
    </footer>
  );
};
