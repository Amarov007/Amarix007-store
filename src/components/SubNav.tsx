import React from 'react';
import { useStore } from '../context/StoreContext';
import {
  Sparkles,
  Bot,
  TrendingUp,
  Gamepad2,
  Smartphone,
  Globe,
  Coins,
  ShieldCheck,
  Gift,
  Layers
} from 'lucide-react';

export const SubNav: React.FC = () => {
  const { lang, categories, currentRoute, navigate } = useStore();

  const getCategoryIcon = (iconKey: string, categoryId: string) => {
    switch (categoryId) {
      case 'bots': return <Bot className="w-4 h-4" />;
      case 'boost': return <TrendingUp className="w-4 h-4" />;
      case 'games': return <Gamepad2 className="w-4 h-4" />;
      case 'apps_hub': return <Coins className="w-4 h-4" />;
      case 'websites': return <Globe className="w-4 h-4" />;
      case 'apps': return <Smartphone className="w-4 h-4" />;
      case 'numbers': return <ShieldCheck className="w-4 h-4" />;
      case 'funded': return <Coins className="w-4 h-4" />;
      case 'bonus': return <Gift className="w-4 h-4" />;
      default: return <Layers className="w-4 h-4" />;
    }
  };

  const isActive = (catId?: string) => {
    if (!catId) {
      return currentRoute === '#/' || currentRoute === '';
    }
    if (catId === 'games') return currentRoute.startsWith('#/g/games');
    if (catId === 'apps_hub') return currentRoute.startsWith('#/g/apps');
    if (catId === 'boost') return currentRoute === '#/boost';
    return currentRoute === `#/c/${catId}`;
  };

  const handleNav = (catId?: string) => {
    if (!catId) {
      navigate('#/');
    } else if (catId === 'games') {
      navigate('#/g/games');
    } else if (catId === 'apps_hub') {
      navigate('#/g/apps');
    } else if (catId === 'boost') {
      navigate('#/boost');
    } else {
      navigate(`#/c/${catId}`);
    }
  };

  return (
    <div className="w-full bg-[#12131a] border-b border-[#2c2e3d]/80 py-2.5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          
          {/* All Items Button */}
          <button
            onClick={() => handleNav()}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              isActive()
                ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66] shadow-sm shadow-[#b9ff66]/20'
                : 'bg-[#1b1c26] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3] hover:border-[#b9ff66]/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'الكل' : 'All Catalog'}</span>
          </button>

          {/* Category Tabs */}
          {categories.map((cat) => {
            const active = isActive(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => handleNav(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                  active
                    ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66] shadow-sm shadow-[#b9ff66]/20'
                    : 'bg-[#1b1c26] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3] hover:border-[#b9ff66]/50'
                }`}
              >
                <span className={active ? 'text-[#191a23]' : 'text-[#b9ff66]'}>
                  {getCategoryIcon(cat.i, cat.id)}
                </span>
                <span>{lang === 'ar' ? cat.ar : cat.en}</span>
              </button>
            );
          })}

        </div>
      </div>
    </div>
  );
};
