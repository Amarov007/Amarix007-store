import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Bot, X, Send, Sparkles, MessageSquare, ExternalLink } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
}

export const AIAssistantModal: React.FC = () => {
  const { lang, navigate } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_1',
      sender: 'ai',
      text: lang === 'ar'
        ? 'مرحباً بك في AMARIX007! أنا مساعد الدعم الفني الذكي. كيف يمكنني مساعدتك في استفسارات التداول، خدمات الرشق، أو طرق الدفع والتسليم؟'
        : 'Welcome to AMARIX007! I am your automated support assistant. How can I assist you with trading bots, social boost, or manual payment verification?'
    }
  ]);
  const [inputText, setInputText] = useState('');

  const quickQuestions = lang === 'ar' ? [
    'كيف أدفع عبر سيرياتيل كاش أو شام كاش؟',
    'متى يصل كود التفعيل للرقم الافتراضي؟',
    'كيف يعمل روبوت الذهب Trend Scalper؟',
    'أين أضع رابط حسابي لخدمة المتابعين؟'
  ] : [
    'How do I pay with USDT BEP20 or Binance?',
    'When does the virtual SMS code arrive?',
    'How does the Trend Scalper MT5 EA work?',
    'Where do I put my account link for boost?'
  ];

  const handleSend = (userQuery?: string) => {
    const textToSend = userQuery || inputText;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: textToSend
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    // Generate intelligent instant knowledge base response
    setTimeout(() => {
      let reply = '';
      const q = textToSend.toLowerCase();
      if (q.includes('سيرياتيل') || q.includes('شام') || q.includes('usdt') || q.includes('pay') || q.includes('دفع')) {
        reply = lang === 'ar'
          ? 'طريقة الدفع يدوية: اختر وسيلة الدفع (USDT, Binance Pay, سيرياتيل كاش أو شام كاش) في صفحة السلة، انسخ رقم الحساب وحوّل المبلغ، ثم ارفع صورة الإشعار واضغط زر «تم الدفع» ليبدأ التنفيذ فوراً.'
          : 'Payment is manual: Select your preferred method (USDT BEP20, Binance Pay, Syriatel or Sham Cash) at checkout, copy the account details and transfer, then attach the proof screenshot and tap “I have paid”.';
      } else if (q.includes('رقم') || q.includes('sms') || q.includes('number') || q.includes('تفعيل') || q.includes('كود')) {
        reply = lang === 'ar'
          ? 'للأرقام الافتراضية، يتم توليد الرقم فور تأكيد الطلب، وعند طلب كود التحقق في الواتساب أو تليجرام، يظهر الرمز تلقائياً في صفحة «طلباتي» خلال 10 إلى 60 ثانية.'
          : 'For virtual numbers, the number is generated immediately after payment, and verification codes appear automatically in your Orders page within 10-60 seconds.';
      } else if (q.includes('روبوت') || q.includes('bot') || q.includes('mt5') || q.includes('scalper')) {
        reply = lang === 'ar'
          ? 'روبوت AMARIX Trend Scalper Pro متوافق مع MetaTrader 5 ويدعم حسابات التمويل (Prop Firms). يأتي مع ملفات إعدادات جاهزة ودليل فيديو بالفيديو.'
          : 'AMARIX Trend Scalper Pro EA is fully MT5 and prop-firm ready, equipped with conservative/aggressive setfiles and installation video guides.';
      } else if (q.includes('رابط') || q.includes('link') || q.includes('متابعين') || q.includes('boost')) {
        reply = lang === 'ar'
          ? 'في السلة أو حاسبة الرشق، ستجد خانة «رابط الحساب»: أدخل رابط حسابك كاملاً يبدأ بـ https:// أو اسم المستخدم @username دون الحاجة لكلمة المرور نهائياً.'
          : 'In the cart or boost calculator, enter your public profile link (https://...) or username (@username). Your password is never required!';
      } else {
        reply = lang === 'ar'
          ? 'شكراً لاستفسارك! يمكنك إتمام الطلب مباشرة من المتجر أو فتح تذكرة دعم فني مخصصة من قسم «الدعم» لمتابعة التفاصيل مع الفريق البشري.'
          : 'Thanks for your query! You can complete your order directly, or open a support ticket under the Support Desk for human agent review.';
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: reply
        }
      ]);
    }, 600);
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className={`fixed bottom-6 ${lang === 'ar' ? 'left-6' : 'right-6'} z-40`}>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#191a23] hover:bg-[#20212e] text-[#b9ff66] border-2 border-[#b9ff66]/50 shadow-2xl hover:scale-105 transition-all group"
          title={lang === 'ar' ? 'الدعم الفني الذكي' : 'AI Support'}
        >
          <div className="w-8 h-8 rounded-xl bg-[#b9ff66] text-[#191a23] flex items-center justify-center font-bold shadow-md shadow-[#b9ff66]/20">
            <Bot className="w-5 h-5 fill-current" />
          </div>
          <div className="flex flex-col text-start">
            <span className="text-xs font-black text-[#f3f3f3] group-hover:text-[#b9ff66] transition-colors">
              {lang === 'ar' ? 'الدعم الفني' : 'AI Support'}
            </span>
            <span className="text-[10px] text-[#b9ff66] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#b9ff66] animate-ping" />
              {lang === 'ar' ? 'متصل الآن' : 'Online'}
            </span>
          </div>
        </button>
      </div>

      {/* Chat Window Modal */}
      {isOpen && (
        <div className={`fixed bottom-20 ${lang === 'ar' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'} w-[90vw] sm:w-96 max-h-[75vh] h-[520px] bg-[#12131a] border border-[#2c2e3d] rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in duration-200`}>
          
          {/* Header */}
          <div className="p-4 bg-[#1b1c26] border-b border-[#2c2e3d] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#b9ff66] text-[#191a23] flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-[#f3f3f3]">
                  {lang === 'ar' ? 'مساعد AMARIX007 الذكي' : 'AMARIX007 Support'}
                </h4>
                <span className="text-[10px] text-[#a4a7b5]">
                  {lang === 'ar' ? 'إجابات فورية 24/7' : 'Instant 24/7 Answers'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg bg-[#12131a] text-[#a4a7b5] hover:text-[#f3f3f3] border border-[#2c2e3d]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] p-3 rounded-2xl leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-[#b9ff66] text-[#191a23] font-bold rounded-br-xs'
                      : 'bg-[#1b1c26] text-[#f3f3f3] border border-[#2c2e3d] rounded-bl-xs'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {/* Quick Prompts */}
            {messages.length < 3 && (
              <div className="pt-2">
                <span className="text-[10px] font-bold text-[#a4a7b5] block mb-2">
                  {lang === 'ar' ? 'أسئلة شائعة سريعة:' : 'Quick Questions:'}
                </span>
                <div className="flex flex-col gap-1.5">
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q)}
                      className="text-start p-2 rounded-xl bg-[#1b1c26] hover:bg-[#232430] border border-[#2c2e3d] text-[11px] text-[#a4a7b5] hover:text-[#b9ff66] transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Input & WhatsApp Direct Handover */}
          <div className="p-3 bg-[#1b1c26] border-t border-[#2c2e3d] space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder={lang === 'ar' ? 'اكتب سؤالك هنا...' : 'Type your message...'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 h-9 px-3 bg-[#12131a] border border-[#2c2e3d] focus:border-[#b9ff66] rounded-xl text-xs text-[#f3f3f3] placeholder-[#5b5e6e] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="w-9 h-9 rounded-xl bg-[#b9ff66] text-[#191a23] disabled:opacity-40 flex items-center justify-center font-bold shrink-0 hover:bg-[#cdff8f] transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <a
              href="https://t.me/amarix007"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-1.5 rounded-lg bg-[#229ed9]/15 hover:bg-[#229ed9]/25 text-[#229ed9] border border-[#229ed9]/30 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>{lang === 'ar' ? 'تحدث مباشرة مع فريق تليجرام' : 'Chat directly with Telegram Agent'}</span>
            </a>
          </div>

        </div>
      )}
    </>
  );
};
