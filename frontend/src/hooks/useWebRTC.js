import { useState, useRef, useEffect, useCallback } from "react";
import { getSocket } from "../services/socket";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
    ]
};

export const useWebRTC = (userId, myUsername = "") => {
    const [callStatus, setCallStatus] = useState("idle"); // idle | outgoing | incoming | connected
    const [incomingCall, setIncomingCall] = useState(null); // { callerId, callerName, isVideoCall, offer }
    const [activePeerId, setActivePeerId] = useState(null);
    const [activePeerName, setActivePeerName] = useState("");
    const [isVideo, setIsVideo] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const iceCandidateQueueRef = useRef([]);

    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    // Initialize or get RTCPeerConnection
    const createPeerConnection = useCallback((targetUserId) => {
        if (peerConnectionRef.current) {
            return peerConnectionRef.current;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // When local ICE candidate is gathered, send it to target user
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const socket = getSocket();
                socket?.emit("ice-candidate", {
                    targetUserId,
                    candidate: event.candidate
                });
            }
        };

        // When remote stream track arrives
        pc.ontrack = (event) => {
            const [remoteStreamTrack] = event.streams;
            if (remoteStreamTrack) {
                remoteStreamRef.current = remoteStreamTrack;
                setRemoteStream(remoteStreamTrack);
                setCallStatus("connected");
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
                endCall();
            }
        };

        return pc;
    }, []);

    // Get user camera and microphone stream
    const getUserMediaStream = async (videoEnabled = true) => {
        if (localStreamRef.current) return localStreamRef.current;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoEnabled ? { width: 1280, height: 720 } : false,
                audio: true
            });

            localStreamRef.current = stream;
            setLocalStream(stream);
            return stream;
        } catch (err) {
            console.error("Camera/Mic access error:", err.message);
            alert("Could not access camera/microphone. Please allow browser permissions.");
            throw err;
        }
    };

    // Attach local stream tracks to PeerConnection
    const attachLocalTracks = (pc, stream) => {
        const senders = pc.getSenders();
        stream.getTracks().forEach((track) => {
            const alreadyAdded = senders.some((s) => s.track?.id === track.id);
            if (!alreadyAdded) {
                pc.addTrack(track, stream);
            }
        });
    };

    // 1. OUTGOING CALL: Start a call to receiver
    const startCall = async (receiverId, videoCall = true, peerName = "") => {
        try {
            const socket = getSocket();
            if (!socket) return alert("Not connected to server");

            setIsVideo(videoCall);
            setActivePeerId(receiverId);
            setActivePeerName(peerName || "User");
            setCallStatus("outgoing");

            const stream = await getUserMediaStream(videoCall);
            const pc = createPeerConnection(receiverId);
            attachLocalTracks(pc, stream);

            // Ringing alert to receiver
            socket.emit("call-user", {
                receiverId,
                isVideoCall: videoCall,
                callerName: myUsername || "Someone"
            });

            // Create WebRTC Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Send WebRTC Offer to receiver
            socket.emit("webrtc-offer", {
                receiverId,
                offer,
                callerName: myUsername || "Someone"
            });
        } catch (err) {
            console.error("startCall error:", err);
            endCall();
        }
    };

    // 2. INCOMING CALL: Accept Call
    const acceptCall = async () => {
        if (!incomingCall) return;

        try {
            const socket = getSocket();
            const { callerId, callerName, isVideoCall } = incomingCall;

            setIsVideo(isVideoCall);
            setActivePeerId(callerId);
            setActivePeerName(callerName || "User");
            setCallStatus("connected");

            const stream = await getUserMediaStream(isVideoCall);
            const pc = createPeerConnection(callerId);
            attachLocalTracks(pc, stream);

            if (incomingCall.offer) {
                await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

                // Process any queued ICE candidates that arrived before offer was set
                while (iceCandidateQueueRef.current.length > 0) {
                    const candidate = iceCandidateQueueRef.current.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
                }

                // Create WebRTC Answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // Send Answer back to caller
                socket?.emit("webrtc-answer", {
                    callerId,
                    answer
                });
            }

            setIncomingCall(null);
        } catch (err) {
            console.error("acceptCall error:", err);
            endCall();
        }
    };

    // 3. Reject Call
    const rejectCall = () => {
        const socket = getSocket();
        if (incomingCall) {
            socket?.emit("end-call", { targetUserId: incomingCall.callerId });
            setIncomingCall(null);
            setCallStatus("idle");
        }
    };

    // 4. End Call
    const endCall = useCallback(() => {
        const socket = getSocket();
        if (activePeerId) {
            socket?.emit("end-call", { targetUserId: activePeerId });
        }

        // Stop all local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }

        // Close peer connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        remoteStreamRef.current = null;
        setRemoteStream(null);
        iceCandidateQueueRef.current = [];
        setCallStatus("idle");
        setActivePeerId(null);
        setActivePeerName("");
        setIncomingCall(null);
        setIsMuted(false);
        setIsVideoOff(false);
    }, [activePeerId]);

    // 5. Toggle Microphone
    const toggleMic = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    // 6. Toggle Camera
    const toggleCamera = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            }
        }
    };

    // Socket listeners for WebRTC signaling
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        // Incoming call notification
        const handleIncomingCall = (data) => {
            setIncomingCall((prev) => ({ ...prev, ...data }));
            setCallStatus("incoming");
        };

        // Incoming WebRTC Offer
        const handleWebRTCOffer = async ({ callerId, callerName, offer }) => {
            setIncomingCall((prev) => ({
                ...prev,
                callerId,
                callerName,
                offer
            }));
            setCallStatus("incoming");
        };

        // Incoming WebRTC Answer (Received by Caller)
        const handleWebRTCAnswer = async ({ answer }) => {
            const pc = peerConnectionRef.current;
            if (pc && pc.signalingState !== "closed") {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));

                // Process queued candidates
                while (iceCandidateQueueRef.current.length > 0) {
                    const candidate = iceCandidateQueueRef.current.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
                }

                setCallStatus("connected");
            }
        };

        // Incoming ICE candidate
        const handleICECandidate = async ({ candidate }) => {
            const pc = peerConnectionRef.current;
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error("Error adding ice candidate:", err);
                }
            } else {
                iceCandidateQueueRef.current.push(candidate);
            }
        };

        // Call ended by remote peer
        const handleCallEnded = () => {
            endCall();
        };

        socket.on("incoming-call", handleIncomingCall);
        socket.on("webrtc-offer", handleWebRTCOffer);
        socket.on("webrtc-answer", handleWebRTCAnswer);
        socket.on("ice-candidate", handleICECandidate);
        socket.on("call-ended", handleCallEnded);

        return () => {
            socket.off("incoming-call", handleIncomingCall);
            socket.off("webrtc-offer", handleWebRTCOffer);
            socket.off("webrtc-answer", handleWebRTCAnswer);
            socket.off("ice-candidate", handleICECandidate);
            socket.off("call-ended", handleCallEnded);
        };
    }, [endCall]);

    return {
        callStatus,
        incomingCall,
        activePeerId,
        activePeerName,
        isVideo,
        isMuted,
        isVideoOff,
        localStream,
        remoteStream,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMic,
        toggleCamera
    };
};
