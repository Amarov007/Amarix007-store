import React from 'react';
import { useStore } from '../context/StoreContext';
import {
  X,
  Home,
  Bot,
  TrendingUp,
  Gamepad2,
  Coins,
  Globe,
  Smartphone,
  ShieldCheck,
  Gift,
  Clock,
  Heart,
  ShoppingCart,
  User,
  HelpCircle,
  FileText,
  Volume2,
  VolumeX,
  Music,
  ExternalLink
} from 'lucide-react';

export const Drawer: React.FC = () => {
  const {
    lang,
    setLang,
    currency,
    setCurrency,
    soundOn,
    toggleSound,
    musicOn,
    toggleMusic,
    user,
    cartCount,
    favorites,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    navigate,
    partnerConfig
  } = useStore();

  if (!isMobileMenuOpen) return null;

  const handleNav = (route: string) => {
    setIsMobileMenuOpen(false);
    navigate(route);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        onClick={() => setIsMobileMenuOpen(false)}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-out Panel */}
      <div className={`relative w-80 max-w-[85vw] h-full bg-[#12131a] border-x border-[#2c2e3d] flex flex-col justify-between p-6 z-10 shadow-2xl overflow-y-auto ${
        lang === 'ar' ? 'mr-auto' : 'ml-auto'
      }`}>
        
        {/* Header */}
        <div>
          <div className="flex items-center justify-between pb-5 border-b border-[#2c2e3d]">
            <div className="flex items-center gap-2">
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

            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 rounded-xl bg-[#1b1c26] text-[#a4a7b5] hover:text-[#f3f3f3] hover:bg-[#232430] border border-[#2c2e3d]"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Quick Info */}
          {user ? (
            <div className="mt-4 p-3 rounded-xl bg-[#1b1c26] border border-[#2c2e3d] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#b9ff66] text-[#191a23] font-black text-xs flex items-center justify-center">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#f3f3f3]">{user.name}</div>
                  <div className="text-[10px] text-[#b9ff66] font-semibold">${user.walletBalance.toFixed(2)}</div>
                </div>
              </div>
              <button
                onClick={() => handleNav('#/account')}
                className="text-[10px] font-bold text-[#a4a7b5] hover:text-[#b9ff66] bg-[#12131a] px-2 py-1 rounded-md border border-[#2c2e3d]"
              >
                {lang === 'ar' ? 'حسابي' : 'Account'}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <button
                onClick={() => handleNav('#/login')}
                className="w-full py-2.5 rounded-xl bg-[#b9ff66] text-[#191a23] font-black text-xs flex items-center justify-center gap-2 shadow-sm"
              >
                <User className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تسجيل الدخول / حساب جديد' : 'Sign In / Register'}</span>
              </button>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="mt-6 space-y-1">
            <button
              onClick={() => handleNav('#/')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Home className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'الرئيسية' : 'Home'}</span>
            </button>

            <button
              onClick={() => handleNav('#/c/bots')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Bot className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'روبوتات وخوارزميات MT5' : 'Trading Bots & Algos'}</span>
            </button>

            <button
              onClick={() => handleNav('#/boost')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <TrendingUp className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'زيادة متابعين ورشق' : 'Followers & Boost'}</span>
            </button>

            <button
              onClick={() => handleNav('#/g/games')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Gamepad2 className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'شحن الألعاب وشدات ببجي' : 'Game Top-up (PUBG UC)'}</span>
            </button>

            <button
              onClick={() => handleNav('#/g/apps')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Coins className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'تطبيقات واشتراكات الذكاء الاصطناعي' : 'Apps & AI Subscriptions'}</span>
            </button>

            <button
              onClick={() => handleNav('#/c/numbers')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Smartphone className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'أرقام للتفعيل' : 'Virtual Numbers'}</span>
            </button>

            <button
              onClick={() => handleNav('#/c/funded')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Globe className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'شراء حسابات ممولة' : 'Funded Accounts'}</span>
            </button>

            <button
              onClick={() => handleNav('#/c/bonus')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] hover:text-[#b9ff66] transition-colors"
            >
              <Gift className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'البونصات المجانية' : 'Free Bonuses'}</span>
            </button>

            <div className="my-2 border-t border-[#2c2e3d]" />

            <button
              onClick={() => handleNav('#/orders')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-[#a4a7b5]" />
                <span>{lang === 'ar' ? 'طلباتي والتتبع' : 'My Orders'}</span>
              </div>
            </button>

            <button
              onClick={() => handleNav('#/cart')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-4 h-4 text-[#a4a7b5]" />
                <span>{lang === 'ar' ? 'السلة' : 'Cart'}</span>
              </div>
              {cartCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#b9ff66] text-[#191a23]">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNav('#/fav')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Heart className="w-4 h-4 text-[#a4a7b5]" />
                <span>{lang === 'ar' ? 'المفضلة' : 'Favorites'}</span>
              </div>
              {favorites.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#f87171] text-white">
                  {favorites.length}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNav('#/support')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-[#a4a7b5]" />
              <span>{lang === 'ar' ? 'الدعم والمساعدة' : 'Support Tickets'}</span>
            </button>

            <button
              onClick={() => handleNav('#/faq')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] transition-colors"
            >
              <FileText className="w-4 h-4 text-[#a4a7b5]" />
              <span>{lang === 'ar' ? 'الأسئلة الشائعة' : 'FAQ'}</span>
            </button>

            <button
              onClick={() => handleNav('#/policies')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#f3f3f3] hover:bg-[#1b1c26] transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-[#a4a7b5]" />
              <span>{lang === 'ar' ? 'السياسات والشروط' : 'Policies'}</span>
            </button>
          </nav>
        </div>

        {/* Footer Settings Controls */}
        <div className="pt-4 border-t border-[#2c2e3d]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                className={`p-2 rounded-lg border border-[#2c2e3d] ${soundOn ? 'bg-[#b9ff66]/10 text-[#b9ff66]' : 'bg-[#1b1c26] text-[#a4a7b5]'}`}
                title="Sound"
              >
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleMusic}
                className={`p-2 rounded-lg border border-[#2c2e3d] ${musicOn ? 'bg-[#b9ff66]/10 text-[#b9ff66]' : 'bg-[#1b1c26] text-[#a4a7b5]'}`}
                title="Music"
              >
                <Music className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1 text-xs font-bold">
              <button
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1b1c26] border border-[#2c2e3d] text-[#f3f3f3]"
              >
                {lang === 'ar' ? 'English' : 'عربي'}
              </button>
              <button
                onClick={() => setCurrency(currency === 'USD' ? 'SYP' : 'USD')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1b1c26] border border-[#2c2e3d] text-[#b9ff66]"
              >
                {currency}
              </button>
            </div>
          </div>

          <div className="text-[10px] text-center text-[#5b5e6e]">
            AMARIX007 v2.0 • Digital Assets Store
          </div>
        </div>

      </div>
    </div>
  );
};
