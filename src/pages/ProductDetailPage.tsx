import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import {
  ArrowLeft,
  ArrowRight,
  Star,
  ShoppingCart,
  Zap,
  Heart,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Sparkles,
  MessageSquare
} from 'lucide-react';

interface ProductDetailPageProps {
  productId: string;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ productId }) => {
  const {
    lang,
    products,
    formatPrice,
    addToCart,
    isFavorite,
    toggleFavorite,
    navigate,
    showToast
  } = useStore();

  const product = products.find(p => p.id === productId) || products[0];
  const [quantity, setQuantity] = useState(1);
  const [itemLink, setItemLink] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [hasReviewed, setHasReviewed] = useState(false);

  const isFav = isFavorite(product.id);
  const relatedProducts = products
    .filter(p => p.c === product.c && p.id !== product.id)
    .slice(0, 3);

  const isPlayerIdProduct = !!(product.req?.includes('player_id') || product.smm_input === 'player_id' || product.smm_provider === 'toupup' || product.ptype === 'game_topup' || product.c === 'games');
  const needsLink = product.smm_input !== 'none' && (isPlayerIdProduct || product.c === 'boost' || product.ptype === 'smm');

  const handleAddToCart = () => {
    if (needsLink && !itemLink.trim()) {
      showToast(lang === 'ar' ? 'يرجى إدخال رابط الحساب أو معرّف اللاعب (ID)' : 'Please enter your account link or Player ID', 'wn');
      return;
    }
    addToCart(product, quantity, itemLink);
  };

  const handleBuyNow = () => {
    if (needsLink && !itemLink.trim()) {
      showToast(lang === 'ar' ? 'يرجى إدخال رابط الحساب أو معرّف اللاعب (ID)' : 'Please enter your account link or Player ID', 'wn');
      return;
    }
    addToCart(product, quantity, itemLink);
    navigate('#/cart');
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    setHasReviewed(true);
    showToast(lang === 'ar' ? 'شكراً لك! تم إرسال تقييمك بنجاح.' : 'Thank you! Your review was submitted.', 'ok');
  };

  return (
    <div className="space-y-10">
      
      {/* Back Button */}
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-2 text-xs font-bold text-[#a4a7b5] hover:text-[#b9ff66] transition-colors"
      >
        {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        <span>{lang === 'ar' ? 'العودة' : 'Back'}</span>
      </button>

      {/* Main Product Card & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Product Showcase Visual Box */}
        <div className="lg:col-span-5 p-8 rounded-3xl bg-[#1b1c26] border border-[#2c2e3d] flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#b9ff66]/10 rounded-full blur-2xl pointer-events-none" />
          
          {/* Logo Mark or Product Image Graphic */}
          <div className="w-28 h-28 rounded-3xl bg-[#12131a] border border-[#b9ff66]/30 flex items-center justify-center shadow-xl shadow-[#b9ff66]/10 mb-6 group-hover:scale-105 transition-transform overflow-hidden">
            {product.img && /^https:\/\//i.test(product.img) ? (
              <img src={product.img} alt={lang === 'ar' ? product.ar : product.en} className="w-full h-full object-cover" />
            ) : (
              <svg width="60" height="60" viewBox="0 0 32 32" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 25.5L14 7L16.5 12" stroke="#B9FF66" strokeWidth="2.75" />
                <path d="M10 18.5H19" stroke="#F3F3F3" strokeWidth="2.25" />
                <path d="M16.5 12L20.5 18L26 8" stroke="#B9FF66" strokeWidth="2.75" />
                <circle cx="26" cy="8" r="1.75" fill="#B9FF66" />
              </svg>
            )}
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-black bg-[#232430] text-[#b9ff66] border border-[#2c2e3d] mb-2 font-['Urbanist',sans-serif]">
            AMARIX007 VERIFIED ASSET
          </span>
          <h2 className="text-lg font-bold text-[#f3f3f3]">
            {lang === 'ar' ? product.ar : product.en}
          </h2>
          <span className="text-xs text-[#a4a7b5] mt-1">
            {product.sp || product.tg}
          </span>

          {/* Quick Perks */}
          <div className="grid grid-cols-2 gap-2 w-full mt-6 pt-6 border-t border-[#2c2e3d]/80 text-[11px] text-[#a4a7b5]">
            <div className="flex items-center gap-1.5 justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'تسليم إلكتروني فوري' : 'Instant delivery'}</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'ضمان رسمي 100%' : '100% Guaranteed'}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Pricing, Specs, Custom Quantities, Actions */}
        <div className="lg:col-span-7 space-y-6">
          
          <div>
            {/* Badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {product.bs && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#b9ff66] text-[#191a23]">
                  {lang === 'ar' ? 'الأكثر طلباً' : 'Best Seller'}
                </span>
              )}
              {product.d && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/30">
                  -{product.d}% {lang === 'ar' ? 'خصم' : 'OFF'}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#1b1c26] text-[#a4a7b5] border border-[#2c2e3d]">
                ID: {product.id}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif] leading-tight">
              {lang === 'ar' ? product.ar : product.en}
            </h1>

            {/* Rating Stars */}
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center text-[#fbbf24]">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <span className="text-sm font-bold text-[#f3f3f3]">{product.r}</span>
              <span className="text-xs text-[#a4a7b5]">({product.n} {lang === 'ar' ? 'تقييم موثق' : 'verified reviews'})</span>
            </div>
          </div>

          {/* Pricing Box */}
          <div className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] flex items-center justify-between">
            <div>
              <span className="text-xs text-[#a4a7b5] block">
                {lang === 'ar' ? 'السعر النهائي' : 'Final Price'}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl font-black text-[#b9ff66] font-['Urbanist',sans-serif]">
                  {formatPrice(product.p * quantity)}
                </span>
                {product.o && product.o > product.p && (
                  <span className="text-sm text-[#a4a7b5] line-through">
                    {formatPrice(product.o * quantity)}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => toggleFavorite(product.id)}
              className={`p-3 rounded-xl bg-[#12131a] border border-[#2c2e3d] hover:border-[#b9ff66] transition-colors ${
                isFav ? 'text-[#f87171]' : 'text-[#a4a7b5]'
              }`}
              title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            >
              <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Description */}
          <div className="text-xs sm:text-sm text-[#a4a7b5] leading-relaxed space-y-2">
            <p>{lang === 'ar' ? product.description_ar : product.description_en}</p>
            {product.specs && (
              <div className="p-3 rounded-xl bg-[#12131a] border border-[#2c2e3d] text-xs font-mono text-[#b9ff66]">
                {product.specs}
              </div>
            )}
          </div>

          {/* Account Link Input Field (For Boost & Game Top-Up) */}
          {needsLink && (
            <div className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] space-y-2">
              <label className="text-xs font-bold text-[#f3f3f3] flex items-center justify-between">
                <span>
                  {isPlayerIdProduct
                    ? (lang === 'ar' ? 'معرّف اللاعب (Player ID):' : 'Player ID:')
                    : (lang === 'ar' ? 'رابط الحساب أو اسم المستخدم:' : 'Account Link or Username:')}
                </span>
                <span className="text-[10px] text-[#f87171] font-semibold">{lang === 'ar' ? '* مطلوب للتنفيذ' : '* Required'}</span>
              </label>
              <input
                type="text"
                placeholder={
                  isPlayerIdProduct
                    ? (lang === 'ar' ? 'أدخل معرّف اللاعب (Player ID) هنا...' : 'e.g. 512398412')
                    : (lang === 'ar' ? 'https://instagram.com/user أو @username' : 'https://instagram.com/user or @user')
                }
                value={itemLink}
                onChange={(e) => setItemLink(e.target.value)}
                className="w-full h-11 px-3.5 bg-[#12131a] border border-[#2c2e3d] focus:border-[#b9ff66] rounded-xl text-xs text-[#f3f3f3] placeholder-[#5b5e6e] focus:outline-none"
              />
            </div>
          )}

          {/* Quantity Controls */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-[#a4a7b5]">
              {lang === 'ar' ? 'الكمية المطلوبة:' : 'Quantity:'}
            </span>
            <div className="flex items-center bg-[#1b1c26] border border-[#2c2e3d] rounded-xl p-1">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-lg bg-[#12131a] text-[#f3f3f3] hover:text-[#b9ff66] flex items-center justify-center font-bold"
              >
                -
              </button>
              <span className="w-12 text-center text-xs font-black text-[#f3f3f3]">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-lg bg-[#12131a] text-[#f3f3f3] hover:text-[#b9ff66] flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleAddToCart}
              className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-[#1b1c26] hover:bg-[#232430] text-[#f3f3f3] border border-[#2c2e3d] transition-all"
            >
              <ShoppingCart className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'إضافة إلى السلة' : 'Add to Cart'}</span>
            </button>

            <button
              onClick={handleBuyNow}
              className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs sm:text-sm font-black bg-[#b9ff66] hover:bg-[#cdff8f] text-[#191a23] transition-all shadow-lg shadow-[#b9ff66]/20"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{lang === 'ar' ? 'شراء فوري ومتابعة الدفع' : 'Instant Checkout'}</span>
            </button>
          </div>

        </div>

      </div>

      {/* Customer Reviews & Feedback Form */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#1b1c26] border border-[#2c2e3d] space-y-6">
        <div className="flex items-center justify-between border-b border-[#2c2e3d] pb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#b9ff66]" />
            <h3 className="text-base sm:text-lg font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'تقييمات وآراء العملاء الموثقة' : 'Verified Customer Ratings & Reviews'}
            </h3>
          </div>
          <span className="text-xs text-[#a4a7b5]">
            ⭐ {product.r} / 5.0
          </span>
        </div>

        {/* Existing sample feedback */}
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-[#12131a] border border-[#2c2e3d]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#f3f3f3]">محمد خ.</span>
              <div className="flex text-[#fbbf24]">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-current" />
                ))}
              </div>
            </div>
            <p className="text-xs text-[#a4a7b5]">
              {lang === 'ar'
                ? 'خدمة ممتازة وسريعة جداً! تم استلام الطلب وتأكيد الدفع خلال دقائق معدودة والدعم متعاون للغاية.'
                : 'Excellent and super fast delivery! The team verified my payment in minutes and customer support was very helpful.'}
            </p>
          </div>
        </div>

        {/* Submit Review */}
        {!hasReviewed ? (
          <form onSubmit={handleAddReview} className="space-y-3 pt-3 border-t border-[#2c2e3d]">
            <h4 className="text-xs font-bold text-[#f3f3f3]">
              {lang === 'ar' ? 'أضف تقييمك لهذا المنتج:' : 'Submit your rating:'}
            </h4>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setReviewRating(star)}
                  className="p-1 text-[#fbbf24]"
                >
                  <Star className={`w-5 h-5 ${star <= reviewRating ? 'fill-current' : 'opacity-30'}`} />
                </button>
              ))}
            </div>
            <textarea
              placeholder={lang === 'ar' ? 'أضف تعليقك (اختياري)...' : 'Write your comment (optional)...'}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="w-full h-20 p-3 bg-[#12131a] border border-[#2c2e3d] rounded-xl text-xs text-[#f3f3f3] placeholder-[#5b5e6e] focus:outline-none focus:border-[#b9ff66]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#b9ff66] text-[#191a23] font-bold text-xs hover:bg-[#cdff8f] transition-all"
            >
              {lang === 'ar' ? 'إرسال التقييم' : 'Submit Review'}
            </button>
          </form>
        ) : (
          <div className="p-3 rounded-xl bg-[#14231b] text-[#b9ff66] border border-[#22c55e]/30 text-xs font-bold">
            ✓ {lang === 'ar' ? 'شكراً لتقييمك! تقييمك يساعد العملاء الآخرين.' : 'Thank you for your rating!'}
          </div>
        )}
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="space-y-4 pt-4">
          <h3 className="text-lg font-bold text-[#f3f3f3]">
            {lang === 'ar' ? 'منتجات ذات صلة من نفس القسم' : 'Related items in this category'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
};
