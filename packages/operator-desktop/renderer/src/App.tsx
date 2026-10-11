import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useSelector, useDispatch } from 'react-redux';
import { Toaster } from 'sonner';
import { operatorApi } from '@printloop/shared/operator-api';
import { Dashboard } from './features/Dashboard';
import { PrintQueue } from './features/PrintQueue';
import { Kiosks } from './features/Kiosks';
import { Payouts } from './features/Payouts';
import { Analytics } from './features/Analytics';
import { Settings } from './features/Settings';
import { Login } from './features/Login';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { NotificationProvider } from './components/NotificationProvider';
import { SocketProvider } from './context/SocketContext';
import { useSocket } from './hooks/useSocket';

// Extend window for electronAPI
declare global {
  interface Window {
    electronAPI: any;
  }
}

function App() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Initialize socket connection
  useEffect(() => {
    if (isAuthenticated && window.electronAPI) {
      window.electronAPI.getSocketConnectionInfo().then(({ url, path }) => {
        const newSocket = io(url, {
          path,
          auth: {
            tenantId: user?.tenantId,
            role: 'desktop',
          },
          transports: ['websocket', 'polling'],
        });
        
        newSocket.on('connect', () => {
          console.log('[Socket] Connected');
        });
        
        newSocket.on('disconnect', (reason) => {
          console.log('[Socket] Disconnected:', reason);
        });
        
        setSocket(newSocket);
      });
    }
    
    return () => {
      socket?.disconnect();
    };
  }, [isAuthenticated, user]);
  
  // Listen for socket events
  useEffect(() => {
    if (!socket) return;
    
    socket.on('queue:updated', (data) => {
      // Trigger RTK Query refetch
      dispatch(operatorApi.util.invalidateTags(['TenantOps', 'TenantKiosks']));
    });
    
    socket.on('job:new', (data) => {
      dispatch(operatorApi.util.invalidateTags(['TenantOps', 'TenantKiosks']));
      // Show notification
      window.electronAPI?.saveNotification({
        id: crypto.randomUUID(),
        type: 'job:new',
        title: 'New Print Job',
        body: `Job ${data.code} - ${data.pages} pages`,
        data,
        createdAt: new Date().toISOString(),
      });
    });
    
    return () => {
      socket.off('queue:updated');
      socket.off('job:new');
    };
  }, [socket]);
  
  // Get dispatch from store
  const dispatch = useDispatch();
  
  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }
  
  return (
    <SocketProvider socket={socket}>
      <NotificationProvider>
        <Layout user={user} onLogout={logout}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/queue" element={<PrintQueue />} />
            <Route path="/kiosks" element={<Kiosks />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </NotificationProvider>
    </SocketProvider>
  );
}

export default App;