/**
 * Socket.io Server for Real-time Sync
 * Runs in Electron main process
 * Room: tenant:{tenantId}
 */

import { Server, Socket } from 'socket.io';
import { createServer as createHttpServer } from 'http';

interface TenantSocket extends Socket {
  tenantId?: string;
  role?: 'desktop' | 'mobile';
}

export function createServer() {
  const httpServer = createHttpServer();
  const io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'printloop-operator://'],
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });
  
  // Middleware for tenant authentication
  io.use((socket: TenantSocket, next) => {
    const tenantId = socket.handshake.auth.tenantId;
    const role = socket.handshake.auth.role;
    
    if (!tenantId || !role) {
      return next(new Error('Authentication required: tenantId and role'));
    }
    
    socket.tenantId = tenantId;
    socket.role = role;
    next();
  });
  
  io.on('connection', (socket: TenantSocket) => {
    const { tenantId, role } = socket;
    const room = `tenant:${tenantId}`;
    
    console.log(`[Socket.io] ${role} connected: ${socket.id} (tenant: ${tenantId})`);
    
    // Join tenant room
    socket.join(room);
    
    // Track connection count
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const count = roomSockets?.size || 0;
    console.log(`[Socket.io] Room ${room} has ${count} connections`);
    
    // Notify others in room
    socket.to(room).emit('peer:connected', { role, socketId: socket.id });
    
    // Handle job queue events
    socket.on('queue:updated', (data) => {
      socket.to(room).emit('queue:updated', data);
    });
    
    socket.on('job:new', (data) => {
      socket.to(room).emit('job:new', data);
    });
    
    socket.on('job:accepted', (data) => {
      socket.to(room).emit('job:accepted', data);
    });
    
    socket.on('job:rejected', (data) => {
      socket.to(room).emit('job:rejected', data);
    });
    
    socket.on('payout:updated', (data) => {
      socket.to(room).emit('payout:updated', data);
    });
    
    socket.on('message:new', (data) => {
      socket.to(room).emit('message:new', data);
    });
    
    socket.on('analytics:tick', (data) => {
      socket.to(room).emit('analytics:tick', data);
    });
    
    // Heartbeat
    socket.on('ping', () => socket.emit('pong'));
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] ${role} disconnected: ${socket.id} (${reason})`);
      
      const remainingRoom = io.sockets.adapter.rooms.get(room);
      const remainingCount = remainingRoom?.size || 0;
      console.log(`[Socket.io] Room ${room} has ${remainingCount} connections`);
      
      socket.to(room).emit('peer:disconnected', { role, socketId: socket.id });
    });
  });
  
  return {
    io,
    httpServer,
    listen: (port: number) => {
      return new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    },
    close: () => {
      io.close();
      httpServer.close();
    },
    // Broadcast to all tenants (admin only)
    broadcast: (event: string, data: any) => {
      io.emit(event, data);
    },
    // Send to specific tenant room
    toTenant: (tenantId: string, event: string, data: any) => {
      io.to(`tenant:${tenantId}`).emit(event, data);
    },
  };
}