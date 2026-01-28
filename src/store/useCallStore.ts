import { create } from 'zustand';
import { SipClient } from '../lib/sip';
import { Session, SessionState, Invitation, Inviter, UserAgent } from 'sip.js';
import { api } from '../lib/api';

interface CallState {
  sipClient: SipClient | null;
  currentSession: Session | null;
  status: 'idle' | 'registering' | 'registered' | 'calling' | 'incoming' | 'answering' | 'connected' | 'error';
  remoteIdentity: string | null;
  remoteStream: MediaStream | null; // Expose remote stream for visualization
  extension: string | null;
  
  initializeSip: (config: any) => Promise<void>;
  makeCall: (target: string) => Promise<void>;
  answerCall: () => Promise<void>;
  hangupCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
}

export const useCallStore = create<CallState>((set, get) => ({
  sipClient: null,
  currentSession: null,
  status: 'idle',
  remoteIdentity: null,
  remoteStream: null,
  extension: null,

  initializeSip: async (config) => {
    // Avoid re-initialization
    if (get().sipClient) return;

    set({ status: 'registering' });

    // Fixed IP as requested
    const sipDomain = '192.168.21.47';

    const sipClient = new SipClient({
      uri: UserAgent.makeURI(`sip:${config.extension}@${sipDomain}`),
      transportOptions: {
        server: 'wss://192.168.21.47:8443', // Use Nginx Stream Proxy (WSS)
        traceSip: true,
      },
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionOptions: {
            // Remove STUN to speed up ICE gathering in local/LAN environment
            // iceServers: [
            //     { urls: 'stun:stun.l.google.com:19302' }
            // ]
        }
      },
      authorizationPassword: config.password || '1234', // Default FS password
      authorizationUsername: config.extension, // Use extension as auth username
    });

    try {
        await sipClient.connect(
            // onInvite (Incoming call)
            (invitation: Invitation) => {
                const session = invitation;
                console.log('[SIP] Incoming call from:', session.remoteIdentity.uri.user);
                set({
                    currentSession: session,
                    status: 'incoming',
                    remoteIdentity: session.remoteIdentity.uri.user
                });

                console.log('[SIP] Current session state:', SessionState[session.state]);
                console.log('[SIP] Setting up state change listener for incoming call');

                session.stateChange.addListener((newState) => {
                    console.log(`[SIP] Session state changed: ${SessionState[newState]} (was: ${SessionState[session.state]})`);

                    if (newState === SessionState.Established) {
                        console.log('[SIP] Session established, setting up remote stream...');

                        // Handle media for incoming call
                        const remoteStream = new MediaStream();
                        const pc = session.sessionDescriptionHandler && (session.sessionDescriptionHandler as any).peerConnection;

                        console.log('[SIP] PeerConnection:', pc ? 'exists' : 'null');

                        if (pc) {
                            const receivers = pc.getReceivers();
                            console.log(`[SIP] Found ${receivers.length} receivers`);

                            receivers.forEach((receiver: any) => {
                                if (receiver.track) {
                                    console.log(`[SIP] Adding track: ${receiver.track.kind} - ${receiver.track.id}`);
                                    remoteStream.addTrack(receiver.track);
                                }
                            });

                            console.log(`[SIP] Remote stream tracks: ${remoteStream.getTracks().length}`);

                            // Also check senders for local audio
                            const senders = pc.getSenders();
                            console.log(`[SIP] Found ${senders.length} senders`);
                        }

                        // Create and play audio element
                        const audio = new Audio();
                        audio.srcObject = remoteStream;
                        audio.volume = 1.0;
                        audio.autoplay = true;
                        // @ts-expect-error playsInline missing in type
                        audio.playsInline = true;

                        audio.play().then(() => {
                            console.log('[SIP] Remote audio playing successfully');
                        }).catch(e => {
                            console.error('[SIP] Audio play error:', e);
                        });

                        (session as any)._remoteAudio = audio;
                        set({ status: 'connected', remoteStream });
                        console.log('[SIP] Status set to connected, remoteStream updated');
                    } else if (newState === SessionState.Terminated) {
                        console.log('[SIP] Session terminated');
                        // Cleanup audio
                        if ((session as any)._remoteAudio) {
                            (session as any)._remoteAudio.pause();
                            (session as any)._remoteAudio = null;
                        }
                        set({ currentSession: null, status: 'registered', remoteIdentity: null, remoteStream: null });
                    }
                });
            },
            // onRegistered
            () => {
                set({ status: 'registered' });
            },
            // onUnregistered
            () => {
                set({ status: 'idle' });
            }
        );

        set({ sipClient, extension: config.extension });
    } catch (error) {
        console.error('SIP Connect error', error);
        set({ status: 'error' });
    }
  },

  makeCall: async (target) => {
    const { sipClient } = get();
    if (!sipClient) return;

    // Ensure target is a valid SIP URI
    // If target is just an extension (e.g. "1002"), append the domain
    let targetURI = target;
    // Fix: Use the configured SIP domain (192.168.21.42) instead of window.location.hostname
    // This ensures calls go to the correct domain even if accessed via localhost or other alias
    const sipDomain = '192.168.21.47'; 
    if (!target.includes('@')) {
        targetURI = `sip:${target}@${sipDomain}`;
    } else if (!target.startsWith('sip:')) {
        targetURI = `sip:${target}`;
    }

    try {
        const inviter = sipClient.call(targetURI);
        set({ 
            currentSession: inviter, 
            status: 'calling',
            remoteIdentity: target
        });
        
        // Create Call Record in Backend
        const callerExtension = get().extension;
        const calleeExtension = target; // Assuming target is extension
        const sipCallId = inviter.request.callId;

        if (callerExtension) {
            api.post('/calls', {
                callerExtension,
                calleeExtension,
                sipCallId
            }).catch(err => console.error('Failed to create call record:', err));
        }

        inviter.stateChange.addListener((state) => {
            if (state === SessionState.Established) {
                // Handle media
                const remoteStream = new MediaStream();
                const pc = inviter.sessionDescriptionHandler && (inviter.sessionDescriptionHandler as any).peerConnection;
                if (pc) {
                    pc.getReceivers().forEach((receiver: any) => {
                        if (receiver.track) {
                            remoteStream.addTrack(receiver.track);
                        }
                    });
                }
                
                // Play audio
                const audio = new Audio();
                audio.srcObject = remoteStream;
                audio.volume = 1.0;
                audio.autoplay = true;
                // @ts-expect-error playsInline missing in type
                audio.playsInline = true;
                audio.play().catch(e => console.error('Audio play error:', e));
                (inviter as any)._remoteAudio = audio; // Keep reference to prevent GC and allow cleanup
                set({ status: 'connected', remoteStream });
            } else if (state === SessionState.Terminated) {
                // Cleanup audio
                if ((inviter as any)._remoteAudio) {
                    (inviter as any)._remoteAudio.pause();
                    (inviter as any)._remoteAudio = null;
                }
                set({ currentSession: null, status: 'registered', remoteIdentity: null });
            }
        });

        const options = {
            sessionDescriptionHandlerOptions: {
                constraints: { audio: true, video: false },
                iceGatheringTimeout: 200
            } as any
        };
        await inviter.invite(options);
    } catch (error) {
        console.error('Make call error', error);
        set({ status: 'registered' });
    }
  },

  answerCall: async () => {
    const { currentSession } = get();
    if (currentSession && currentSession instanceof Invitation) {
        console.log('[SIP] Answering call...');

        // Set to answering state to show feedback
        set({ status: 'answering' });

        // Accept with options to ensure media is set up correctly
        const options = {
            sessionDescriptionHandlerOptions: {
                constraints: { audio: true, video: false }
            }
        };

        try {
            await currentSession.accept(options);
            console.log('[SIP] Call accepted, waiting for SessionState.Established...');
            // Status will be set to 'connected' by the stateChange listener
        } catch (error) {
            console.error('[SIP] Failed to answer call:', error);
            set({ status: 'incoming' });
        }
    }
  },

  hangupCall: async () => {
    const { currentSession } = get();
    if (currentSession) {
        // Cleanup audio
        if ((currentSession as any)._remoteAudio) {
            (currentSession as any)._remoteAudio.pause();
            (currentSession as any)._remoteAudio = null;
        }

        if (currentSession.state === SessionState.Established) {
            await currentSession.bye();
        } else {
             // If calling or incoming
             if (currentSession instanceof Invitation) {
                 await currentSession.reject();
             } else if (currentSession instanceof Inviter) {
                 await currentSession.cancel();
             }
        }
        set({ currentSession: null, status: 'registered', remoteIdentity: null, remoteStream: null });
    }
  },
  
  rejectCall: async () => {
      const { currentSession } = get();
      if (currentSession && currentSession instanceof Invitation) {
          // Cleanup audio if any
          if ((currentSession as any)._remoteAudio) {
              (currentSession as any)._remoteAudio.pause();
              (currentSession as any)._remoteAudio = null;
          }
          await currentSession.reject();
          set({ currentSession: null, status: 'registered', remoteIdentity: null, remoteStream: null });
      }
  }
}));
