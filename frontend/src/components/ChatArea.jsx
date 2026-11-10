import React, { useState, useRef, useEffect } from "react";
import { api } from "../services/api";

const EMOJI_LIST = [
    "😀", "😂", "🤣", "😍", "🥰", "😎", "👍", "🔥",
    "❤️", "👏", "🎉", "🚀", "🥳", "🙏", "💯", "✨",
    "🤝", "😮", "😢", "💔", "🤔", "💪", "🙌", "🎯"
];

const extractUserId = (obj) => {
    if (!obj) return "";
    if (typeof obj === "string") return obj.trim();
    return (
        obj._id ||
        obj.id ||
        obj.userId ||
        (obj.user && (obj.user._id || obj.user.id)) ||
        ""
    ).toString().trim();
};

export const ChatArea = ({
    activeConversation,
    currentUserId,
    messages,
    isPartnerTyping,
    partnerTypingName,
    onlineUserIds,
    hasMoreMessages,
    isLoadingMore,
    onLoadMoreMessages,
    onSendMessage,
    onEditMessage,
    onDeleteMessage,
    onStartCall,
    onTypingStart,
    onTypingStop,
    onGroupUpdated,
    onGroupDeleted
}) => {
    const [inputText, setInputText] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);

    // Add Member in Group State
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [searchMemberQuery, setSearchMemberQuery] = useState("");
    const [isSearchingMembers, setIsSearchingMembers] = useState(false);
    const [addMemberLoadingId, setAddMemberLoadingId] = useState(null);
    const [addMemberMsg, setAddMemberMsg] = useState({ text: "", type: "" });

    // Load registered users who are not yet members of this group
    const loadEligibleUsers = async (query = "") => {
        setIsSearchingMembers(true);
        try {
            const data = await api.searchUsers(query.trim());
            if (data?.success && Array.isArray(data.users)) {
                const currentMemberIds = new Set(
                    (activeConversation?.participants || []).map((p) => extractUserId(p))
                );
                const filtered = data.users.filter((u) => {
                    const uId = extractUserId(u);
                    return uId && !currentMemberIds.has(uId);
                });
                setAvailableUsers(filtered);
            } else {
                setAvailableUsers([]);
            }
        } catch (err) {
            console.error("Failed to load eligible users:", err);
            setAvailableUsers([]);
        } finally {
            setIsSearchingMembers(false);
        }
    };

    const handleToggleAddMember = () => {
        const next = !isAddingMember;
        setIsAddingMember(next);
        setAddMemberMsg({ text: "", type: "" });
        setSearchMemberQuery("");
        if (next) {
            loadEligibleUsers("");
        }
    };

    const handleSearchMemberChange = (e) => {
        const val = e.target.value;
        setSearchMemberQuery(val);
        loadEligibleUsers(val);
    };

    const handleAddMember = async (userToAdd) => {
        const uId = extractUserId(userToAdd);
        if (!uId || !activeConversation?._id) return;

        setAddMemberLoadingId(uId);
        setAddMemberMsg({ text: "", type: "" });

        try {
            const data = await api.addGroupMember(activeConversation._id, uId);
            if (data?.success && data?.conversation) {
                setAddMemberMsg({
                    text: `✓ ${userToAdd.username || "User"} added to the group!`,
                    type: "success"
                });
                // Remove added user from available list
                setAvailableUsers((prev) => prev.filter((u) => extractUserId(u) !== uId));
                // Notify parent to update conversation in active chat and sidebar
                onGroupUpdated?.(data.conversation);
            } else {
                setAddMemberMsg({
                    text: data?.message || "Failed to add member",
                    type: "error"
                });
            }
        } catch (err) {
            setAddMemberMsg({
                text: err.message || "Network error adding member",
                type: "error"
            });
        } finally {
            setAddMemberLoadingId(null);
        }
    };

    // Remove member (kick by admin) or Leave group (by self)
    const [actionMemberLoadingId, setActionMemberLoadingId] = useState(null);

    const handleRemoveMember = async (member) => {
        const mId = extractUserId(member);
        if (!mId || !activeConversation?._id) return;

        const isMe = mId === myUserId;
        const confirmMsg = isMe
            ? "Are you sure you want to leave this group?"
            : `Are you sure you want to remove ${member.username || "this member"} from the group?`;

        if (!window.confirm(confirmMsg)) return;

        setActionMemberLoadingId(mId);
        try {
            const data = await api.removeGroupMember(activeConversation._id, mId);
            if (data?.success) {
                if (isMe) {
                    setShowGroupMembersModal(false);
                    onGroupDeleted?.(activeConversation._id);
                } else if (data.conversation) {
                    setAddMemberMsg({
                        text: `✓ ${member.username || "Member"} was removed from the group.`,
                        type: "success"
                    });
                    onGroupUpdated?.(data.conversation);
                }
            } else {
                alert(data?.message || "Failed to remove member");
            }
        } catch (err) {
            alert(err.message || "Error removing member");
        } finally {
            setActionMemberLoadingId(null);
        }
    };

    // Delete entire group (Admin only)
    const handleDeleteGroup = async () => {
        if (!activeConversation?._id) return;
        if (!window.confirm("⚠️ Are you sure you want to permanently delete this group? All messages will be erased.")) {
            return;
        }

        try {
            const data = await api.deleteGroup(activeConversation._id);
            if (data?.success) {
                setShowGroupMembersModal(false);
                onGroupDeleted?.(activeConversation._id);
            } else {
                alert(data?.message || "Failed to delete group");
            }
        } catch (err) {
            alert(err.message || "Error deleting group");
        }
    };

    // Edit Group Info state (Avatar, Name, Description)
    const [isEditingGroup, setIsEditingGroup] = useState(false);
    const [editGroupName, setEditGroupName] = useState("");
    const [editGroupDescription, setEditGroupDescription] = useState("");
    const [editGroupAvatarFile, setEditGroupAvatarFile] = useState(null);
    const [editGroupAvatarPreview, setEditGroupAvatarPreview] = useState("");
    const [isSavingGroupInfo, setIsSavingGroupInfo] = useState(false);
    const [groupInfoMsg, setGroupInfoMsg] = useState({ text: "", type: "" });
    const groupAvatarInputRef = useRef(null);

    // Sync group edit state when activeConversation changes
    useEffect(() => {
        if (activeConversation?.isGroupChat) {
            setEditGroupName(activeConversation.groupName || "");
            setEditGroupDescription(activeConversation.groupDescription || "");
            setEditGroupAvatarPreview(activeConversation.groupAvatar || activeConversation.avatar || "");
            setEditGroupAvatarFile(null);
            setIsEditingGroup(false);
            setGroupInfoMsg({ text: "", type: "" });
        }
    }, [
        activeConversation?._id,
        activeConversation?.groupName,
        activeConversation?.groupAvatar,
        activeConversation?.groupDescription
    ]);

    const handleGroupAvatarFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith("image/")) {
                setGroupInfoMsg({ text: "Please select a valid image file", type: "error" });
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setGroupInfoMsg({ text: "Image file size must be less than 5MB", type: "error" });
                return;
            }
            setGroupInfoMsg({ text: "", type: "" });
            setEditGroupAvatarFile(file);
            setEditGroupAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveGroupAvatar = () => {
        setEditGroupAvatarFile(null);
        setEditGroupAvatarPreview("");
        if (groupAvatarInputRef.current) groupAvatarInputRef.current.value = "";
    };

    const handleSaveGroupInfo = async (e) => {
        e?.preventDefault();
        const cleanName = editGroupName.trim();
        if (!cleanName) {
            setGroupInfoMsg({ text: "Group name cannot be empty", type: "error" });
            return;
        }

        setIsSavingGroupInfo(true);
        setGroupInfoMsg({ text: "", type: "" });

        try {
            const removeAvatar = !editGroupAvatarFile && !editGroupAvatarPreview && !!activeConversation.groupAvatar;
            const data = await api.updateGroupProfile(activeConversation._id, {
                groupName: cleanName,
                groupDescription: editGroupDescription.trim(),
                avatarFile: editGroupAvatarFile,
                removeAvatar
            });

            if (data?.success && data?.conversation) {
                setGroupInfoMsg({ text: "✓ Group profile updated successfully! 🎉", type: "success" });
                onGroupUpdated?.(data.conversation);
                setTimeout(() => {
                    setIsEditingGroup(false);
                    setGroupInfoMsg({ text: "", type: "" });
                }, 1000);
            } else {
                setGroupInfoMsg({ text: data?.message || "Failed to update group", type: "error" });
            }
        } catch (err) {
            setGroupInfoMsg({ text: err.message || "Failed to update group", type: "error" });
        } finally {
            setIsSavingGroupInfo(false);
        }
    };

    // Tagged / Quoted Reply state
    const [replyingTo, setReplyingTo] = useState(null);

    // Editing message state
    const [editingMsgId, setEditingMsgId] = useState(null);
    const [editDraftText, setEditDraftText] = useState("");

    // Clear reply state when conversation changes
    useEffect(() => {
        setReplyingTo(null);
    }, [activeConversation?._id]);

    const handleStartReply = (msg) => {
        setReplyingTo(msg);
        textInputRef.current?.focus();
    };

    const handleCancelReply = () => {
        setReplyingTo(null);
    };

    const scrollToMessage = (msgId) => {
        if (!msgId) return;
        const elem = document.getElementById(`msg-${msgId}`);
        if (elem) {
            elem.scrollIntoView({ behavior: "smooth", block: "center" });
            elem.classList.add("msg-highlight");
            setTimeout(() => {
                elem.classList.remove("msg-highlight");
            }, 1500);
        }
    };

    // Voice recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const mediaStreamRef = useRef(null);

    const containerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const textInputRef = useRef(null);

    // Scroll preservation refs for cursor pagination
    const isPrependingRef = useRef(false);
    const prevScrollHeightRef = useRef(0);
    const prevConvIdRef = useRef(null);

    const myUserId = extractUserId(currentUserId);
    const isGroup = !!activeConversation?.isGroupChat;

    // Get the other chat participant for 1-on-1 chats
    const partner = isGroup
        ? null
        : (activeConversation?.participants?.find((p) => extractUserId(p) !== myUserId) ||
            activeConversation?.participants?.[0] || { username: "User" });

    const partnerId = extractUserId(partner);
    const isPartnerOnline = partnerId ? onlineUserIds.some((id) => extractUserId(id) === partnerId) : false;

    // Helper: Generate clean comma-separated list of group participants
    const getGroupMembersPreview = () => {
        if (!isGroup || !Array.isArray(activeConversation?.participants)) return "";
        const names = activeConversation.participants.map((p) => {
            const pId = extractUserId(p);
            if (pId && myUserId && pId === myUserId) return "You";
            return p?.username || "User";
        });
        return names.join(", ");
    };

    // Smart scroll management: preserves position when loading history, scrolls to bottom on new messages
    useEffect(() => {
        const convId = activeConversation?._id?.toString();
        const isNewConv = convId !== prevConvIdRef.current;
        prevConvIdRef.current = convId;

        // If user switched to another conversation, scroll to bottom
        if (isNewConv) {
            isPrependingRef.current = false;
            messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
            return;
        }

        // If older messages were just prepended at top, preserve scroll offset so view doesn't jump
        if (isPrependingRef.current && containerRef.current) {
            const newScrollHeight = containerRef.current.scrollHeight;
            containerRef.current.scrollTop = newScrollHeight - prevScrollHeightRef.current;
            isPrependingRef.current = false;
            return;
        }

        // Otherwise (new message received/sent, partner typing, etc.), scroll to bottom
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isPartnerTyping, editingMsgId, activeConversation?._id]);

    // Infinite scroll handler: trigger loadMore when user scrolls near the top
    const handleScroll = () => {
        if (!containerRef.current || !hasMoreMessages || isLoadingMore) return;
        if (containerRef.current.scrollTop <= 60) {
            prevScrollHeightRef.current = containerRef.current.scrollHeight;
            isPrependingRef.current = true;
            onLoadMoreMessages?.();
        }
    };

    // Keystroke-based typing indicator with 2.5s inactivity debounce
    const isTypingRef = useRef(false);

    const triggerTyping = () => {
        if (!isTypingRef.current) {
            isTypingRef.current = true;
            onTypingStart?.();
        }
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
            isTypingRef.current = false;
            onTypingStop?.();
        }, 2500);
    };

    const stopTypingImmediately = () => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        if (isTypingRef.current) {
            isTypingRef.current = false;
            onTypingStop?.();
        }
    };

    // Clean up typing when conversation changes or component unmounts
    useEffect(() => {
        return () => {
            stopTypingImmediately();
        };
    }, [activeConversation?._id]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputText(val);

        if (!val.trim()) {
            stopTypingImmediately();
        } else {
            triggerTyping();
        }
    };

    // Handle Send Message
    const handleSend = async (e) => {
        e?.preventDefault();
        if ((!inputText.trim() && !selectedFile) || isSending) return;

        setIsSending(true);
        stopTypingImmediately();
        setShowEmojiPicker(false);

        try {
            await onSendMessage(inputText.trim(), selectedFile, replyingTo?._id);
            setInputText("");
            setSelectedFile(null);
            setReplyingTo(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            console.error("Failed to send message:", err);
        } finally {
            setIsSending(false);
        }
    };

    // Emoji Insert
    const handleEmojiClick = (emoji) => {
        setInputText((prev) => prev + emoji);
        setShowEmojiPicker(false);
        textInputRef.current?.focus();
        triggerTyping();
    };

    // Edit message handlers
    const startEditing = (msg) => {
        setEditingMsgId(msg._id);
        setEditDraftText(msg.text || "");
    };

    const cancelEditing = () => {
        setEditingMsgId(null);
        setEditDraftText("");
    };

    const submitEditing = async (msgId) => {
        if (!editDraftText.trim()) return;
        try {
            await onEditMessage?.(msgId, editDraftText.trim());
            setEditingMsgId(null);
            setEditDraftText("");
        } catch (err) {
            console.error("Failed to edit message:", err);
        }
    };

    // Delete message handler
    const confirmDelete = async (msgId) => {
        if (window.confirm("Are you sure you want to delete this message?")) {
            try {
                await onDeleteMessage?.(msgId);
            } catch (err) {
                console.error("Failed to delete message:", err);
            }
        }
    };

    // Voice recording handlers
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            audioChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            recorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            recordingTimerRef.current = setInterval(() => {
                setRecordingTime((t) => t + 1);
            }, 1000);
        } catch (err) {
            console.error("Microphone access error:", err);
            alert("Could not access microphone for voice recording.");
        }
    };

    const stopRecording = (shouldSend) => {
        if (!mediaRecorderRef.current) return;

        clearInterval(recordingTimerRef.current);
        setIsRecording(false);

        const recorder = mediaRecorderRef.current;

        recorder.onstop = async () => {
            if (shouldSend && audioChunksRef.current.length > 0) {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                const voiceFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" });
                try {
                    await onSendMessage("", voiceFile, replyingTo?._id);
                    setReplyingTo(null);
                } catch (err) {
                    console.error("Failed to send voice note:", err);
                }
            }

            // Stop all audio tracks
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
                mediaStreamRef.current = null;
            }
            audioChunksRef.current = [];
            setRecordingTime(0);
        };

        recorder.stop();
    };

    const formatRecordingDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    };

    // Format message timestamp
    const formatTime = (dateStr) => {
        if (!dateStr) return "";
        try {
            const date = new Date(dateStr);
            return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    };

    // Helper: is media an audio file
    const isAudioFile = (url) => {
        if (!url) return false;
        return url.match(/\.(webm|mp3|wav|ogg|m4a|aac)($|\?)/i) || url.includes("voice-note");
    };

    // Helper: is media an image
    const isImageFile = (url) => {
        if (!url) return false;
        return url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i);
    };

    // If no conversation is active
    if (!activeConversation) {
        return (
            <div className="chat-placeholder">
                <div className="placeholder-content">
                    <span className="placeholder-icon">💬</span>
                    <h3>Select a Conversation</h3>
                    <p>Choose an existing chat from the left, search for a registered user, or create a group to start messaging.</p>
                </div>
            </div>
        );
    }

    return (
        <section className="chat-area">
            {/* 1. Chat Header */}
            <div className="chat-header">
                <div className="partner-profile">
                    <div className="avatar-wrapper">
                        <div className={`user-avatar ${isGroup ? "group-avatar" : ""}`}>
                            {isGroup ? (
                                activeConversation.groupAvatar || activeConversation.avatar ? (
                                    <img
                                        src={activeConversation.groupAvatar || activeConversation.avatar}
                                        alt={activeConversation.groupName || "Group"}
                                        className="avatar-img"
                                    />
                                ) : (
                                    "👥"
                                )
                            ) : partner?.avatar || partner?.media ? (
                                <img
                                    src={partner.avatar || partner.media}
                                    alt={partner.username || "User"}
                                    className="avatar-img"
                                />
                            ) : (
                                partner?.username ? partner.username.charAt(0).toUpperCase() : "U"
                            )}
                        </div>
                        {!isGroup && isPartnerOnline && <span className="online-indicator"></span>}
                    </div>
                    <div className="partner-details">
                        <h3 className="partner-name">
                            {isGroup ? activeConversation.groupName || "Group Chat" : partner.username}
                        </h3>
                        <span className={`partner-status ${isPartnerTyping ? "status-typing" : ""}`}>
                            {isPartnerTyping ? (
                                <span className="typing-header-indicator">
                                    {partnerTypingName ? `${partnerTypingName} is typing` : "typing"}
                                    <span className="dot-pulse">...</span>
                                </span>
                            ) : isGroup ? (
                                <span className="group-members-preview-text" title={getGroupMembersPreview()}>
                                    👥 {activeConversation.participants?.length || 0} members: {getGroupMembersPreview()}
                                </span>
                            ) : isPartnerOnline ? (
                                "🟢 Online"
                            ) : (
                                "⚪ Offline"
                            )}
                        </span>
                    </div>
                </div>

                {/* Header Action Buttons (1-on-1 calls or Group Members) */}
                {!isGroup && partner ? (
                    <div className="chat-call-actions">
                        <button
                            className="btn-call-action audio"
                            title="Start Audio Call"
                            onClick={() => onStartCall(partner._id || partner.id, false, partner.username)}
                        >
                            🎙️ Audio Call
                        </button>
                        <button
                            className="btn-call-action video"
                            title="Start Video Call"
                            onClick={() => onStartCall(partner._id || partner.id, true, partner.username)}
                        >
                            📹 Video Call
                        </button>
                    </div>
                ) : isGroup ? (
                    <div className="chat-group-actions">
                        <button
                            type="button"
                            className="btn-group-members"
                            title="View group members"
                            onClick={() => setShowGroupMembersModal(true)}
                        >
                            👥 Members ({activeConversation.participants?.length || 0})
                        </button>
                    </div>
                ) : null}
            </div>

            {/* 2. Messages List Display with Cursor-based Infinite Scroll */}
            <div
                className="chat-messages-container"
                ref={containerRef}
                onScroll={handleScroll}
            >
                {/* Cursor Pagination: Header indicator & button for loading older messages */}
                {hasMoreMessages && (
                    <div className="load-more-header">
                        {isLoadingMore ? (
                            <div className="loading-more-spinner">
                                <span className="spinner-icon">⏳</span> Loading older messages...
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="btn-load-more"
                                onClick={() => {
                                    if (containerRef.current) {
                                        prevScrollHeightRef.current = containerRef.current.scrollHeight;
                                        isPrependingRef.current = true;
                                    }
                                    onLoadMoreMessages?.();
                                }}
                                title="Click to load older messages from chat history"
                            >
                                ⬆ Load older messages
                            </button>
                        )}
                    </div>
                )}

                {messages.length === 0 ? (
                    <div className="no-messages">
                        <p>
                            {isGroup
                                ? `Welcome to ${activeConversation.groupName || "the group"}! Say hi to everyone! 👋`
                                : `No messages yet. Say hi to ${partner?.username}! 👋`}
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const senderId = extractUserId(msg.sender);
                        const myId = extractUserId(currentUserId);
                        const isMine = !!(senderId && myId && senderId === myId);
                        const isEditingThis = editingMsgId === msg._id;

                        const isSeen = msg.status === "seen" || (msg.isRead && msg.status !== "delivered" && msg.status !== "sent");
                        const isDelivered = msg.status === "delivered";

                        return (
                            <div
                                key={msg._id || idx}
                                id={`msg-${msg._id}`}
                                className={`message-row ${isMine ? "outgoing" : "incoming"}`}
                            >
                                <div className="message-bubble-wrapper">
                                    <div className="message-bubble">
                                        {/* Tagged / Quoted Reply Display */}
                                        {msg.replyTo && (
                                            <div
                                                className="quoted-reply-box"
                                                onClick={() => scrollToMessage(msg.replyTo._id || msg.replyTo)}
                                                title="Click to view original message"
                                            >
                                                <span className="quoted-reply-author">
                                                    {msg.replyTo.sender?.username || (extractUserId(msg.replyTo.sender) === myId ? "You" : "User")}
                                                </span>
                                                <span className="quoted-reply-text">
                                                    {msg.replyTo.text || (msg.replyTo.mediaUrl ? "📎 Attachment" : "Original message")}
                                                </span>
                                            </div>
                                        )}

                                        {/* In group chat, show sender's username above incoming message */}
                                        {isGroup && !isMine && msg.sender?.username && (
                                            <span className="group-sender-tag">
                                                {msg.sender.username}
                                            </span>
                                        )}

                                        {/* Audio / Voice Note Attachment */}
                                        {msg.mediaUrl && isAudioFile(msg.mediaUrl) && (
                                            <div className="message-audio-container">
                                                <audio controls src={msg.mediaUrl} className="chat-audio" />
                                            </div>
                                        )}

                                        {/* Image Attachment */}
                                        {msg.mediaUrl && isImageFile(msg.mediaUrl) && (
                                            <div className="message-media">
                                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
                                                    <img src={msg.mediaUrl} alt="attachment" className="chat-image" />
                                                </a>
                                            </div>
                                        )}

                                        {/* Other File Attachment */}
                                        {msg.mediaUrl && !isAudioFile(msg.mediaUrl) && !isImageFile(msg.mediaUrl) && (
                                            <div className="message-media">
                                                <a
                                                    href={msg.mediaUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="chat-file-link"
                                                >
                                                    📁 View Attachment
                                                </a>
                                            </div>
                                        )}

                                        {/* Inline Edit Mode or Message Text */}
                                        {isEditingThis ? (
                                            <div className="inline-edit-box">
                                                <input
                                                    type="text"
                                                    className="edit-input"
                                                    value={editDraftText}
                                                    onChange={(e) => setEditDraftText(e.target.value)}
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") submitEditing(msg._id);
                                                        if (e.key === "Escape") cancelEditing();
                                                    }}
                                                />
                                                <div className="edit-btn-row">
                                                    <button
                                                        type="button"
                                                        className="btn-save-edit"
                                                        onClick={() => submitEditing(msg._id)}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-cancel-edit"
                                                        onClick={cancelEditing}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            msg.text && <p className="message-text">{msg.text}</p>
                                        )}

                                        {/* Timestamp & Delivery/Seen Status */}
                                        <div className="message-meta-row">
                                            <span className="message-timestamp">{formatTime(msg.createdAt)}</span>
                                            {isMine && (
                                                <span
                                                    className={`message-status-tick ${
                                                        isSeen ? "tick-seen" : "tick-grey"
                                                    }`}
                                                    title={
                                                        isSeen
                                                            ? "Seen"
                                                            : isDelivered
                                                            ? "Delivered"
                                                            : "Sent"
                                                    }
                                                >
                                                    {isSeen ? "✓✓" : isDelivered ? "✓✓" : "✓"}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons: Reply for all messages, Edit/Delete for own messages */}
                                    {!isEditingThis && (
                                        <div className="msg-hover-actions">
                                            <button
                                                type="button"
                                                className="btn-msg-hover reply"
                                                title="Reply to message"
                                                onClick={() => handleStartReply(msg)}
                                            >
                                                ↩️
                                            </button>
                                            {isMine && msg.text && (
                                                <button
                                                    type="button"
                                                    className="btn-msg-hover"
                                                    title="Edit Message"
                                                    onClick={() => startEditing(msg)}
                                                >
                                                    ✏️
                                                </button>
                                            )}
                                            {isMine && (
                                                <button
                                                    type="button"
                                                    className="btn-msg-hover delete"
                                                    title="Delete Message"
                                                    onClick={() => confirmDelete(msg._id)}
                                                >
                                                    🗑️
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}

                {/* Typing Indicator */}
                {isPartnerTyping && (
                    <div className="message-row incoming">
                        <div className="typing-indicator-bubble">
                            <span>{partnerTypingName || partner?.username || "Someone"} is typing</span>
                            <span className="dot-pulse">...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* 3. Floating Emoji Quick Picker */}
            {showEmojiPicker && (
                <div className="emoji-picker-popover">
                    <div className="emoji-header">
                        <span>Quick Reactions & Emojis</span>
                        <button
                            type="button"
                            className="btn-close-emoji"
                            onClick={() => setShowEmojiPicker(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="emoji-grid">
                        {EMOJI_LIST.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                className="emoji-btn"
                                onClick={() => handleEmojiClick(emoji)}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 4. Input & Attachment Bar */}
            <div className="chat-input-bar">
                {/* Tagged / Quoted Reply Banner */}
                {replyingTo && (
                    <div className="reply-preview-bar">
                        <div className="reply-preview-content">
                            <span className="reply-preview-sender">
                                Replying to <strong>{replyingTo.sender?.username || (extractUserId(replyingTo.sender) === myUserId ? "You" : "User")}</strong>
                            </span>
                            <span className="reply-preview-snippet">
                                {replyingTo.text || (replyingTo.mediaUrl ? "📎 Attachment" : "Original message")}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn-cancel-reply"
                            onClick={handleCancelReply}
                            title="Cancel reply"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* File Preview Chip */}
                {selectedFile && (
                    <div className="file-preview-chip">
                        <span>📎 {selectedFile.name}</span>
                        <button
                            type="button"
                            className="btn-remove-file"
                            onClick={() => {
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Voice Recording Mode */}
                {isRecording ? (
                    <div className="recording-bar">
                        <div className="recording-status">
                            <span className="recording-dot">🔴</span>
                            <span className="recording-text">Recording Voice Note...</span>
                            <span className="recording-timer">{formatRecordingDuration(recordingTime)}</span>
                        </div>
                        <div className="recording-actions">
                            <button
                                type="button"
                                className="btn-cancel-recording"
                                onClick={() => stopRecording(false)}
                                title="Cancel Recording"
                            >
                                ✕ Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-send-recording"
                                onClick={() => stopRecording(true)}
                                title="Send Voice Note"
                            >
                                ➤ Send
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Normal Message Input Form */
                    <form className="input-form" onSubmit={handleSend}>
                        {/* Hidden File Input */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            onChange={(e) => {
                                if (e.target.files?.[0]) {
                                    setSelectedFile(e.target.files[0]);
                                }
                            }}
                        />

                        {/* Attachment Clip Button */}
                        <button
                            type="button"
                            className="btn-attach"
                            title="Attach Image / File"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            📎
                        </button>

                        {/* Emoji Picker Toggle Button */}
                        <button
                            type="button"
                            className="btn-emoji-toggle"
                            title="Insert Emoji"
                            onClick={() => setShowEmojiPicker((prev) => !prev)}
                        >
                            😊
                        </button>

                        {/* Text Input */}
                        <input
                            ref={textInputRef}
                            type="text"
                            className="message-input"
                            placeholder="Type a message..."
                            value={inputText}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                                if (e.key !== "Enter") {
                                    triggerTyping();
                                }
                            }}
                        />

                        {/* Voice Note Button (when text input is empty) */}
                        {!inputText.trim() && !selectedFile && (
                            <button
                                type="button"
                                className="btn-mic"
                                title="Record Voice Note"
                                onClick={startRecording}
                            >
                                🎙️
                            </button>
                        )}

                        {/* Send Button */}
                        <button
                            type="submit"
                            className="btn-send"
                            disabled={(!inputText.trim() && !selectedFile) || isSending}
                            title="Send Message"
                        >
                            {isSending ? "..." : "➤"}
                        </button>
                    </form>
                )}
            </div>

            {/* 4. Group Members & Info Modal */}
            {showGroupMembersModal && isGroup && (
                <div className="modal-backdrop" onClick={() => setShowGroupMembersModal(false)}>
                    <div className="modal-container group-info-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="group-info-header">
                            <div className="group-info-title-box">
                                <div className="group-avatar-large-wrap">
                                    {activeConversation.groupAvatar || activeConversation.avatar ? (
                                        <img
                                            src={activeConversation.groupAvatar || activeConversation.avatar}
                                            alt={activeConversation.groupName || "Group"}
                                            className="group-avatar-large-img"
                                        />
                                    ) : (
                                        <span className="group-avatar-large">👥</span>
                                    )}
                                </div>
                                <div>
                                    <h3 className="group-modal-title">{activeConversation.groupName || "Group Chat"}</h3>
                                    <p className="group-modal-subtitle">
                                        {activeConversation.participants?.length || 0} Participants
                                    </p>
                                </div>
                            </div>
                            <div className="group-modal-header-actions">
                                <button
                                    type="button"
                                    className={`btn-edit-group-info ${isEditingGroup ? "active" : ""}`}
                                    onClick={() => {
                                        setIsEditingGroup((prev) => !prev);
                                        setGroupInfoMsg({ text: "", type: "" });
                                    }}
                                    title={isEditingGroup ? "Cancel editing group info" : "Edit group photo, name & description"}
                                >
                                    {isEditingGroup ? "✕ Cancel" : "✏️ Edit Info"}
                                </button>
                                <button
                                    type="button"
                                    className="btn-close-modal"
                                    onClick={() => setShowGroupMembersModal(false)}
                                    title="Close"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Edit Group Info Form */}
                        {isEditingGroup ? (
                            <form className="group-edit-profile-form" onSubmit={handleSaveGroupInfo}>
                                {groupInfoMsg.text && (
                                    <div className={`add-member-alert ${groupInfoMsg.type}`}>
                                        {groupInfoMsg.text}
                                    </div>
                                )}

                                <div className="group-avatar-upload-box">
                                    <div className="group-avatar-preview-wrap">
                                        {editGroupAvatarPreview ? (
                                            <img
                                                src={editGroupAvatarPreview}
                                                alt="Group Avatar Preview"
                                                className="group-avatar-preview-img"
                                            />
                                        ) : (
                                            <div className="group-avatar-placeholder">
                                                <span>👥</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="group-avatar-actions">
                                        <button
                                            type="button"
                                            className="btn-select-avatar"
                                            onClick={() => groupAvatarInputRef.current?.click()}
                                        >
                                            {editGroupAvatarPreview ? "Change Group Photo" : "Upload Group Photo"}
                                        </button>
                                        {editGroupAvatarPreview && (
                                            <button
                                                type="button"
                                                className="btn-remove-avatar"
                                                onClick={handleRemoveGroupAvatar}
                                            >
                                                Remove Photo
                                            </button>
                                        )}
                                        <input
                                            ref={groupAvatarInputRef}
                                            type="file"
                                            accept="image/*"
                                            style={{ display: "none" }}
                                            onChange={handleGroupAvatarFileChange}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Group Name *</label>
                                    <input
                                        type="text"
                                        value={editGroupName}
                                        onChange={(e) => setEditGroupName(e.target.value)}
                                        placeholder="Enter group name"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Group Description</label>
                                    <textarea
                                        className="group-description-input"
                                        value={editGroupDescription}
                                        onChange={(e) => setEditGroupDescription(e.target.value)}
                                        placeholder="Add group description, rules, or topics..."
                                        rows={3}
                                        maxLength={300}
                                    />
                                </div>

                                <div className="profile-form-actions">
                                    <button
                                        type="button"
                                        className="btn-cancel-edit"
                                        onClick={() => {
                                            setIsEditingGroup(false);
                                            setEditGroupName(activeConversation.groupName || "");
                                            setEditGroupDescription(activeConversation.groupDescription || "");
                                            setEditGroupAvatarPreview(activeConversation.groupAvatar || activeConversation.avatar || "");
                                            setEditGroupAvatarFile(null);
                                        }}
                                        disabled={isSavingGroupInfo}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn-save-profile"
                                        disabled={isSavingGroupInfo || !editGroupName.trim()}
                                    >
                                        {isSavingGroupInfo ? "Saving Changes..." : "Save Group Info"}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            /* Group Description Display */
                            <div className="group-desc-section">
                                {activeConversation.groupDescription ? (
                                    <div className="group-description-display">
                                        <span className="group-desc-label">Description</span>
                                        <p className="group-desc-text">{activeConversation.groupDescription}</p>
                                    </div>
                                ) : (
                                    <div className="group-description-empty">
                                        <span>📝 No description yet. Use "Edit Info" above to set one.</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="group-members-body">
                            <div className="members-header-row">
                                <span className="members-section-label">
                                    Group Members ({activeConversation.participants?.length || 0})
                                </span>
                                <button
                                    type="button"
                                    className={`btn-toggle-add-member ${isAddingMember ? "active" : ""}`}
                                    onClick={handleToggleAddMember}
                                    title={isAddingMember ? "Close add member panel" : "Add a new member to this group"}
                                >
                                    {isAddingMember ? "✕ Close" : "+ Add Member"}
                                </button>
                            </div>

                            {/* Add Member Dropdown / Panel */}
                            {isAddingMember && (
                                <div className="add-member-panel">
                                    <div className="add-member-search-box">
                                        <span className="search-icon">🔍</span>
                                        <input
                                            type="text"
                                            placeholder="Search registered user to add..."
                                            value={searchMemberQuery}
                                            onChange={handleSearchMemberChange}
                                        />
                                    </div>

                                    {addMemberMsg.text && (
                                        <div className={`add-member-alert ${addMemberMsg.type}`}>
                                            {addMemberMsg.text}
                                        </div>
                                    )}

                                    <div className="eligible-users-list">
                                        {isSearchingMembers ? (
                                            <div className="loading-users-text">Searching users...</div>
                                        ) : availableUsers.length === 0 ? (
                                            <div className="no-users-text">
                                                {searchMemberQuery
                                                    ? "No matching users found."
                                                    : "All registered users are already members of this group!"}
                                            </div>
                                        ) : (
                                            availableUsers.map((u) => {
                                                const uId = extractUserId(u);
                                                const isAdding = addMemberLoadingId === uId;

                                                return (
                                                    <div key={uId} className="eligible-user-row">
                                                        <div className="user-avatar member-avatar-mini">
                                                            {u.avatar || u.media ? (
                                                                <img src={u.avatar || u.media} alt={u.username} className="avatar-img" />
                                                            ) : (
                                                                u.username ? u.username.charAt(0).toUpperCase() : "U"
                                                            )}
                                                        </div>
                                                        <div className="eligible-user-info">
                                                            <span className="eligible-username">{u.username || "User"}</span>
                                                            <span className="eligible-email">{u.email || ""}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="btn-action-add"
                                                            disabled={isAdding}
                                                            onClick={() => handleAddMember(u)}
                                                            title={`Add ${u.username} to group`}
                                                        >
                                                            {isAdding ? "Adding..." : "+ Add"}
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="group-members-list">
                                {(() => {
                                    const currentAdminId = extractUserId(activeConversation.groupAdmin);
                                    const iAmAdmin = !!(myUserId && currentAdminId && myUserId === currentAdminId);

                                    return activeConversation.participants?.map((member, idx) => {
                                        const mId = extractUserId(member);
                                        const isMe = !!(mId && myUserId && mId === myUserId);
                                        const isAdmin = !!(mId && currentAdminId && mId === currentAdminId);
                                        const isOnline = mId ? onlineUserIds.some((id) => extractUserId(id) === mId) : false;
                                        const isActionLoading = actionMemberLoadingId === mId;

                                        return (
                                            <div key={mId || idx} className="group-member-row">
                                                <div className="member-avatar-wrapper">
                                                    <div className="user-avatar member-avatar">
                                                        {member.avatar || member.media ? (
                                                            <img
                                                                src={member.avatar || member.media}
                                                                alt={member.username || "User"}
                                                                className="avatar-img"
                                                            />
                                                        ) : (
                                                            member.username ? member.username.charAt(0).toUpperCase() : "U"
                                                        )}
                                                    </div>
                                                    {isOnline && <span className="online-indicator"></span>}
                                                </div>

                                                <div className="member-info-col">
                                                    <div className="member-name-row">
                                                        <span className="member-username">
                                                            {member.username || "User"}
                                                        </span>
                                                        {isMe && <span className="badge-you">You</span>}
                                                        {isAdmin && <span className="badge-admin">👑 Admin</span>}

                                                        {/* Action Buttons: Admin can remove others; Member can leave themselves */}
                                                        {iAmAdmin && !isMe && (
                                                            <button
                                                                type="button"
                                                                className="btn-member-action remove"
                                                                disabled={isActionLoading}
                                                                onClick={() => handleRemoveMember(member)}
                                                                title={`Remove ${member.username || "user"} from group`}
                                                            >
                                                                {isActionLoading ? "..." : "✕ Remove"}
                                                            </button>
                                                        )}
                                                        {isMe && (
                                                            <button
                                                                type="button"
                                                                className="btn-member-action leave"
                                                                disabled={isActionLoading}
                                                                onClick={() => handleRemoveMember(member)}
                                                                title="Leave this group"
                                                            >
                                                                {isActionLoading ? "..." : "🚪 Leave"}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="member-sub-row">
                                                        <span className="member-email">{member.email || ""}</span>
                                                        <span className={`member-online-status ${isOnline ? "is-online" : "is-offline"}`}>
                                                            {isOnline ? "🟢 Online" : "⚪ Offline"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Group Admin Actions (Delete Group) */}
                            {(() => {
                                const currentAdminId = extractUserId(activeConversation.groupAdmin);
                                const iAmAdmin = !!(myUserId && currentAdminId && myUserId === currentAdminId);
                                if (!iAmAdmin) return null;

                                return (
                                    <div className="group-admin-footer">
                                        <button
                                            type="button"
                                            className="btn-danger-delete-group"
                                            onClick={handleDeleteGroup}
                                            title="Permanently delete this group and all its messages"
                                        >
                                            🗑️ Delete Group (Admin)
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};
