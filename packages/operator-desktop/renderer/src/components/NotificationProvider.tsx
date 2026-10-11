import { createContext, useContext, useState, ReactNode } from 'react';
import { Toaster, toast } from 'sonner';

interface NotificationContextType {
  notify: (options: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message?: string }) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<any[]>([]);
  
  const notify = ({ type, title, message }: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message?: string }) => {
    toast[type](title, { description: message });
  };
  
  return (
    <NotificationContext.Provider value={{ notify }}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1A1410',
            color: '#F8F4ED',
            border: '2px solid #1A1410',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: '0.04em',
          },
        }}
      />
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}