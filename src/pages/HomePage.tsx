import React from 'react';
import { useStore } from '../context/StoreContext';
import { BannersCarousel } from '../components/BannersCarousel';
import { ProductCard } from '../components/ProductCard';
import {
  ShieldCheck,
  Zap,
  Headphones,
  Award,
  ArrowRight,
  ArrowLeft,
  Bot,
  TrendingUp,
  Gamepad2,
  Gift
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { lang, products, categories, navigate } = useStore();

  const bestSellers = products.filter(p => p.bs && p.bs > 0).slice(0, 6);
  const tradingBots = products.filter(p => p.c === 'bots').slice(0, 4);
  const boostServices = products.filter(p => p.c === 'boost').slice(0, 4);
  const gameTopups = products.filter(p => p.c === 'games').slice(0, 4);
  const freeBonuses = products.filter(p => p.c === 'bonus');

  return (
    <div className="space-y-12">
      
      {/* Hero Banner Carousel */}
      <BannersCarousel />

      {/* Trust & Guarantee Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#b9ff66]/10 text-[#b9ff66] flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'تسليم فوري آلي' : 'Instant Delivery'}
            </div>
            <div className="text-[11px] text-[#a4a7b5]">
              {lang === 'ar' ? 'أكواد وشدات خلال دقائق' : 'Codes within minutes'}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#b9ff66]/10 text-[#b9ff66] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'دفع يدوي آمن 100%' : '100% Safe Payments'}
            </div>
            <div className="text-[11px] text-[#a4a7b5]">
              {lang === 'ar' ? 'USDT وسيرياتيل كاش' : 'USDT & Local Wallets'}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#b9ff66]/10 text-[#b9ff66] flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'ضمان جودة الأصول' : 'Verified Quality'}
            </div>
            <div className="text-[11px] text-[#a4a7b5]">
              {lang === 'ar' ? 'روبوتات مختبرة وخوارزميات' : 'Tested EAs & SMM boost'}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#b9ff66]/10 text-[#b9ff66] flex items-center justify-center shrink-0">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'دعم فني متواصل' : '24/7 Live Support'}
            </div>
            <div className="text-[11px] text-[#a4a7b5]">
              {lang === 'ar' ? 'مساعد ذكي + تليجرام' : 'AI Assistant + Telegram'}
            </div>
          </div>
        </div>
      </div>

      {/* Best Sellers Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-6 rounded-full bg-[#b9ff66]" />
              <h2 className="text-xl sm:text-2xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif]">
                {lang === 'ar' ? 'الأكثر طلباً ومبيعاً' : 'Best Sellers & Top Picks'}
              </h2>
            </div>
            <p className="text-xs text-[#a4a7b5] mt-1 mr-4">
              {lang === 'ar' ? 'الأصول والخدمات الأكثر طلباً من مجتمع المتداولين والعملاء' : 'Most popular products chosen by our customers'}
            </p>
          </div>
          <button
            onClick={() => navigate('#/c/bots')}
            className="text-xs font-bold text-[#b9ff66] hover:text-[#cdff8f] flex items-center gap-1"
          >
            <span>{lang === 'ar' ? 'عرض الكل' : 'View all'}</span>
            {lang === 'ar' ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Trading Bots Showcase */}
      <section className="p-6 sm:p-8 rounded-3xl bg-[#1b1c26]/60 border border-[#2c2e3d]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#12131a] text-[#b9ff66] flex items-center justify-center border border-[#2c2e3d]">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#f3f3f3]">
                {lang === 'ar' ? 'روبوتات وخوارزميات MT5' : 'MT5 Trading Bots & EAs'}
              </h2>
              <span className="text-xs text-[#a4a7b5]">
                {lang === 'ar' ? 'خوارزميات التداول اليومي والسكالبينغ المتوافقة مع شركات التمويل' : 'Prop firm compliant automated trading algorithms'}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('#/c/bots')}
            className="text-xs font-bold text-[#b9ff66] hover:underline"
          >
            {lang === 'ar' ? 'المزيد ←' : 'Explore all →'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tradingBots.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Social Boost Calculator Banner */}
      <section className="relative rounded-3xl bg-gradient-to-r from-[#17201c] via-[#1b1c26] to-[#12131a] border border-[#2c2e3d] p-6 sm:p-10 overflow-hidden shadow-2xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#b9ff66]/15 text-[#b9ff66] text-xs font-bold mb-3 border border-[#b9ff66]/30">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'حاسبة الرشق الذكية' : 'Instant SMM Calculator'}</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif] leading-tight mb-2">
              {lang === 'ar' ? 'ارفع تفاعل حساباتك بأمان تام' : 'Scale Your Social Channels Fast'}
            </h3>
            <p className="text-xs sm:text-sm text-[#a4a7b5] leading-relaxed mb-6">
              {lang === 'ar'
                ? 'متابعين ولايكات ومشاهدات لإنستغرام، تيك توك، تليجرام، ويوتيوب. اختر الكمية ورابط حسابك وسيبدأ التنفيذ فورياً بضمان تعويض 30 يوماً.'
                : 'Real retention followers and engagement for Instagram, TikTok and Telegram with 30-day auto refill.'}
            </p>
            <button
              onClick={() => navigate('#/boost')}
              className="px-6 py-3 rounded-xl bg-[#b9ff66] hover:bg-[#cdff8f] text-[#191a23] font-black text-xs sm:text-sm transition-all shadow-lg shadow-[#b9ff66]/20"
            >
              {lang === 'ar' ? 'فتح حاسبة الرشق المباشرة' : 'Launch Boost Calculator'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full md:w-auto shrink-0">
            {boostServices.slice(0, 2).map(product => (
              <div key={product.id} className="w-full sm:w-64">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Game Top-Up Showcase */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1b1c26] text-[#b9ff66] flex items-center justify-center border border-[#2c2e3d]">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#f3f3f3]">
                {lang === 'ar' ? 'شحن الألعاب وشدات ببجي' : 'Game Top-up Hub'}
              </h2>
              <span className="text-xs text-[#a4a7b5]">
                {lang === 'ar' ? 'شحن مباشر بمعرف اللاعب ID بدون تسجيل دخول' : 'Instant top-up via Player ID with zero login required'}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('#/g/games')}
            className="text-xs font-bold text-[#b9ff66] hover:underline"
          >
            {lang === 'ar' ? 'عرض باقات الألعاب ←' : 'View all games →'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {gameTopups.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Free Bonuses Section */}
      {freeBonuses.length > 0 && (
        <section className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#191a23] via-[#1e231e] to-[#12131a] border border-[#b9ff66]/30 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#b9ff66] text-[#191a23] flex items-center justify-center font-black">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-[#f3f3f3]">
                  {lang === 'ar' ? 'البونصات المجانية والهدايا الحصرية' : 'Free Bonuses & Welcome Gifts'}
                </h2>
                <span className="text-xs text-[#b9ff66]">
                  {lang === 'ar' ? 'بونص بدون إيداع وسحب كامل الأرباح للمتداولين' : 'No-deposit trading bonuses with full profit withdrawal'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {freeBonuses.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
};
