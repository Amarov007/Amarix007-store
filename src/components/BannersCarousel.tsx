import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { Sparkles, ArrowRight, ArrowLeft, ShieldCheck, Zap, Bot } from 'lucide-react';

export const BannersCarousel: React.FC = () => {
  const { lang, navigate, partnerConfig } = useStore();
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      title_ar: "عروض التوفير الكبرى من AMARIX007",
      title_en: "AMARIX007 Season Pro Deals & Drops",
      subtitle_ar: "خصومات حقيقية تصل إلى 50% على روبوتات MT5 وشحن الألعاب وحزم الرشق",
      subtitle_en: "Up to 50% discount on automated trading bots, game top-ups & engagement boost",
      tag_ar: "خصومات حصرية 2026",
      tag_en: "Exclusive 2026 Deals",
      cta_ar: "تصفح العروض",
      cta_en: "Explore Offers",
      href: "#/c/bots",
      bgClass: "from-[#191A23] via-[#1B1C26] to-[#12131A]",
      badge: "MT5 & SMM Specialist",
      icon: <Bot className="w-8 h-8 text-[#b9ff66]" />
    },
    {
      title_ar: "خدمات الرشق والمتابعين الحقيقية مع ضمان التعويض",
      title_en: "Guaranteed High-Retention Social Boost",
      subtitle_ar: "زيادة فورية لمتابعي إنستغرام، تيك توك، تليجرام، ويوتيوب بأعلى سرعة",
      subtitle_en: "Instant delivery followers, views and likes for Instagram, TikTok and Telegram",
      tag_ar: "تسليم فوري وآمن",
      tag_en: "Instant & Safe",
      cta_ar: "حاسبة الرشق",
      cta_en: "Boost Calculator",
      href: "#/boost",
      bgClass: "from-[#17201c] via-[#1b1c26] to-[#12131A]",
      badge: "Real Retention SMM",
      icon: <Zap className="w-8 h-8 text-[#b9ff66]" />
    },
    {
      title_ar: partnerConfig.ar,
      title_en: partnerConfig.en,
      subtitle_ar: "اربح عمولات فورية وأنشئ منصتك مع شريكنا الرسمي Utoppick",
      subtitle_en: "Earn high commissions and launch your brand with official partner Utoppick",
      tag_ar: "برنامج الشركاء",
      tag_en: "Official Partner",
      cta_ar: partnerConfig.ba,
      cta_en: partnerConfig.be,
      href: "#/partner",
      bgClass: "from-[#1e1c24] via-[#1b1c26] to-[#12131a]",
      badge: "Partner Program",
      icon: <ShieldCheck className="w-8 h-8 text-[#b9ff66]" />
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const slide = slides[activeSlide];

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-[#2c2e3d] bg-gradient-to-r p-6 sm:p-10 my-4 sm:my-6 shadow-2xl transition-all duration-500">
      
      {/* Background Cyber Accents */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#b9ff66]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#3b82f6]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#b9ff66]/15 border border-[#b9ff66]/30 text-[#b9ff66] text-xs font-black uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? slide.tag_ar : slide.tag_en}</span>
          </div>

          <h2 className="text-xl sm:text-3xl lg:text-4xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif] tracking-tight leading-tight mb-3">
            {lang === 'ar' ? slide.title_ar : slide.title_en}
          </h2>

          <p className="text-sm sm:text-base text-[#a4a7b5] leading-relaxed mb-6">
            {lang === 'ar' ? slide.subtitle_ar : slide.subtitle_en}
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(slide.href)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#b9ff66] hover:bg-[#cdff8f] text-[#191a23] font-black text-sm transition-all shadow-lg shadow-[#b9ff66]/20 hover:scale-105"
            >
              <span>{lang === 'ar' ? slide.cta_ar : slide.cta_en}</span>
              {lang === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
            <span className="text-xs font-semibold text-[#a4a7b5] hidden sm:inline">
              ✓ {slide.badge}
            </span>
          </div>
        </div>

        {/* Big Icon / Visual Display */}
        <div className="hidden md:flex flex-col items-center justify-center p-6 rounded-2xl bg-[#12131a]/80 border border-[#2c2e3d] shadow-inner text-center shrink-0 w-52">
          <div className="w-16 h-16 rounded-2xl bg-[#191a23] border border-[#b9ff66]/30 flex items-center justify-center shadow-lg mb-3">
            {slide.icon}
          </div>
          <span className="text-xs font-black text-[#b9ff66] uppercase tracking-wider font-['Urbanist',sans-serif]">
            AMARIX007 VERIFIED
          </span>
          <span className="text-[11px] text-[#a4a7b5] mt-1">
            {lang === 'ar' ? 'أمان وسرعة فائقة' : 'High Speed & Secure'}
          </span>
        </div>
      </div>

      {/* Dots Navigation */}
      <div className="flex items-center gap-2 mt-6">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setActiveSlide(idx)}
            className={`h-2 rounded-full transition-all ${
              activeSlide === idx ? 'w-8 bg-[#b9ff66]' : 'w-2 bg-[#2c2e3d] hover:bg-[#a4a7b5]'
            }`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
