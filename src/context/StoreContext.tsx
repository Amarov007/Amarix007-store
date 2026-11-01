import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Language,
  Theme,
  Currency,
  Category,
  Product,
  CartItem,
  PaymentMethod,
  Order,
  User,
  SupportTicket,
  Coupon
} from '../types';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_COUPONS,
  EXCHANGE_RATES,
  INITIAL_PARTNER
} from '../data/storeData';
import confetti from 'canvas-confetti';

interface Toast {
  id: string;
  message: string;
  type: 'ok' | 'er' | 'wn' | 'info';
}

interface StoreContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  soundOn: boolean;
  toggleSound: () => void;
  musicOn: boolean;
  toggleMusic: () => void;
  categories: Category[];
  products: Product[];
  cart: CartItem[];
  cartCount: number;
  addToCart: (product: Product, quantity?: number, accountLink?: string, country?: string) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, qty: number) => void;
  clearCart: () => void;
  accountLink: string;
  setAccountLink: (link: string) => void;
  appliedCoupon: Coupon | null;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalSyp: number;
  paymentMethods: PaymentMethod[];
  orders: Order[];
  createOrder: (paymentMethodId: string, proofImage?: string) => Order | null;
  claimPayment: (orderId: string, proofImage?: string) => void;
  user: User | null;
  login: (email: string, name?: string) => void;
  logout: () => void;
  favorites: string[];
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  supportTickets: SupportTicket[];
  createTicket: (subject: string, message: string, orderId?: string, proofImage?: string) => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'ok' | 'er' | 'wn' | 'info') => void;
  formatPrice: (usdAmount: number, overrideCurrency?: Currency) => string;
  playSound: (type: 'add' | 'click' | 'success' | 'alert') => void;
  currentRoute: string;
  navigate: (route: string) => void;
  isQuickBuyOpen: boolean;
  setIsQuickBuyOpen: (open: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  partnerConfig: typeof INITIAL_PARTNER;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Web Audio API sound synthesizer
function playSynthSound(type: 'add' | 'click' | 'success' | 'alert') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'add') {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'click') {
      osc.frequency.setValueAtTime(700, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1);
      osc.frequency.setValueAtTime(659.25, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === 'alert') {
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.setValueAtTime(220, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    }
  } catch {
    // Ignore audio errors if audio context blocked by browser gesture
  }
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Language & Theme
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('amx_lang') as Language) || 'ar';
  });
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('amx_theme') as Theme) || 'dark';
  });
  const [currency, setCurrencyState] = useState<Currency>(() => {
    return (localStorage.getItem('amx_currency') as Currency) || 'USD';
  });
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    return localStorage.getItem('amx_sound') !== '0';
  });
  const [musicOn, setMusicOn] = useState<boolean>(() => {
    return localStorage.getItem('amx_music') === '1';
  });

  // 2. Data Lists
  const [categories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [products] = useState<Product[]>(INITIAL_PRODUCTS);
  const [paymentMethods] = useState<PaymentMethod[]>(INITIAL_PAYMENT_METHODS);

  // 3. User & Auth
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('amx_user');
    if (cached) {
      try { return JSON.parse(cached); } catch { return null; }
    }
    // Default demo user so customer can immediately explore order tracking & account
    return {
      id: 'usr_amx_007',
      name: 'Amarov VIP',
      email: 'amarov0077@gmail.com',
      role: 'admin',
      walletBalance: 150.00,
      createdAt: '2026-01-15'
    };
  });

  // 4. Cart State
  const [cart, setCart] = useState<CartItem[]>(() => {
    const cached = localStorage.getItem('amx_cart');
    if (cached) {
      try { return JSON.parse(cached); } catch { return []; }
    }
    return [];
  });
  const [accountLink, setAccountLink] = useState<string>(() => {
    return localStorage.getItem('amx_account_link') || '';
  });
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

  // 5. Orders State
  const [orders, setOrders] = useState<Order[]>(() => {
    const cached = localStorage.getItem('amx_orders');
    if (cached) {
      try { return JSON.parse(cached); } catch { return []; }
    }
    // Seed initial historical sample order
    return [
      {
        id: 'AMX-9104',
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        userId: 'usr_amx_007',
        userName: 'Amarov VIP',
        userEmail: 'amarov0077@gmail.com',
        status: 'done',
        paymentStatus: 'paid',
        items: [
          {
            id: 'item_init_1',
            productId: 'boost_ig_followers_1k',
            product: INITIAL_PRODUCTS.find(p => p.id === 'boost_ig_followers_1k') || INITIAL_PRODUCTS[0],
            quantity: 1,
            accountLink: 'https://instagram.com/amarix007'
          }
        ],
        subtotalUsd: 4.5,
        discountUsd: 0,
        totalUsd: 4.5,
        totalSyp: 4.5 * 140,
        currencyUsed: 'USD',
        paymentMethod: INITIAL_PAYMENT_METHODS[0],
        accountLink: 'https://instagram.com/amarix007',
        smmStatus: 'completed',
        delivery: {
          text: 'تم رشق 1,000 متابع بنجاح عبر الخادم الفائق السريع.'
        }
      }
    ];
  });

  // 6. Favorites
  const [favorites, setFavorites] = useState<string[]>(() => {
    const cached = localStorage.getItem('amx_favs');
    if (cached) {
      try { return JSON.parse(cached); } catch { return []; }
    }
    return ['bot_scalper_01', 'boost_ig_followers_1k'];
  });

  // 7. Support Tickets
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    const cached = localStorage.getItem('amx_tickets');
    if (cached) {
      try { return JSON.parse(cached); } catch { return []; }
    }
    return [
      {
        id: 'TK-1002',
        userId: 'usr_amx_007',
        date: new Date(Date.now() - 86400000).toISOString(),
        subject: 'استفسار حول تثبيت روبوت التداول MT5',
        message: 'مرحباً، هل يتم تقديم ملف الإعدادات Setfiles الموصى بها مع كود الروبوت؟',
        status: 'answered',
        reply: 'أهلاً بك! نعم، يأتي الروبوت مجهزاً بـ 3 ملفات إعدادات محافظة ومتوسطة وهجومية مع دليل فيديو شامل للتثبيت.',
        replyDate: new Date().toISOString()
      }
    ];
  });

  // 8. Navigation & UI Modals
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    return window.location.hash || '#/';
  });
  const [isQuickBuyOpen, setIsQuickBuyOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Sync Hash Router
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (route: string) => {
    window.location.hash = route;
    setCurrentRoute(route);
  };

  // Sync HTML Attributes
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('amx_lang', lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('amx_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('amx_currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('amx_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('amx_orders', JSON.stringify(orders));
  }, [orders]);

  // Supabase Realtime channel listener for user order status updates
  useEffect(() => {
    if (!user || !user.id) return;
    const SB_URL = "https://pvuobngrybygohendwaz.supabase.co";
    const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU";

    let channel: any = null;
    let client: any = null;

    try {
      client = createClient(SB_URL, SB_KEY);
      channel = client.channel(`store-context-orders-${user.id}`);

      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newRow = payload?.new;
          if (!newRow || !newRow.id) return;

          const orderId = String(newRow.id);
          const currentOrder = orders.find(o => String(o.id) === orderId);
          const prevStatus = (currentOrder?.status || payload?.old?.status || 'pending').toLowerCase();
          const nextStatus = (newRow.status || '').toLowerCase();
          const prevPay = (currentOrder?.paymentStatus || payload?.old?.payment_status || 'pending').toLowerCase();
          const nextPay = (newRow.payment_status || '').toLowerCase();

          setOrders(prev => prev.map(o => {
            if (String(o.id) === orderId) {
              return {
                ...o,
                status: (newRow.status as any) || o.status,
                paymentStatus: (newRow.payment_status as any) || o.paymentStatus,
              };
            }
            return o;
          }));

          const isPending = (s: string) => !s || s === 'pending' || s === 'new' || s === 'awaiting_payment';
          const isConfirmed = (s: string) => s === 'processing' || s === 'confirmed' || s === 'paid' || s === 'under_review';
          const isCompleted = (s: string) => s === 'done' || s === 'completed';

          const becameConfirmed =
            (isPending(prevStatus) && (isConfirmed(nextStatus) || nextPay === 'paid' || nextPay === 'review')) ||
            (prevPay === 'pending' && (nextPay === 'review' || nextPay === 'paid'));

          const becameCompleted = isCompleted(nextStatus) && !isCompleted(prevStatus);

          if (becameCompleted) {
            showToast(lang === 'ar' ? `تهانينا! تم اكتمال طلبك رقم #${orderId} بنجاح.` : `Congratulations! Order #${orderId} is now completed.`, 'ok');
            playSynthSound('success');
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
          } else if (becameConfirmed) {
            showToast(lang === 'ar' ? `تم تأكيد طلبك رقم #${orderId}، وهو الآن قيد التنفيذ!` : `Order #${orderId} has been confirmed and is now being processed!`, 'ok');
            playSynthSound('success');
          }
        }
      );

      channel.subscribe();
    } catch (err) {
      console.warn('[AMARIX] StoreContext realtime subscription error:', err);
    }

    return () => {
      if (client && channel) {
        try { client.removeChannel(channel); } catch {}
      }
    };
  }, [user?.id, lang]);

  useEffect(() => {
    localStorage.setItem('amx_favs', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('amx_tickets', JSON.stringify(supportTickets));
  }, [supportTickets]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('amx_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('amx_user');
    }
  }, [user]);

  // Audio Sound Effect helper
  const playSound = (type: 'add' | 'click' | 'success' | 'alert') => {
    if (soundOn) {
      playSynthSound(type);
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('amx_sound', next ? '1' : '0');
    showToast(next ? (lang === 'ar' ? 'تم تفعيل الأصوات' : 'Sound enabled') : (lang === 'ar' ? 'تم كتم الأصوات' : 'Sound muted'));
  };

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    localStorage.setItem('amx_music', next ? '1' : '0');
    showToast(next ? (lang === 'ar' ? 'الموسيقى مفعلة' : 'Music enabled') : (lang === 'ar' ? 'الموسيقى مغلقة' : 'Music disabled'));
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    playSound('click');
  };

  const setLang = (l: Language) => {
    setLangState(l);
    playSound('click');
  };

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    playSound('click');
  };

  // Toast Notification
  const showToast = (message: string, type: 'ok' | 'er' | 'wn' | 'info' = 'ok') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Price Formatter
  const formatPrice = (usdAmount: number, overrideCurrency?: Currency): string => {
    const target = overrideCurrency || currency;
    if (target === 'SYP') {
      const syp = Math.round(usdAmount * EXCHANGE_RATES.SYP.rate);
      return `${syp.toLocaleString()} ${EXCHANGE_RATES.SYP.symbol}`;
    }
    return `$${usdAmount.toFixed(usdAmount < 10 && usdAmount > 0 ? 2 : 2)} ${EXCHANGE_RATES.USD.symbol}`;
  };

  // Cart Calculations
  const subtotalUsd = cart.reduce((sum, item) => sum + item.product.p * item.quantity, 0);

  let discountUsd = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountPercent) {
      discountUsd = (subtotalUsd * appliedCoupon.discountPercent) / 100;
    } else if (appliedCoupon.discountAmount) {
      discountUsd = Math.min(subtotalUsd, appliedCoupon.discountAmount);
    }
  }

  const totalUsd = Math.max(0, subtotalUsd - discountUsd);
  const totalSyp = totalUsd * EXCHANGE_RATES.SYP.rate;

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Cart Actions
  const addToCart = (product: Product, quantity = 1, itemAccountLink?: string, country?: string) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.productId === product.id && (!country || item.country === country));
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + quantity,
          accountLink: itemAccountLink || next[existingIndex].accountLink
        };
        return next;
      }
      return [
        ...prev,
        {
          id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          product,
          quantity,
          accountLink: itemAccountLink || accountLink,
          country
        }
      ];
    });
    playSound('add');
    showToast(lang === 'ar' ? `أُضيف إلى السلة: ${product.ar}` : `Added to cart: ${product.en}`, 'ok');
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.id !== cartItemId));
    playSound('click');
    showToast(lang === 'ar' ? 'تمت إزالة المنتج من السلة' : 'Removed from cart');
  };

  const updateQuantity = (cartItemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart(prev => prev.map(item => item.id === cartItemId ? { ...item, quantity: qty } : item));
    playSound('click');
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
  };

  const applyCoupon = (code: string): boolean => {
    const trimmed = code.trim().toUpperCase();
    const found = INITIAL_COUPONS.find(c => c.code.toUpperCase() === trimmed);
    if (!found) {
      playSound('alert');
      showToast(lang === 'ar' ? 'كود الخصم غير صحيح أو منتهي الصلاحية' : 'Invalid or expired coupon', 'er');
      return false;
    }
    if (found.minSpend && subtotalUsd < found.minSpend) {
      playSound('alert');
      showToast(
        lang === 'ar'
          ? `الحد الأدنى لتطبيق هذا الكوبون هو ${found.minSpend}$`
          : `Minimum spend for this coupon is $${found.minSpend}`,
        'wn'
      );
      return false;
    }
    setAppliedCoupon(found);
    playSound('success');
    showToast(lang === 'ar' ? 'تم تطبيق كود الخصم بنجاح!' : 'Coupon applied successfully!', 'ok');
    return true;
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    playSound('click');
    showToast(lang === 'ar' ? 'تمت إزالة كود الخصم' : 'Coupon removed');
  };

  // Orders
  const createOrder = (paymentMethodId: string, proofImage?: string): Order | null => {
    if (cart.length === 0) {
      showToast(lang === 'ar' ? 'السلة فارغة' : 'Your cart is empty', 'er');
      return null;
    }
    const pm = paymentMethods.find(m => m.id === paymentMethodId) || paymentMethods[0];
    const orderNum = Math.floor(1000 + Math.random() * 9000);
    const newOrder: Order = {
      id: `AMX-${orderNum}`,
      createdAt: new Date().toISOString(),
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
      status: 'new',
      paymentStatus: proofImage ? 'review' : 'pending',
      items: [...cart],
      subtotalUsd,
      discountUsd,
      totalUsd,
      totalSyp,
      currencyUsed: currency,
      paymentMethod: pm,
      accountLink,
      couponCode: appliedCoupon?.code,
      proofImage,
      smmStatus: 'sending',
      delivery: {
        text: lang === 'ar' ? 'قيد المراجعة والتسليم الآلي بعد تأكيد الدفع.' : 'Under review and automated delivery upon payment confirmation.'
      }
    };

    setOrders(prev => [newOrder, ...prev]);
    clearCart();
    playSound('success');

    // Confetti celebration
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#B9FF66', '#FFFFFF', '#191A23']
      });
    } catch {
      // Confetti fallback
    }

    showToast(lang === 'ar' ? 'تم إنشاء الطلب بنجاح! أكمل الدفع.' : 'Order created successfully! Complete payment.', 'ok');
    navigate(`#/done/${newOrder.id}`);
    return newOrder;
  };

  const claimPayment = (orderId: string, proofImage?: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          paymentStatus: 'review',
          proofImage: proofImage || o.proofImage,
          delivery: {
            ...o.delivery,
            text: lang === 'ar' ? 'تم استلام إشعار الدفع وجارٍ التحقق والتنفيذ فوراً.' : 'Payment claim received. Verification in progress.'
          }
        };
      }
      return o;
    }));
    playSound('success');
    showToast(lang === 'ar' ? 'تم إشعار الفريق! سنتحقق من الدفع ونبدأ التنفيذ.' : 'Team notified! We will verify payment shortly.', 'ok');
  };

  // Favorites
  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      if (prev.includes(productId)) {
        playSound('click');
        showToast(lang === 'ar' ? 'تمت إزالة المنتج من المفضلة' : 'Removed from favorites');
        return prev.filter(id => id !== productId);
      } else {
        playSound('add');
        showToast(lang === 'ar' ? 'أُضيف إلى المفضلة' : 'Added to favorites', 'ok');
        return [...prev, productId];
      }
    });
  };

  const isFavorite = (productId: string) => favorites.includes(productId);

  // Support Tickets
  const createTicket = (subject: string, message: string, orderId?: string, proofImage?: string) => {
    const newTicket: SupportTicket = {
      id: `TK-${Math.floor(1000 + Math.random() * 9000)}`,
      userId: user?.id || 'guest',
      date: new Date().toISOString(),
      subject,
      message,
      orderId,
      proofImage,
      status: 'open'
    };
    setSupportTickets(prev => [newTicket, ...prev]);
    playSound('success');
    showToast(lang === 'ar' ? 'تم فتح تذكرة الدعم بنجاح وسيتم الرد قريباً' : 'Support ticket opened successfully', 'ok');
  };

  // Auth
  const login = (email: string, name?: string) => {
    const newUser: User = {
      id: `usr_${Date.now()}`,
      name: name || email.split('@')[0],
      email,
      role: 'user',
      walletBalance: 25.0,
      createdAt: new Date().toISOString()
    };
    setUser(newUser);
    playSound('success');
    showToast(lang === 'ar' ? `مرحباً بك يا ${newUser.name}!` : `Welcome back, ${newUser.name}!`, 'ok');
  };

  const logout = () => {
    setUser(null);
    playSound('click');
    showToast(lang === 'ar' ? 'تم تسجيل الخروج' : 'Signed out');
    navigate('#/');
  };

  return (
    <StoreContext.Provider
      value={{
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
        categories,
        products,
        cart,
        cartCount,
        addToCart,
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
        paymentMethods,
        orders,
        createOrder,
        claimPayment,
        user,
        login,
        logout,
        favorites,
        toggleFavorite,
        isFavorite,
        supportTickets,
        createTicket,
        toasts,
        showToast,
        formatPrice,
        playSound,
        currentRoute,
        navigate,
        isQuickBuyOpen,
        setIsQuickBuyOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        partnerConfig: INITIAL_PARTNER
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
