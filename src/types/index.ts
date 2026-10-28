export type Language = 'ar' | 'en';
export type Theme = 'dark' | 'light';
export type Currency = 'USD' | 'SYP';

export type CategoryType = 'shop' | 'boost' | 'numbers' | 'funded' | 'embed' | 'hub';

export interface CategoryFilterOption {
  ar: string;
  en: string;
  o: string[];
}

export interface Category {
  id: string;
  ty: CategoryType;
  i: string; // icon key
  ar: string;
  en: string;
  da: string; // desc ar
  de: string; // desc en
  f?: CategoryFilterOption[];
  hub?: 'games' | 'apps' | 'none';
  embed_url?: string;
  image_url?: string;
}

export interface Product {
  id: string;
  c: string; // category id
  ar: string;
  en: string;
  p: number; // price in USD
  o?: number; // original price
  r: number; // rating (e.g. 4.9)
  n: number; // number of reviews
  bs?: number; // best seller rank (1, 2, 3...)
  d?: number; // discount percentage
  tg?: string; // tags
  sp?: string; // specs summary (e.g. "MT5 · Forex")
  img?: string;
  images?: string[];
  description_ar?: string;
  description_en?: string;
  smm_provider?: string;
  smm_service?: string | number;
  smm_qty?: number;
  smm_country?: string;
  smm_input?: string;
  ptype?: 'game_topup' | 'app_subscription' | 'gift_card' | 'smm' | 'digital_tool';
  min?: number;
  max?: number;
  unit_name_ar?: string;
  unit_name_en?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  accountLink?: string;
  country?: string;
  units?: number;
}

export interface PaymentMethod {
  id: string;
  on: boolean;
  currency: 'USD' | 'SYP';
  ar: string;
  en: string;
  icon: string;
  color: string;
  acc: string;
  da: string;
  de: string;
  qrCode?: string;
}

export type OrderStatus = 'new' | 'processing' | 'done' | 'cancelled';
export type PaymentStatus = 'pending' | 'review' | 'paid';

export interface OrderDeliveryData {
  number?: string;
  code?: string;
  text?: string;
  credentials?: {
    user?: string;
    pass?: string;
    licenseKey?: string;
  };
}

export interface Order {
  id: string;
  createdAt: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: CartItem[];
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalSyp: number;
  currencyUsed: Currency;
  paymentMethod: PaymentMethod;
  accountLink?: string;
  couponCode?: string;
  proofImage?: string;
  smmStatus?: 'none' | 'sending' | 'sent' | 'partial' | 'completed' | 'failed';
  delivery?: OrderDeliveryData;
  adminNotes?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  walletBalance: number;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  date: string;
  subject: string;
  message: string;
  orderId?: string;
  proofImage?: string;
  status: 'open' | 'answered' | 'closed';
  reply?: string;
  replyDate?: string;
}

export interface PartnerConfig {
  on: boolean;
  name: string;
  url: string;
  ar: string;
  en: string;
  ba: string;
  be: string;
  banner_bg_url?: string;
}

export interface Coupon {
  code: string;
  discountPercent?: number;
  discountAmount?: number;
  minSpend?: number;
}
