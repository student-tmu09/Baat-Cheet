import React, { useState } from "react";
import { api } from "../services/api";
import { GroupModal } from "./GroupModal";

export const Sidebar = ({
    conversations,
    activeConversation,
    onSelectConversation,
    onStartConversationWithUser,
    onCreateGroup,
    onlineUserIds,
    currentUserId,
    typingConversations = {}
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    // Get the other user in 1-on-1 chat
    const getPartner = (conversation) => {
        if (!conversation?.participants) return { username: "User" };
        const myId = (currentUserId || "").toString().trim();
        const partner = conversation.participants.find(
            (p) => (p._id || p.id || p)?.toString().trim() !== myId
        );
        return partner || conversation.participants[0] || { username: "User" };
    };

    const handleSearchFocus = async () => {
        setIsSearching(true);
        if (searchResults.length === 0) {
            try {
                const data = await api.searchUsers(searchQuery.trim());
                if (data?.success && Array.isArray(data.users)) {
                    setSearchResults(data.users.filter((u) => (u._id || u.id) !== currentUserId));
                }
            } catch (err) {
                console.error("Focus search error:", err);
            }
        }
    };

    const handleSearchChange = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        setIsSearching(true);

        try {
            const data = await api.searchUsers(query.trim());
            if (data?.success && Array.isArray(data.users)) {
                // Filter out current user from search
                setSearchResults(data.users.filter((u) => (u._id || u.id) !== currentUserId));
            } else {
                setSearchResults([]);
            }
        } catch (err) {
            console.error("Search error:", err);
            setSearchResults([]);
        }
    };

    const handleSelectSearchResult = (user) => {
        setSearchQuery("");
        setSearchResults([]);
        setIsSearching(false);
        onStartConversationWithUser(user);
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return "";
        try {
            const date = new Date(dateStr);
            return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    };

    return (
        <aside className="chat-sidebar">
            {/* Top Search Bar */}
            <div className="sidebar-search-box">
                <span className="search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search users to chat..."
                    value={searchQuery}
                    onFocus={handleSearchFocus}
                    onChange={handleSearchChange}
                />
                {searchQuery && (
                    <button
                        className="btn-clear-search"
                        onClick={() => {
                            setSearchQuery("");
                            setSearchResults([]);
                            setIsSearching(false);
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Search Results Dropdown List */}
            {isSearching && (
                <div className="search-results-panel">
                    <div className="panel-title">Found Users</div>
                    {searchResults.length === 0 ? (
                        <div className="empty-search">No user found matching "{searchQuery}"</div>
                    ) : (
                        searchResults.map((user) => {
                            const isOnline = onlineUserIds.includes(user._id);
                            return (
                                <div
                                    key={user._id}
                                    className="search-item"
                                    onClick={() => handleSelectSearchResult(user)}
                                >
                                    <div className="avatar-wrapper">
                                        <div className="user-avatar">
                                            {user.avatar || user.media ? (
                                                <img
                                                    src={user.avatar || user.media}
                                                    alt={user.username}
                                                    className="avatar-img"
                                                />
                                            ) : (
                                                user.username ? user.username.charAt(0).toUpperCase() : "U"
                                            )}
                                        </div>
                                        {isOnline && <span className="online-indicator"></span>}
                                    </div>
                                    <div className="user-details">
                                        <span className="search-username">{user.username}</span>
                                        <span className="search-email">{user.email}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-start-chat"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectSearchResult(user);
                                        }}
                                    >
                                        Chat
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Conversations List Header */}
            <div className="conversations-header">
                <span>Recent Chats ({conversations.length})</span>
                {onCreateGroup && (
                    <button
                        type="button"
                        className="btn-new-group"
                        onClick={() => setIsGroupModalOpen(true)}
                        title="Create New Group"
                    >
                        + New Group
                    </button>
                )}
            </div>

            {/* Conversations List */}
            <div className="conversations-list">
                {conversations.length === 0 ? (
                    <div className="empty-conversations">
                        <p>💬 No conversations yet.</p>
                        <span>Search for a registered user above or create a group to start chatting!</span>
                    </div>
                ) : (
                    conversations.map((conv) => {
                        const isGroup = !!conv.isGroupChat;
                        const partner = isGroup ? null : getPartner(conv);
                        const partnerId = (partner?._id || partner?.id)?.toString();
                        const isOnline = partnerId ? onlineUserIds.some((id) => (id?._id || id?.id || id)?.toString() === partnerId) : false;
                        const isActive = activeConversation?._id === conv._id;

                        const displayName = isGroup ? conv.groupName || "Unnamed Group" : partner?.username;
                        const avatarUrl = isGroup ? (conv.groupAvatar || conv.avatar || null) : (partner?.avatar || partner?.media);
                        const avatarChar = isGroup ? "👥" : (partner?.username ? partner.username.charAt(0).toUpperCase() : "U");

                        const latestText = conv.latestMessage?.text ||
                            (conv.latestMessage?.mediaUrl ? "📎 Attachment" : (isGroup ? "Group created" : "Started a chat"));

                        const time = formatTime(conv.latestMessage?.createdAt || conv.updatedAt);

                        return (
                            <div
                                key={conv._id}
                                className={`conversation-item ${isActive ? "active" : ""}`}
                                onClick={() => onSelectConversation(conv)}
                            >
                                <div className="avatar-wrapper">
                                    <div className={`user-avatar ${isGroup ? "group-avatar" : ""}`}>
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt={displayName || "User"}
                                                className="avatar-img"
                                            />
                                        ) : (
                                            avatarChar
                                        )}
                                    </div>
                                    {!isGroup && isOnline && <span className="online-indicator"></span>}
                                </div>

                                <div className="conversation-info">
                                    <div className="conv-top-row">
                                        <span className="partner-name">{displayName}</span>
                                        <span className="conv-time">{time}</span>
                                    </div>
                                    <div className="conv-bottom-row">
                                        {(() => {
                                            const convIdStr = (conv._id || "").toString().trim();
                                            const typingInfo = typingConversations?.[convIdStr];
                                            if (typingInfo) {
                                                return (
                                                    <span className="sidebar-typing-indicator">
                                                        ✍️ {isGroup && typingInfo.username ? `${typingInfo.username} is typing` : "typing"}
                                                        <span className="dot-pulse">...</span>
                                                    </span>
                                                );
                                            }
                                            return <span className="latest-preview">{latestText}</span>;
                                        })()}
                                        {conv.unreadCount > 0 && (
                                            <span className="unread-badge">
                                                {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Create Group Modal */}
            <GroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                onCreateGroup={onCreateGroup}
                currentUserId={currentUserId}
            />
        </aside>
    );
};

