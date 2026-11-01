import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
  Search,
  ShoppingCart,
  Heart,
  User as UserIcon,
  Menu,
  X,
  Volume2,
  VolumeX,
  Music,
  Moon,
  Sun,
  Globe,
  Wallet
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    lang,
    setLang,
    theme,
    toggleTheme,
    currency,
    setCurrency,
    soundOn,
    toggleSound,
    musicOn,
    toggleMusic,
    cartCount,
    favorites,
    user,
    navigate,
    currentRoute,
    products,
    setIsMobileMenuOpen
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const searchResults = searchQuery.trim().length > 1
    ? products.filter(p =>
        p.ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.tg && p.tg.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 6)
    : [];

  const handleSelectSearch = (productId: string) => {
    setSearchQuery('');
    setIsSearchOpen(false);
    navigate(`#/p/${productId}`);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#12131a]/95 backdrop-blur-md border-b border-[#2c2e3d]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
          
          {/* Right/Left: Mobile Menu & Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-[#1b1c26] text-[#b9ff66] hover:bg-[#232430] lg:hidden transition-colors border border-[#2c2e3d]"
              aria-label="القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo */}
            <a
              href="#/"
              onClick={(e) => { e.preventDefault(); navigate('#/'); }}
              className="flex items-center gap-2.5 group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#191a23] border border-[#b9ff66]/30 flex items-center justify-center shadow-lg shadow-[#b9ff66]/10 group-hover:scale-105 transition-transform">
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 25.5L14 7L16.5 12" stroke="#B9FF66" strokeWidth="2.75" />
                  <path d="M10 18.5H19" stroke="#F3F3F3" strokeWidth="2.25" />
                  <path d="M16.5 12L20.5 18L26 8" stroke="#B9FF66" strokeWidth="2.75" />
                  <circle cx="26" cy="8" r="1.75" fill="#B9FF66" />
                </svg>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1 text-xl font-black tracking-tight text-[#f3f3f3] font-['Urbanist',sans-serif]">
                  <span>AMARIX</span>
                  <span className="text-[#b9ff66]">007</span>
                </div>
                <span className="text-[10px] text-[#a4a7b5] font-medium hidden sm:inline -mt-1">
                  {lang === 'ar' ? 'متجر الأصول الرقمية' : 'Digital Assets Store'}
                </span>
              </div>
            </a>
          </div>

          {/* Center: Search Bar with Autocomplete */}
          <div className="flex-1 max-w-lg mx-2 sm:mx-6 relative hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder={lang === 'ar' ? 'ابحث عن روبوت، رشق، شدات، أرقام تفعيل...' : 'Search bots, boost, game top-up, numbers...'}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                className="w-full h-11 pl-10 pr-11 bg-[#1b1c26] border border-[#2c2e3d] focus:border-[#b9ff66] focus:outline-none rounded-xl text-sm text-[#f3f3f3] placeholder-[#a4a7b5] transition-all"
              />
              <Search className={`w-4 h-4 text-[#a4a7b5] absolute top-3.5 ${lang === 'ar' ? 'right-3.5' : 'left-3.5'}`} />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute top-3 ${lang === 'ar' ? 'left-3' : 'right-3'} text-[#a4a7b5] hover:text-[#f3f3f3]`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-13 left-0 right-0 bg-[#1b1c26] border border-[#2c2e3d] rounded-2xl shadow-2xl p-2 z-50 max-h-80 overflow-y-auto">
                <div className="text-xs font-semibold text-[#a4a7b5] px-3 py-1.5 border-b border-[#2c2e3d]">
                  {lang === 'ar' ? 'النتائج المقترحة' : 'Suggested Results'}
                </div>
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectSearch(p.id)}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-[#232430] rounded-xl text-start transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#12131a] flex items-center justify-center text-[#b9ff66] text-xs font-bold border border-[#2c2e3d]">
                        {p.c.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#f3f3f3] group-hover:text-[#b9ff66] transition-colors line-clamp-1">
                          {lang === 'ar' ? p.ar : p.en}
                        </div>
                        <div className="text-xs text-[#a4a7b5]">
                          {p.sp || p.tg}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[#b9ff66] ml-2 shrink-0">
                      ${p.p}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Left/Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Currency Switcher */}
            <div className="flex bg-[#1b1c26] rounded-xl p-0.5 border border-[#2c2e3d] text-xs font-bold">
              <button
                onClick={() => setCurrency('USD')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  currency === 'USD'
                    ? 'bg-[#b9ff66] text-[#191a23] shadow-sm'
                    : 'text-[#a4a7b5] hover:text-[#f3f3f3]'
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency('SYP')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  currency === 'SYP'
                    ? 'bg-[#b9ff66] text-[#191a23] shadow-sm'
                    : 'text-[#a4a7b5] hover:text-[#f3f3f3]'
                }`}
              >
                SYP
              </button>
            </div>

            {/* Language Switcher */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="h-10 px-2.5 flex items-center gap-1 bg-[#1b1c26] text-[#f3f3f3] hover:border-[#b9ff66] border border-[#2c2e3d] rounded-xl text-xs font-bold transition-all"
              title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              <Globe className="w-3.5 h-3.5 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </button>

            {/* Audio & Music Toggles (Desktop) */}
            <div className="hidden lg:flex items-center gap-1 bg-[#1b1c26] border border-[#2c2e3d] rounded-xl p-0.5">
              <button
                onClick={toggleSound}
                className={`p-2 rounded-lg transition-colors ${soundOn ? 'text-[#b9ff66]' : 'text-[#a4a7b5] hover:text-[#f3f3f3]'}`}
                title={soundOn ? (lang === 'ar' ? 'كتم الصوت' : 'Mute sound') : (lang === 'ar' ? 'تشغيل الصوت' : 'Unmute sound')}
              >
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleMusic}
                className={`p-2 rounded-lg transition-colors ${musicOn ? 'text-[#b9ff66] animate-pulse' : 'text-[#a4a7b5] hover:text-[#f3f3f3]'}`}
                title={musicOn ? (lang === 'ar' ? 'إيقاف الموسيقى' : 'Stop music') : (lang === 'ar' ? 'تشغيل الموسيقى' : 'Play music')}
              >
                <Music className="w-4 h-4" />
              </button>
            </div>

            {/* Favorites Icon */}
            <button
              onClick={() => navigate('#/fav')}
              className="relative p-2.5 bg-[#1b1c26] text-[#f3f3f3] hover:border-[#b9ff66] border border-[#2c2e3d] rounded-xl transition-all"
              title={lang === 'ar' ? 'المفضلة' : 'Favorites'}
            >
              <Heart className={`w-4 h-4 ${favorites.length > 0 ? 'text-[#f87171] fill-[#f87171]' : 'text-[#a4a7b5]'}`} />
              {favorites.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#f87171] text-white text-[10px] font-bold flex items-center justify-center">
                  {favorites.length}
                </span>
              )}
            </button>

            {/* Cart Icon */}
            <button
              onClick={() => navigate('#/cart')}
              className={`relative p-2.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                currentRoute === '#/cart'
                  ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66]'
                  : 'bg-[#1b1c26] text-[#f3f3f3] border-[#2c2e3d] hover:border-[#b9ff66]'
              }`}
              title={lang === 'ar' ? 'السلة' : 'Shopping Cart'}
            >
              <ShoppingCart className="w-4 h-4" />
              {cartCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  currentRoute === '#/cart' ? 'bg-[#191a23] text-[#b9ff66]' : 'bg-[#b9ff66] text-[#191a23]'
                }`}>
                  {cartCount}
                </span>
              )}
            </button>

            {/* User Account / Login */}
            {user ? (
              <button
                onClick={() => navigate('#/account')}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-2 bg-[#1b1c26] hover:bg-[#232430] border border-[#2c2e3d] rounded-xl transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-[#b9ff66] text-[#191a23] font-black text-xs flex items-center justify-center">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col text-start">
                  <span className="text-xs font-bold text-[#f3f3f3] leading-none truncate max-w-[90px]">
                    {user.name}
                  </span>
                  <span className="text-[10px] font-semibold text-[#b9ff66] leading-none mt-1">
                    ${user.walletBalance.toFixed(2)}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => navigate('#/login')}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#b9ff66] text-[#191a23] hover:bg-[#cdff8f] rounded-xl font-bold text-xs transition-all shadow-sm"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'دخول' : 'Login'}</span>
              </button>
            )}

          </div>
        </div>

        {/* Mobile Search Bar Row */}
        <div className="pb-3 md:hidden">
          <div className="relative">
            <input
              type="text"
              placeholder={lang === 'ar' ? 'ابحث في المتجر...' : 'Search products...'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="w-full h-10 pl-9 pr-10 bg-[#1b1c26] border border-[#2c2e3d] rounded-xl text-xs text-[#f3f3f3] placeholder-[#a4a7b5]"
            />
            <Search className={`w-3.5 h-3.5 text-[#a4a7b5] absolute top-3.5 ${lang === 'ar' ? 'right-3.5' : 'left-3.5'}`} />
          </div>
          {isSearchOpen && searchResults.length > 0 && (
            <div className="mt-2 bg-[#1b1c26] border border-[#2c2e3d] rounded-xl p-2 max-h-60 overflow-y-auto">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectSearch(p.id)}
                  className="w-full flex items-center justify-between p-2 hover:bg-[#232430] rounded-lg text-start"
                >
                  <span className="text-xs font-medium text-[#f3f3f3] truncate">{lang === 'ar' ? p.ar : p.en}</span>
                  <span className="text-xs font-bold text-[#b9ff66]">${p.p}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
