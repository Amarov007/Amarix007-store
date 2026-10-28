import React from 'react';
import { useStore } from '../context/StoreContext';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts } = useStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4">
      {toasts.map((toast) => {
        let bg = 'bg-[#191a23] text-[#f3f3f3] border-[#2c2e3d]';
        let icon = <Info className="w-4 h-4 text-[#60a5fa] shrink-0" />;

        if (toast.type === 'ok') {
          bg = 'bg-[#14231b] text-[#b9ff66] border-[#22c55e]/40';
          icon = <CheckCircle2 className="w-4 h-4 text-[#22c55e] shrink-0" />;
        } else if (toast.type === 'er') {
          bg = 'bg-[#261616] text-[#f87171] border-[#f87171]/40';
          icon = <XCircle className="w-4 h-4 text-[#f87171] shrink-0" />;
        } else if (toast.type === 'wn') {
          bg = 'bg-[#291e12] text-[#fbbf24] border-[#fbbf24]/40';
          icon = <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-3 duration-200 backdrop-blur-md ${bg}`}
          >
            {icon}
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
};
