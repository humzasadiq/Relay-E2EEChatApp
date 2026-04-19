"use client";

import { create } from "zustand";
import { getSocket } from "./socket";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export interface IncomingCall {
  callerId: string;
  conversationId: string;
  offer: RTCSessionDescriptionInit;
  isVideo: boolean;
}

export interface ActiveCall {
  conversationId: string;
  peerId: string;
  isVideo: boolean;
  isMuted: boolean;
}

interface CallStore {
  incoming: IncomingCall | null;
  active: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** RTCPeerConnection — not serialized, held by reference */
  _pc: RTCPeerConnection | null;

  setIncoming: (call: IncomingCall | null) => void;
  initiateCall: (
    token: string,
    opts: { conversationId: string; recipientId: string; isVideo: boolean },
  ) => Promise<void>;
  answerCall: (token: string) => Promise<void>;
  rejectCall: (token: string) => void;
  hangup: (token: string) => void;
  toggleMute: () => void;
  /** Called when remote answer SDP arrives via socket */
  _onAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  /** Called when a remote ICE candidate arrives via socket */
  _onIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  /** Tear down without emitting hangup (used when remote ends call) */
  _cleanup: () => void;
}

function createPC(
  token: string,
  conversationId: string,
  peerId: string,
  onRemoteStream: (stream: MediaStream) => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection(ICE_CONFIG);

  pc.onicecandidate = ({ candidate }) => {
    if (!candidate) return;
    getSocket(token).emit("call:ice-candidate", {
      conversationId,
      targetUserId: peerId,
      candidate: candidate.toJSON(),
    });
  };

  pc.ontrack = (e) => {
    if (e.streams[0]) onRemoteStream(e.streams[0]);
  };

  return pc;
}

export const useCallStore = create<CallStore>((set, get) => ({
  incoming: null,
  active: null,
  localStream: null,
  remoteStream: null,
  _pc: null,

  setIncoming: (call) => set({ incoming: call }),

  initiateCall: async (token, { conversationId, recipientId, isVideo }) => {
    if (get()._pc) return; // already in a call

    const pc = createPC(token, conversationId, recipientId, (remoteStream) =>
      set({ remoteStream }),
    );

    let localStream: MediaStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo,
      });
    } catch {
      pc.close();
      throw new Error("Camera/microphone access denied");
    }

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    set({
      _pc: pc,
      localStream,
      active: { conversationId, peerId: recipientId, isVideo, isMuted: false },
    });

    getSocket(token).emit("call:offer", {
      conversationId,
      recipientId,
      offer,
      isVideo,
    });
  },

  answerCall: async (token) => {
    const { incoming } = get();
    if (!incoming) return;

    const pc = createPC(
      token,
      incoming.conversationId,
      incoming.callerId,
      (remoteStream) => set({ remoteStream }),
    );

    let localStream: MediaStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incoming.isVideo,
      });
    } catch {
      pc.close();
      throw new Error("Camera/microphone access denied");
    }

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(incoming.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    set({
      _pc: pc,
      localStream,
      incoming: null,
      active: {
        conversationId: incoming.conversationId,
        peerId: incoming.callerId,
        isVideo: incoming.isVideo,
        isMuted: false,
      },
    });

    getSocket(token).emit("call:answer", {
      conversationId: incoming.conversationId,
      callerId: incoming.callerId,
      answer,
    });
  },

  rejectCall: (token) => {
    const { incoming } = get();
    if (!incoming) return;
    getSocket(token).emit("call:reject", {
      conversationId: incoming.conversationId,
      callerId: incoming.callerId,
    });
    set({ incoming: null });
  },

  hangup: (token) => {
    const { active, _pc, localStream } = get();
    if (active) {
      getSocket(token).emit("call:hangup", {
        conversationId: active.conversationId,
      });
    }
    _pc?.close();
    localStream?.getTracks().forEach((t) => t.stop());
    set({
      active: null,
      incoming: null,
      _pc: null,
      localStream: null,
      remoteStream: null,
    });
  },

  toggleMute: () => {
    const { active, localStream } = get();
    if (!active || !localStream) return;
    const newMuted = !active.isMuted;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    set({ active: { ...active, isMuted: newMuted } });
  },

  _onAnswer: async (answer) => {
    const { _pc } = get();
    if (!_pc) return;
    await _pc.setRemoteDescription(answer);
  },

  _onIceCandidate: async (candidate) => {
    const { _pc } = get();
    if (!_pc) return;
    try {
      await _pc.addIceCandidate(candidate);
    } catch {
      // can arrive before remote description is set; safe to ignore
    }
  },

  _cleanup: () => {
    const { _pc, localStream } = get();
    _pc?.close();
    localStream?.getTracks().forEach((t) => t.stop());
    set({
      active: null,
      incoming: null,
      _pc: null,
      localStream: null,
      remoteStream: null,
    });
  },
}));
