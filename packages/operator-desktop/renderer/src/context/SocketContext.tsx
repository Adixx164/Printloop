import { createContext, useContext, useEffect, ReactNode } from 'react';
import { Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export function SocketProvider({ children, socket }: { children: ReactNode; socket: Socket | null }) {
  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): Socket | null {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context.socket;
}