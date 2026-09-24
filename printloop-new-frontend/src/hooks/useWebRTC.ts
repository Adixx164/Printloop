import { useEffect, useRef, useState, useCallback } from 'react';
import type { RTCIceServer, RTCSessionDescriptionInit, RTCIceCandidateInit } from '@/types/editor';

interface UseWebRTCOptions {
  role: 'shop' | 'customer';
  iceServers: RTCIceServer[];
  onOffer?: (offer: RTCSessionDescriptionInit) => void;
  onAnswer?: (answer: RTCSessionDescriptionInit) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelMessage?: (message: any) => void;
  onError?: (error: Error) => void;
}

interface UseWebRTCReturn {
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  createOffer: () => Promise<void>;
  createAnswer: (offer: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  sendData: (data: any) => void;
  close: () => void;
}

export function useWebRTC({
  role,
  iceServers,
  onOffer,
  onAnswer,
  onIceCandidate,
  onConnectionStateChange,
  onDataChannelMessage,
  onError,
}: UseWebRTCOptions): UseWebRTCReturn {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>('new');
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const isInitiator = role === 'shop'; // Shop initiates the connection

  // Initialize peer connection
  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    peerConnectionRef.current = pc;

    // Connection state handlers
    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      onConnectionStateChange?.(pc.connectionState);

      if (pc.connectionState === 'failed') {
        onError?.(new Error('WebRTC connection failed'));
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
    };

    // ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate?.(event.candidate.toJSON());
      }
    };

    // Data channel for Yjs sync
    if (isInitiator) {
      const dc = pc.createDataChannel('yjs-sync', {
        ordered: true,
        maxRetransmits: 0, // unreliable for speed
      });
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    // Remote stream handler
    pc.ontrack = (event) => {
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      event.streams[0].getTracks().forEach(track => {
        remoteStreamRef.current!.addTrack(track);
      });
    };

    // Cleanup
    return () => {
      pc.close();
    };
  }, [role, iceServers, isInitiator, onOffer, onAnswer, onIceCandidate, onConnectionStateChange, onDataChannelMessage, onError]);

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('[WebRTC] Data channel opened');
    };

    dc.onclose = () => {
      console.log('[WebRTC] Data channel closed');
    };

    dc.onerror = (error) => {
      console.error('[WebRTC] Data channel error:', error);
      onError?.(error as any);
    };

    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        onDataChannelMessage?.(message);
      } catch (err) {
        console.error('[WebRTC] Failed to parse data channel message:', err);
      }
    };
  };

  const createOffer = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !isInitiator) return;

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      onOffer?.(offer);
    } catch (err) {
      console.error('[WebRTC] Create offer failed:', err);
      onError?.(err as Error);
    }
  }, [isInitiator, onOffer, onError]);

  const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionRef.current;
    if (!pc || isInitiator) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onAnswer?.(answer);
    } catch (err) {
      console.error('[WebRTC] Create answer failed:', err);
      onError?.(err as Error);
    }
  }, [isInitiator, onAnswer, onError]);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] Add ICE candidate failed:', err);
      onError?.(err as Error);
    }
  }, [onError]);

  const sendData = useCallback((data: any) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(data));
    }
  }, []);

  const close = useCallback(() => {
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.close();
      peerConnectionRef.current = null;
    }
    dataChannelRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  return {
    peerConnection: peerConnectionRef.current,
    dataChannel: dataChannelRef.current,
    localStream: localStreamRef.current,
    remoteStream: remoteStreamRef.current,
    connectionState,
    iceConnectionState,
    createOffer,
    createAnswer,
    addIceCandidate,
    sendData,
    close,
  };
}