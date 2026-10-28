import React from 'react';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';
import { Star, ShoppingCart, Heart, Zap, Check } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const {
    lang,
    formatPrice,
    addToCart,
    isFavorite,
    toggleFavorite,
    navigate,
    cart
  } = useStore();

  const isFav = isFavorite(product.id);
  const isInCart = cart.some(item => item.productId === product.id);

  const handleCardClick = () => {
    navigate(`#/p/${product.id}`);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isInCart) {
      addToCart(product);
    }
    navigate('#/cart');
  };

  return (
    <div
      onClick={handleCardClick}
      className="group relative bg-[#1b1c26] hover:bg-[#20212e] rounded-2xl border border-[#2c2e3d] hover:border-[#b9ff66]/60 p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-xl hover:shadow-[#b9ff66]/5"
    >
      {/* Top Badges & Favorite Button */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {product.bs && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#b9ff66] text-[#191a23]">
              {lang === 'ar' ? 'الأكثر طلباً' : 'Best Seller'}
            </span>
          )}
          {product.d && product.d > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/30">
              -{product.d}%
            </span>
          )}
          {product.sp && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#232430] text-[#a4a7b5] border border-[#2c2e3d]">
              {product.sp}
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(product.id);
          }}
          className={`p-2 rounded-xl bg-[#12131a]/80 hover:bg-[#232430] transition-colors border border-[#2c2e3d] ${
            isFav ? 'text-[#f87171]' : 'text-[#a4a7b5] hover:text-[#f3f3f3]'
          }`}
          title={isFav ? (lang === 'ar' ? 'إزالة من المفضلة' : 'Remove favorite') : (lang === 'ar' ? 'إضافة للمفضلة' : 'Add to favorite')}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Main Info */}
      <div className="mb-4">
        <h3 className="text-sm font-bold text-[#f3f3f3] group-hover:text-[#b9ff66] transition-colors line-clamp-2 leading-snug">
          {lang === 'ar' ? product.ar : product.en}
        </h3>

        {/* Rating and review count */}
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex items-center text-[#fbbf24]">
            <Star className="w-3.5 h-3.5 fill-current" />
          </div>
          <span className="text-xs font-bold text-[#f3f3f3]">{product.r}</span>
          <span className="text-[11px] text-[#a4a7b5]">({product.n})</span>
        </div>
      </div>

      {/* Price & Action Footer */}
      <div className="pt-3 border-t border-[#2c2e3d]/80 flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-black text-[#b9ff66] font-['Urbanist',sans-serif]">
              {formatPrice(product.p)}
            </span>
            {product.o && product.o > product.p && (
              <span className="text-xs text-[#a4a7b5] line-through">
                {formatPrice(product.o)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#a4a7b5]">
            {lang === 'ar' ? 'تسليم فوري' : 'Instant Delivery'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleAddToCart}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
              isInCart
                ? 'bg-[#12131a] text-[#b9ff66] border-[#b9ff66]/50'
                : 'bg-[#232430] hover:bg-[#2c2e3d] text-[#f3f3f3] border-[#2c2e3d]'
            }`}
          >
            {isInCart ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'في السلة' : 'In Cart'}</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-3.5 h-3.5 text-[#b9ff66]" />
                <span>{lang === 'ar' ? 'أضف' : 'Add'}</span>
              </>
            )}
          </button>

          <button
            onClick={handleBuyNow}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-black bg-[#b9ff66] hover:bg-[#cdff8f] text-[#191a23] transition-all shadow-sm"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{lang === 'ar' ? 'شراء' : 'Buy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
