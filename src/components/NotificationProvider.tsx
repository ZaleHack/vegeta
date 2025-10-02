import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type NotificationTone = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: number;
  message: string;
  tone: NotificationTone;
}

interface NotificationContextValue {
  notify: (tone: NotificationTone, message: string) => void;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  notifyInfo: (message: string) => void;
  notifyWarning: (message: string) => void;
  clearNotification: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const toneStyles: Record<NotificationTone, string> = {
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-100',
  error:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-500/15 dark:text-red-100',
  info:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/60 dark:bg-sky-500/15 dark:text-sky-100',
  warning:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-100'
};

const toneIcons: Record<NotificationTone, string> = {
  success: '✔',
  error: '✖',
  info: 'ℹ',
  warning: '!'
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeouts = useRef<Record<number, number>>({});

  const clearNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    if (timeouts.current[id]) {
      window.clearTimeout(timeouts.current[id]);
      delete timeouts.current[id];
    }
  }, []);

  const notify = useCallback((tone: NotificationTone, message: string) => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, tone, message }]);

    if (timeouts.current[id]) {
      window.clearTimeout(timeouts.current[id]);
    }

    timeouts.current[id] = window.setTimeout(() => {
      clearNotification(id);
    }, 5000);
  }, [clearNotification]);

  const contextValue = useMemo<NotificationContextValue>(() => ({
    notify,
    notifySuccess: (message: string) => notify('success', message),
    notifyError: (message: string) => notify('error', message),
    notifyInfo: (message: string) => notify('info', message),
    notifyWarning: (message: string) => notify('warning', message),
    clearNotification
  }), [notify, clearNotification]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-4 z-[1000] flex flex-col items-center gap-3 px-4 sm:items-end sm:px-6">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                role="status"
                className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border px-5 py-4 shadow-xl backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-600 dark:focus-visible:ring-offset-slate-900 ${toneStyles[notification.tone]}`}
              >
                <span className="mt-0.5 text-lg font-semibold leading-none">
                  {toneIcons[notification.tone]}
                </span>
                <p className="flex-1 text-sm leading-snug">
                  {notification.message}
                </p>
                <button
                  type="button"
                  onClick={() => clearNotification(notification.id)}
                  className="ml-2 inline-flex text-sm font-semibold opacity-70 transition hover:opacity-100"
                  aria-label="Fermer la notification"
                >
                  ×
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications doit être utilisé à l’intérieur d’un NotificationProvider');
  }
  return context;
};
