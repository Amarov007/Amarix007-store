import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import {
  Trash2,
  Plus,
  Minus,
  Tag,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
  ShoppingBag,
  CreditCard,
  Copy
} from 'lucide-react';

export const CartPage: React.FC = () => {
  const {
    lang,
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,
    accountLink,
    setAccountLink,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    subtotalUsd,
    discountUsd,
    totalUsd,
    totalSyp,
    currency,
    formatPrice,
    paymentMethods,
    createOrder,
    navigate,
    showToast
  } = useStore();

  const [couponInput, setCouponInput] = useState('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(paymentMethods[0]?.id || 'usdt');

  // Check if any cart item requires account link
  const requiresAccountLink = cart.some(
    item => item.product.smm_input !== 'none' && (item.product.c === 'boost' || item.product.c === 'games' || item.product.ptype === 'game_topup' || item.product.ptype === 'smm')
  );

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    if (applyCoupon(couponInput)) {
      setCouponInput('');
    }
  };

  const handleCheckout = () => {
    if (requiresAccountLink && !accountLink.trim()) {
      showToast(lang === 'ar' ? 'يرجى إدخال رابط الحساب أو معرّف اللاعب (ID) لإتمام الطلب' : 'Please provide your account link or Player ID', 'wn');
      return;
    }
    createOrder(selectedPaymentMethodId);
  };

  if (cart.length === 0) {
    return (
      <div className="py-20 text-center rounded-3xl bg-[#1b1c26] border border-[#2c2e3d] p-8 space-y-4 max-w-xl mx-auto shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-[#12131a] border border-[#2c2e3d] text-[#a4a7b5] flex items-center justify-center mx-auto">
          <ShoppingBag className="w-8 h-8 opacity-40" />
        </div>
        <h2 className="text-xl font-bold text-[#f3f3f3]">
          {lang === 'ar' ? 'سلتك فارغة حالياً' : 'Your cart is currently empty'}
        </h2>
        <p className="text-xs text-[#a4a7b5]">
          {lang === 'ar' ? 'تصفح روبوتات التداول، شحن الألعاب، وحزم المتابعين وأضف ما يناسبك.' : 'Browse trading bots, game top-ups, and social boost packages.'}
        </p>
        <button
          onClick={() => navigate('#/')}
          className="px-6 py-3 rounded-xl bg-[#b9ff66] text-[#191a23] font-black text-xs hover:bg-[#cdff8f] transition-all shadow-md shadow-[#b9ff66]/10"
        >
          {lang === 'ar' ? 'تصفح المتجر الآن' : 'Browse Catalog'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Checkout Step-by-Step Progress Indicator */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] shadow-lg">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { n: 1, title: lang === 'ar' ? 'السلة والطلب' : 'Cart & Order', desc: lang === 'ar' ? 'مراجعة البنود والكميات' : 'Review items', active: true, done: false },
            { n: 2, title: lang === 'ar' ? 'وسيلة الدفع' : 'Payment Method', desc: lang === 'ar' ? 'اختيار طريقة التحويل' : 'Select method', active: false, done: false },
            { n: 3, title: lang === 'ar' ? 'إشعار التحويل' : 'Transfer Proof', desc: lang === 'ar' ? 'إرفاق الإيصال / TXID' : 'Attach receipt', active: false, done: false },
            { n: 4, title: lang === 'ar' ? 'التحقق والتنفيذ' : 'Manual Review', desc: lang === 'ar' ? 'مراجعة الإدارة والتسليم' : 'Admin verification', active: false, done: false },
          ].map((s) => (
            <div key={s.n} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${s.active ? 'bg-[#12131a] border-[#b9ff66]/70 shadow-sm shadow-[#b9ff66]/10' : 'bg-[#12131a]/40 border-[#2c2e3d]'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${s.active ? 'bg-[#b9ff66] text-[#191a23] shadow-md shadow-[#b9ff66]/30' : 'bg-[#232430] text-[#a4a7b5]'}`}>
                {s.n}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-bold truncate ${s.active ? 'text-[#f3f3f3]' : 'text-[#a4a7b5]'}`}>
                  {s.title}
                </div>
                <div className="text-[10px] text-[#717588] truncate hidden sm:block">
                  {s.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2c2e3d]">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif]">
            {lang === 'ar' ? 'سلة المشتريات والدفع' : 'Shopping Cart & Checkout'}
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#b9ff66] text-[#191a23]">
            {cart.length} {lang === 'ar' ? 'بنود' : 'items'}
          </span>
        </div>
        <button
          onClick={clearCart}
          className="text-xs text-[#a4a7b5] hover:text-[#f87171] transition-colors"
        >
          {lang === 'ar' ? 'إفراغ السلة' : 'Clear cart'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Cart Items List & Account Link */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Cart items */}
          <div className="space-y-3">
            {cart.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#232430] text-[#a4a7b5] border border-[#2c2e3d]">
                      {item.product.c.toUpperCase()}
                    </span>
                    {item.country && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#12131a] text-[#b9ff66]">
                        {item.country}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#f3f3f3] line-clamp-1">
                    {lang === 'ar' ? item.product.ar : item.product.en}
                  </h3>
                  <div className="text-xs font-black text-[#b9ff66] mt-1 font-['Urbanist',sans-serif]">
                    {formatPrice(item.product.p)}
                  </div>
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                  {/* Quantity controls */}
                  <div className="flex items-center bg-[#12131a] border border-[#2c2e3d] rounded-xl p-1">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-lg text-[#a4a7b5] hover:text-[#f3f3f3] flex items-center justify-center font-bold"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-xs font-black text-[#f3f3f3]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-lg text-[#a4a7b5] hover:text-[#f3f3f3] flex items-center justify-center font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-sm font-black text-[#f3f3f3] min-w-16 text-end">
                    {formatPrice(item.product.p * item.quantity)}
                  </span>

                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-2 rounded-xl text-[#a4a7b5] hover:text-[#f87171] hover:bg-[#12131a] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Account Link / Player ID Field */}
          {requiresAccountLink && (
            <div className="p-5 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] space-y-2">
              <label className="text-xs font-bold text-[#f3f3f3] flex items-center justify-between">
                <span>
                  {lang === 'ar' ? 'رابط الحساب أو معرّف اللاعب (Player ID) المطلوب للتنفيذ:' : 'Account link or Player ID required for execution:'}
                </span>
                <span className="text-[10px] text-[#f87171] font-bold">{lang === 'ar' ? '* إلزامي' : '* Required'}</span>
              </label>
              <input
                type="text"
                placeholder={lang === 'ar' ? 'https://instagram.com/user أو @username أو معرّف ID الألعاب' : 'https://instagram.com/user or @user or Player ID'}
                value={accountLink}
                onChange={(e) => setAccountLink(e.target.value)}
                className="w-full h-11 px-4 bg-[#12131a] border border-[#2c2e3d] focus:border-[#b9ff66] rounded-xl text-xs text-[#f3f3f3] placeholder-[#5b5e6e] focus:outline-none"
              />
              <p className="text-[11px] text-[#a4a7b5]">
                {lang === 'ar' ? 'سيتم تنفيذ بنود الرشق أو شحن الألعاب على هذا الرابط مباشرة فور تأكيد الدفع.' : 'Top-up & boost items will be credited to this ID upon payment verification.'}
              </p>
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="p-5 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] space-y-4">
            <h3 className="text-xs font-bold text-[#f3f3f3] uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'اختر وسيلة الدفع اليدوية:' : 'Select Manual Payment Method:'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paymentMethods.map(pm => {
                const isSelected = selectedPaymentMethodId === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setSelectedPaymentMethodId(pm.id)}
                    className={`p-4 rounded-2xl text-start transition-all border flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#12131a] border-[#b9ff66] shadow-md shadow-[#b9ff66]/10'
                        : 'bg-[#12131a]/60 border-[#2c2e3d] hover:border-[#b9ff66]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#f3f3f3]">
                        {lang === 'ar' ? pm.ar : pm.en}
                      </span>
                      <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#b9ff66] bg-[#b9ff66]' : 'border-[#a4a7b5]'}`} />
                    </div>
                    <div className="text-[10px] text-[#a4a7b5] line-clamp-2">
                      {lang === 'ar' ? pm.da : pm.de}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Coupon Code & Order Summary */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Coupon Box */}
          <div className="p-5 rounded-2xl bg-[#1b1c26] border border-[#2c2e3d] space-y-3">
            <h4 className="text-xs font-bold text-[#f3f3f3] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'كود الخصم (كوبون)' : 'Discount Coupon'}</span>
            </h4>

            {appliedCoupon ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#14231b] border border-[#22c55e]/40">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#22c55e]" />
                  <div>
                    <span className="text-xs font-black text-[#b9ff66] uppercase">{appliedCoupon.code}</span>
                    <span className="text-[10px] text-[#a4a7b5] block">
                      {appliedCoupon.discountPercent ? `خصم ${appliedCoupon.discountPercent}%` : `خصم $${appliedCoupon.discountAmount}`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={removeCoupon}
                  className="text-xs text-[#f87171] hover:underline font-bold"
                >
                  {lang === 'ar' ? 'إزالة' : 'Remove'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'أدخل الكود (مثل: AMX10)' : 'Enter coupon (e.g. AMX10)'}
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  className="flex-1 h-10 px-3 bg-[#12131a] border border-[#2c2e3d] focus:border-[#b9ff66] rounded-xl text-xs text-[#f3f3f3] uppercase placeholder-[#5b5e6e] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!couponInput.trim()}
                  className="px-4 py-2 bg-[#b9ff66] hover:bg-[#cdff8f] disabled:opacity-40 text-[#191a23] font-bold text-xs rounded-xl transition-all"
                >
                  {lang === 'ar' ? 'تطبيق' : 'Apply'}
                </button>
              </form>
            )}
          </div>

          {/* Order Summary Box */}
          <div className="p-6 rounded-3xl bg-[#1b1c26] border border-[#2c2e3d] space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-[#f3f3f3] uppercase tracking-wider pb-3 border-b border-[#2c2e3d]">
              {lang === 'ar' ? 'ملخص الفاتورة' : 'Order Summary'}
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-[#a4a7b5]">
                <span>{lang === 'ar' ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                <span className="font-bold text-[#f3f3f3]">{formatPrice(subtotalUsd)}</span>
              </div>

              {discountUsd > 0 && (
                <div className="flex justify-between text-[#22c55e]">
                  <span>{lang === 'ar' ? 'الخصم المطبق:' : 'Coupon Discount:'}</span>
                  <span className="font-bold">-{formatPrice(discountUsd)}</span>
                </div>
              )}

              <div className="pt-3 border-t border-[#2c2e3d] flex justify-between items-baseline">
                <span className="text-sm font-bold text-[#f3f3f3]">
                  {lang === 'ar' ? 'الإجمالي للدفع:' : 'Total Payable:'}
                </span>
                <div className="text-end">
                  <div className="text-2xl font-black text-[#b9ff66] font-['Urbanist',sans-serif]">
                    {formatPrice(totalUsd)}
                  </div>
                  {currency === 'USD' && (
                    <span className="text-[11px] text-[#a4a7b5]">
                      ≈ {Math.round(totalSyp).toLocaleString()} ل.س
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              className="w-full py-4 rounded-2xl bg-[#b9ff66] hover:bg-[#cdff8f] text-[#191a23] font-black text-sm transition-all shadow-xl shadow-[#b9ff66]/20 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'تأكيد الطلب والانتقال للدفع' : 'Confirm Order & Pay'}</span>
              {lang === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2 justify-center text-[10px] text-[#a4a7b5] pt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#b9ff66]" />
              <span>{lang === 'ar' ? 'جميع البيانات مشفرة وتخضع لسياسة الخصوصية' : 'Encrypted & Privacy Protected'}</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
