import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import {
  Gamepad2,
  Coins,
  Search,
  Sparkles,
  Zap,
  Globe2,
  ShieldCheck
} from 'lucide-react';

interface HubPageProps {
  hubId: 'games' | 'apps';
  subId?: string;
}

export const HubPage: React.FC<HubPageProps> = ({ hubId, subId }) => {
  const { lang, products, formatPrice, addToCart, navigate } = useStore();

  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [search, setSearch] = useState('');

  const isGames = hubId === 'games';

  const relevantProducts = products.filter(p => {
    if (isGames) {
      return p.c === 'games' || p.ptype === 'game_topup';
    } else {
      return p.c === 'apps_hub' || p.ptype === 'app_subscription';
    }
  });

  const gameFamilies = isGames ? [
    { id: 'all', name_ar: 'كل الألعاب', name_en: 'All Games' },
    { id: 'pubg', name_ar: 'PUBG Mobile', name_en: 'PUBG Mobile' },
    { id: 'freefire', name_ar: 'Free Fire', name_en: 'Free Fire' },
    { id: 'eafc', name_ar: 'EA FC Mobile', name_en: 'EA FC Mobile' }
  ] : [
    { id: 'all', name_ar: 'كل التطبيقات', name_en: 'All Apps' },
    { id: 'ai', name_ar: 'ذكاء اصطناعي (ChatGPT / Midjourney)', name_en: 'AI (ChatGPT / Midjourney)' },
    { id: 'creative', name_ar: 'تصميم (Canva Pro)', name_en: 'Creative (Canva Pro)' },
    { id: 'live', name_ar: 'بث ودردشة (TikTok)', name_en: 'Live Streaming (TikTok)' }
  ];

  const filtered = relevantProducts.filter(p => {
    const textMatch = search.trim() === '' ||
      p.ar.toLowerCase().includes(search.toLowerCase()) ||
      p.en.toLowerCase().includes(search.toLowerCase());

    if (!textMatch) return false;

    if (selectedGame === 'all') return true;
    if (isGames) {
      if (selectedGame === 'pubg') return p.id.includes('pubg') || p.tg?.includes('PUBG');
      if (selectedGame === 'freefire') return p.id.includes('freefire') || p.tg?.includes('Free Fire');
      if (selectedGame === 'eafc') return p.id.includes('eafc') || p.tg?.includes('EA FC');
    } else {
      if (selectedGame === 'ai') return p.id.includes('chatgpt') || p.tg?.includes('ذكاء');
      if (selectedGame === 'creative') return p.id.includes('canva') || p.tg?.includes('تصميم');
      if (selectedGame === 'live') return p.id.includes('tiktok') || p.tg?.includes('بث');
    }
    return true;
  });

  return (
    <div className="space-y-8">
      
      {/* Hub Hero Header */}
      <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-r from-[#191a23] via-[#1b1c26] to-[#12131a] border border-[#2c2e3d] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#b9ff66]/15 text-[#b9ff66] text-xs font-bold mb-3 border border-[#b9ff66]/30">
            {isGames ? <Gamepad2 className="w-3.5 h-3.5" /> : <Coins className="w-3.5 h-3.5" />}
            <span>{isGames ? (lang === 'ar' ? 'بوابة شحن الألعاب المباشرة' : 'Game Top-up Master Hub') : (lang === 'ar' ? 'بوابة الاشتراكات وتطبيقات البث' : 'Apps & Subscriptions Hub')}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif] tracking-tight">
            {isGames
              ? (lang === 'ar' ? 'شحن الألعاب وشدات ببجي الفورية' : 'Game Credits & PUBG Mobile UC Top-Up')
              : (lang === 'ar' ? 'اشتراكات الذكاء الاصطناعي وتطبيقات البث' : 'AI Subscriptions & Live App Coins')}
          </h1>

          <p className="text-xs sm:text-sm text-[#a4a7b5] mt-2 leading-relaxed">
            {isGames
              ? (lang === 'ar' ? 'اشحن شداتك وجواهرك مباشرة عبر معرّف اللاعب (Player ID) بأرخص الأسعار وتسليم تلقائي خلال 1 إلى 5 دقائق.' : 'Direct top-up via Player ID with instant automatic delivery within 1-5 minutes.')
              : (lang === 'ar' ? 'تفعيل اشتراكات ChatGPT Plus الرسمية، كانفا برو لمدة سنة، وعملات تيك توك للبث المباشر مع ضمان كامل.' : 'Official ChatGPT Plus activations, 1-year Canva Pro licenses, and TikTok live gift coins.')}
          </p>
        </div>

        <div className="flex items-center gap-2 p-4 rounded-2xl bg-[#12131a]/80 border border-[#2c2e3d] shrink-0 text-xs">
          <ShieldCheck className="w-6 h-6 text-[#b9ff66] shrink-0" />
          <div>
            <div className="font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'تسليم فوري ومضمون' : 'Guaranteed Delivery'}
            </div>
            <div className="text-[11px] text-[#a4a7b5]">
              {lang === 'ar' ? 'لا يلزم كلمة المرور' : 'No password required'}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs by Game / App */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        
        {/* Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {gameFamilies.map(fam => {
            const active = selectedGame === fam.id;
            return (
              <button
                key={fam.id}
                onClick={() => setSelectedGame(fam.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                  active
                    ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66] shadow-sm'
                    : 'bg-[#1b1c26] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3] hover:border-[#b9ff66]/40'
                }`}
              >
                {lang === 'ar' ? fam.name_ar : fam.name_en}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder={lang === 'ar' ? 'بحث في الباقات...' : 'Search packages...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-9 bg-[#1b1c26] border border-[#2c2e3d] focus:border-[#b9ff66] rounded-xl text-xs text-[#f3f3f3] placeholder-[#a4a7b5] focus:outline-none"
          />
          <Search className={`w-3.5 h-3.5 text-[#a4a7b5] absolute top-3.5 ${lang === 'ar' ? 'right-3' : 'left-3'}`} />
        </div>

      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

    </div>
  );
};
