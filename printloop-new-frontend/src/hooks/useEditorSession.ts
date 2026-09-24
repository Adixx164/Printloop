import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/hooks/useAuth';
import { config } from '@/lib/config';
import type { EditorSession, UniverDocument, EditorRole, AwarenessState, Participant, SignalingMessage } from '@/types/editor';

interface UseEditorSessionOptions {
  sessionId: string;
  role: EditorRole;
  onDocumentChange?: (doc: UniverDocument) => void;
  onAwarenessChange?: (awareness: AwarenessState[]) => void;
  onParticipantChange?: (participants: Participant[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
  onSaveStatusChange?: (status: 'saving' | 'saved' | 'error') => void;
}

interface UseEditorSessionReturn {
  session: EditorSession | null;
  document: UniverDocument | null;
  token: string | null;
  iceServers: RTCIceServer[];
  isLoading: boolean;
  isConnected: boolean;
  participants: Participant[];
  awarenessStates: AwarenessState[];
  sendSignaling: (message: SignalingMessage) => void;
  saveSnapshot: (snapshot: any, version: number) => Promise<void>;
  exportDocument: (format: 'pdf' | 'pwg') => Promise<{ documentUrl: string; pageCount: number; fileSize: number }>;
  approveEdit: () => Promise<{ paymentUrl: string; amount: number; reference: string }>;
  rejectEdit: (reason: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function useEditorSession({
  sessionId,
  role,
  onDocumentChange,
  onAwarenessChange,
  onParticipantChange,
  onConnectionChange,
  onError,
}: UseEditorSessionOptions): UseEditorSessionReturn {
  const { accessToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [document, setDocument] = useState<UniverDocument | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [awarenessStates, setAwarenessStates] = useState<AwarenessState[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  // Initialize socket connection
  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const socketUrl = config.apiBaseUrl?.replace('/api', '') || 'http://localhost:4000';
    
    socketRef.current = io(`${socketUrl}/api/saas/editor/ws/${sessionId}`, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[EditorSocket] Connected');
      setIsConnected(true);
      onConnectionChange?.(true);
      reconnectAttempts.current = 0;
    });

    socket.on('disconnect', (reason) => {
      console.log('[EditorSocket] Disconnected:', reason);
      setIsConnected(false);
      onConnectionChange?.(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[EditorSocket] Connection error:', err);
      onError?.(err);
    });

    // Room state
    socket.on('room-state', (data: {
      sessionId: string;
      role: EditorRole;
      documentVersion: number;
      peerAwareness: AwarenessState | null;
      peerConnected: boolean;
    }) => {
      console.log('[EditorSocket] Room state:', data);
    });

    // Peer events
    socket.on('peer-joined', (data: { role: EditorRole }) => {
      console.log('[EditorSocket] Peer joined:', data.role);
    });

    socket.on('peer-left', (data: { role: EditorRole }) => {
      console.log('[EditorSocket] Peer left:', data.role);
    });

    // WebRTC signaling
    socket.on('offer', (data: { offer: RTCSessionDescriptionInit; fromRole: EditorRole }) => {
      // Handle incoming offer
    });

    socket.on('answer', (data: { answer: RTCSessionDescriptionInit; fromRole: EditorRole }) => {
      // Handle incoming answer
    });

    socket.on('ice-candidate', (data: { candidate: RTCIceCandidateInit; fromRole: EditorRole }) => {
      // Handle incoming ICE candidate
    });

    // Awareness (cursors, selections)
    socket.on('awareness', (awareness: AwarenessState) => {
      setAwarenessStates(prev => {
        const filtered = prev.filter(a => a.userId !== awareness.userId);
        return [...filtered, awareness];
      });
      onAwarenessChange?.([...awarenessStates.filter(a => a.userId !== awareness.userId), awareness]);
    });

    // Document snapshot (Yjs update)
    socket.on('snapshot', (data: { snapshot: any; version: number; fromRole: EditorRole }) => {
      if (data.fromRole !== role) {
        onDocumentChange?.(data.snapshot);
      }
    });

    // Document version
    socket.on('document-version', (data: { version: number }) => {
      console.log('[EditorSocket] Document version:', data.version);
    });

    // Session closed
    socket.on('session-closed', (data: { reason: string }) => {
      console.log('[EditorSocket] Session closed:', data.reason);
      onError?.(new Error(data.reason));
    });

    return () => {
      socket.disconnect();
      setIsConnected(false);
    };
  }, [sessionId, accessToken, role, onDocumentChange, onAwarenessChange, onConnectionChange, onError]);

  // Fetch session data
  const refreshSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${config.apiBaseUrl}/api/saas/editor/session/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }

      const data = await response.json();
      if (data.success) {
        setSession(data.data.session);
        setDocument(data.data.univerDocument);
        setToken(data.data.token);
        setIceServers(data.data.iceServers || []);
      }
    } catch (err) {
      console.error('[useEditorSession] Refresh failed:', err);
      onError?.(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, accessToken, config.apiBaseUrl, onError]);

  // Initial load
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Send signaling message
  const sendSignaling = useCallback((message: SignalingMessage) => {
    socketRef.current?.emit(message.type, message);
  }, []);

  // Save snapshot
  const saveSnapshot = useCallback(async (snapshot: any, version: number) => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/saas/editor/session/${sessionId}/snapshot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snapshot, version }),
      });

      if (!response.ok) {
        throw new Error('Failed to save snapshot');
      }
    } catch (err) {
      console.error('[useEditorSession] Save snapshot failed:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [sessionId, accessToken, config.apiBaseUrl, onError]);

  // Export document
  const exportDocument = useCallback(async (format: 'pdf' | 'pwg') => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/saas/editor/session/${sessionId}/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format }),
      });

      if (!response.ok) {
        throw new Error('Failed to export document');
      }

      const data = await response.json();
      return data.data;
    } catch (err) {
      console.error('[useEditorSession] Export failed:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [sessionId, accessToken, config.apiBaseUrl, onError]);

  // Approve edit
  const approveEdit = useCallback(async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/saas/editor/session/${sessionId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to approve edit');
      }

      const data = await response.json();
      return data.data;
    } catch (err) {
      console.error('[useEditorSession] Approve failed:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [sessionId, accessToken, config.apiBaseUrl, onError]);

  // Reject edit
  const rejectEdit = useCallback(async (reason: string) => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/saas/editor/session/${sessionId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject edit');
      }
    } catch (err) {
      console.error('[useEditorSession] Reject failed:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [sessionId, accessToken, config.apiBaseUrl, onError]);

  return {
    session,
    document,
    token,
    iceServers,
    isLoading,
    isConnected,
    participants,
    awarenessStates,
    sendSignaling,
    saveSnapshot,
    exportDocument,
    approveEdit,
    rejectEdit,
    refreshSession,
  };
}