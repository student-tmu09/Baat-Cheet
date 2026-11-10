import React, { useEffect, useRef } from "react";
import { soundService } from "../services/sound";

export const VideoCallModal = ({
    callStatus,
    incomingCall,
    activePeerName,
    isVideo,
    isMuted,
    isVideoOff,
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
}) => {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    // Play call audio ringtone/dialing tone depending on status
    useEffect(() => {
        if (callStatus === "incoming") {
            soundService.playIncomingRingtone();
        } else if (callStatus === "outgoing") {
            soundService.playDialingTone();
        } else if (callStatus === "connected") {
            soundService.stopCallSounds();
        } else if (callStatus === "idle") {
            soundService.stopCallSounds();
        }

        return () => {
            soundService.stopCallSounds();
        };
    }, [callStatus]);

    const handleAccept = () => {
        soundService.stopCallSounds();
        acceptCall();
    };

    const handleReject = () => {
        soundService.stopCallSounds();
        soundService.playCallEndTone();
        rejectCall();
    };

    const handleEnd = () => {
        soundService.stopCallSounds();
        soundService.playCallEndTone();
        endCall();
    };

    // Attach local stream to <video>
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // Attach remote stream to <video>
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // 1. Incoming Call Dialog Popup
    if (callStatus === "incoming" && incomingCall) {
        return (
            <div className="modal-backdrop">
                <div className="incoming-card">
                    <div className="caller-avatar">📞</div>
                    <h3>Incoming {incomingCall.isVideoCall ? "Video" : "Audio"} Call</h3>
                    <p>
                        <strong>{incomingCall.callerName || "Someone"}</strong> is calling you...
                    </p>

                    <div className="action-buttons">
                        <button className="btn-accept" onClick={handleAccept}>
                            ✅ Accept
                        </button>
                        <button className="btn-reject" onClick={handleReject}>
                            ❌ Decline
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 2. Active Call View (Outgoing or Connected)
    if (callStatus === "outgoing" || callStatus === "connected") {
        return (
            <div className="call-overlay">
                <div className="call-container">
                    {/* Remote Video (Full Screen) */}
                    <div className="remote-video-wrapper">
                        {remoteStream ? (
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="remote-video"
                            />
                        ) : (
                            <div className="connecting-placeholder">
                                <div className="pulse-ring"></div>
                                <p>{callStatus === "outgoing" ? "Ringing..." : "Connecting stream..."}</p>
                                <h3>{activePeerName || "User"}</h3>
                            </div>
                        )}
                    </div>

                    {/* Local Video (Floating Picture-in-Picture) */}
                    {isVideo && (
                        <div className="local-video-pip">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className={`local-video ${isVideoOff ? "hidden" : ""}`}
                            />
                            {isVideoOff && <div className="cam-off-badge">Camera Off</div>}
                        </div>
                    )}

                    {/* Call Control Toolbar */}
                    <div className="call-toolbar">
                        <button
                            className={`tool-btn ${isMuted ? "btn-danger" : ""}`}
                            onClick={toggleMic}
                            title={isMuted ? "Unmute" : "Mute"}
                        >
                            {isMuted ? "🔇 Mic Off" : "🎙️ Mic On"}
                        </button>

                        {isVideo && (
                            <button
                                className={`tool-btn ${isVideoOff ? "btn-danger" : ""}`}
                                onClick={toggleCamera}
                                title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
                            >
                                {isVideoOff ? "📷 Cam Off" : "📹 Cam On"}
                            </button>
                        )}

                        <button className="tool-btn btn-end" onClick={handleEnd} title="End Call">
                            📞 End Call
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
