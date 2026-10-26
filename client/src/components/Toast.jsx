import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** const toast = useToast(); toast('Saved'); toast(err.message, 'error') */
export const useToast = () => useContext(ToastContext);
