import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { TrendingUp, Zap, ShoppingCart } from 'lucide-react';

export const BoostPage: React.FC = () => {
  const { lang, formatPrice, addToCart, navigate, showToast } = useStore();

  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'telegram' | 'youtube' | 'x'>('instagram');
  const [serviceType, setServiceType] = useState<'followers' | 'likes' | 'views'>('followers');
  const [quantity, setQuantity] = useState<number>(1000);
  const [targetLink, setTargetLink] = useState<string>('');

  // Service pricing map per 1,000 units
  const ratesPer1k: Record<string, Record<string, number>> = {
    instagram: { followers: 4.5, likes: 2.2, views: 0.9 },
    tiktok: { followers: 5.5, likes: 2.8, views: 0.8 },
    telegram: { followers: 5.0, likes: 2.5, views: 0.6 },
    youtube: { followers: 36.0, likes: 9.0, views: 3.5 },
    x: { followers: 12.0, likes: 6.0, views: 1.5 }
  };

  const currentRate = ratesPer1k[platform]?.[serviceType] || 4.5;
  const totalPriceUsd = (quantity / 1000) * currentRate;

  const platforms = [
    { id: 'instagram', name: 'Instagram', color: '#E1306C' },
    { id: 'tiktok', name: 'TikTok', color: '#EE1D52' },
    { id: 'telegram', name: 'Telegram', color: '#229ED9' },
    { id: 'youtube', name: 'YouTube', color: '#FF0000' },
    { id: 'x', name: 'X / Twitter', color: '#F3F3F3' }
  ];

  const presetQuantities = [500, 1000, 2500, 5000, 10000];

  const handleOrderBoost = (directCheckout = false) => {
    if (!targetLink.trim()) {
      showToast(lang === 'ar' ? 'يرجى إدخال رابط الحساب أو المنشور أو اسم المستخدم (@username)' : 'Please enter your account link or @username', 'wn');
      return;
    }

    const platformName = platforms.find(p => p.id === platform)?.name || platform;
    const serviceName = serviceType === 'followers'
      ? (lang === 'ar' ? 'متابعين' : 'Followers')
      : serviceType === 'likes'
      ? (lang === 'ar' ? 'لايكات' : 'Likes')
      : (lang === 'ar' ? 'مشاهدات' : 'Views');

    const boostProduct = {
      id: `boost_${platform}_${serviceType}_${quantity}`,
      c: 'boost',
      ar: `زيادة ${quantity.toLocaleString()} ${serviceName} ${platformName} (جودة عالية)`,
      en: `${platformName} ${quantity.toLocaleString()} ${serviceName} (High Retention)`,
      p: totalPriceUsd,
      r: 4.95,
      n: 312,
      tg: `${platformName} ${serviceName}`,
      sp: `${platformName} · ${quantity.toLocaleString()}`,
      smm_provider: 'main',
      smm_service: 101,
      smm_qty: quantity,
      smm_input: 'link',
      ptype: 'smm' as const
    };

    addToCart(boostProduct, 1, targetLink);

    if (directCheckout) {
      navigate('#/cart');
    }
  };

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      
      {/* Page Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#b9ff66]/15 border border-[#b9ff66]/30 text-[#b9ff66] text-xs font-black uppercase tracking-wider">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'بوابة الرشق وخدمات التفاعل الفورية' : 'SOCIAL MEDIA BOOST PORTAL'}</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif]">
          {lang === 'ar' ? 'حاسبة زيادة المتابعين والتفاعل الحقيقي' : 'Followers & Engagement Calculator'}
        </h1>
        <p className="text-xs sm:text-sm text-[#a4a7b5] max-w-xl mx-auto">
          {lang === 'ar'
            ? 'اختر المنصة ونوع الخدمة والكمية المطلوبة. تسليم فوري وتلقائي مع ضمان عدم النقص والتعويض لمدة 30 يوماً.'
            : 'Select platform, service and quantity. Instant delivery with non-drop guarantee and 30 days refill.'}
        </p>
      </div>

      {/* Main Interactive Calculator Form */}
      <div className="p-6 sm:p-10 rounded-3xl bg-[#1b1c26] border border-[#2c2e3d] shadow-2xl space-y-8">
        
        {/* Step 1: Platform Selection */}
        <div>
          <label className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider block mb-3">
            1. {lang === 'ar' ? 'اختر المنصة:' : 'Choose Platform:'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {platforms.map(p => {
              const active = platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id as typeof platform)}
                  className={`p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border ${
                    active
                      ? 'bg-[#12131a] border-[#b9ff66] text-[#b9ff66] shadow-md shadow-[#b9ff66]/10 scale-102'
                      : 'bg-[#12131a]/60 border-[#2c2e3d] text-[#a4a7b5] hover:text-[#f3f3f3] hover:border-[#b9ff66]/40'
                  }`}
                >
                  <span className="text-xs font-bold">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Service Type Selection */}
        <div>
          <label className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider block mb-3">
            2. {lang === 'ar' ? 'نوع الخدمة:' : 'Service Type:'}
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => setServiceType('followers')}
              className={`p-3.5 rounded-2xl text-xs font-bold transition-all border ${
                serviceType === 'followers'
                  ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66]'
                  : 'bg-[#12131a] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3]'
              }`}
            >
              {lang === 'ar' ? 'متابعين (Followers)' : 'Followers'}
            </button>
            <button
              onClick={() => setServiceType('likes')}
              className={`p-3.5 rounded-2xl text-xs font-bold transition-all border ${
                serviceType === 'likes'
                  ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66]'
                  : 'bg-[#12131a] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3]'
              }`}
            >
              {lang === 'ar' ? 'لايكات (Likes)' : 'Likes'}
            </button>
            <button
              onClick={() => setServiceType('views')}
              className={`p-3.5 rounded-2xl text-xs font-bold transition-all border ${
                serviceType === 'views'
                  ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66]'
                  : 'bg-[#12131a] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3]'
              }`}
            >
              {lang === 'ar' ? 'مشاهدات (Views)' : 'Views'}
            </button>
          </div>
        </div>

        {/* Step 3: Quantity Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider">
              3. {lang === 'ar' ? 'الكمية المطلوبة:' : 'Quantity:'}
            </label>
            <span className="text-xs font-black text-[#b9ff66]">
              {quantity.toLocaleString()} {lang === 'ar' ? 'وحدة' : 'units'}
            </span>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-3">
            {presetQuantities.map(q => (
              <button
                key={q}
                onClick={() => setQuantity(q)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  quantity === q
                    ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66]'
                    : 'bg-[#12131a] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3]'
                }`}
              >
                {q.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Custom Slider / Input */}
          <input
            type="range"
            min={100}
            max={20000}
            step={100}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full accent-[#b9ff66] bg-[#12131a] h-2 rounded-lg cursor-pointer"
          />
        </div>

        {/* Step 4: Account Link or Username */}
        <div>
          <label className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider block mb-2">
            4. {lang === 'ar' ? 'رابط الحساب أو اسم المستخدم (@username):' : 'Profile Link or @username:'}
          </label>
          <input
            type="text"
            placeholder={lang === 'ar' ? 'https://instagram.com/amarix007 أو @username' : 'https://instagram.com/user or @username'}
            value={targetLink}
            onChange={(e) => setTargetLink(e.target.value)}
            className="w-full h-12 px-4 bg-[#12131a] border border-[#2c2e3d] focus:border-[#b9ff66] rounded-xl text-xs sm:text-sm text-[#f3f3f3] placeholder-[#5b5e6e] focus:outline-none"
          />
          <p className="text-[11px] text-[#a4a7b5] mt-1.5">
            🔒 {lang === 'ar' ? 'لا نطلب كلمة المرور مطلقاً. يجب أن يكون الحساب عاماً وليس خاصاً أثناء التنفيذ.' : 'No password required. Keep profile public during delivery.'}
          </p>
        </div>

        {/* Summary & Order Bar */}
        <div className="p-6 rounded-2xl bg-[#12131a] border border-[#2c2e3d] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-xs text-[#a4a7b5] block">
              {lang === 'ar' ? 'السعر الإجمالي المحسوب' : 'Total Calculated Price'}
            </span>
            <div className="text-2xl sm:text-3xl font-black text-[#b9ff66] font-['Urbanist',sans-serif]">
              {formatPrice(totalPriceUsd)}
            </div>
            <span className="text-[11px] text-[#a4a7b5]">
              {lang === 'ar' ? `معدل: $${currentRate} لكل 1,000 وحدة` : `Rate: $${currentRate} per 1,000 units`}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => handleOrderBoost(false)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-xs font-bold bg-[#1b1c26] hover:bg-[#232430] text-[#f3f3f3] border border-[#2c2e3d] transition-all"
            >
              <ShoppingCart className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'أضف للسلة' : 'Add to Cart'}</span>
            </button>

            <button
              onClick={() => handleOrderBoost(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-xs font-black bg-[#b9ff66] hover:bg-[#cdff8f] text-[#191a23] transition-all shadow-lg shadow-[#b9ff66]/20"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{lang === 'ar' ? 'شراء فوري' : 'Buy Now'}</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
