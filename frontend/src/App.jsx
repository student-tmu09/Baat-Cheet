import { useState, useEffect, useCallback, useRef } from "react";
import { connectSocket, getSocket, disconnectSocket } from "./services/socket";
import { useWebRTC } from "./hooks/useWebRTC";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { AuthModal } from "./components/AuthModal";
import { ProfileModal } from "./components/ProfileModal";
import { VideoCallModal } from "./components/VideoCallModal";
import { api } from "./services/api";
import {
  subscribeUserToPush,
  showSystemNotification,
  getNotificationPermission,
  requestNotificationPermission
} from "./services/notification";
import "./App.css";

// Helper to safely extract 24-char ObjectId string from any user object/ID
const extractUserId = (obj) => {
  if (!obj) return "";
  if (typeof obj === "string") return obj.trim();
  if (typeof obj === "object") {
    if (obj._id) return extractUserId(obj._id);
    if (obj.id) return extractUserId(obj.id);
    if (obj.userId) return extractUserId(obj.userId);
    if (obj.user) return extractUserId(obj.user);
    if (typeof obj.toString === "function" && obj.toString() !== "[object Object]") {
      return obj.toString().trim();
    }
  }
  return "";
};

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = sessionStorage.getItem("auth_user") || localStorage.getItem("auth_user");
    return saved ? JSON.parse(saved) : null;
  });

  const currentUserId = extractUserId(currentUser);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authIsLogin, setAuthIsLogin] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [partnerTypingName, setPartnerTypingName] = useState("");
  const [typingConversations, setTypingConversations] = useState({});
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);

  // Initialize WebRTC hook
  const webrtc = useWebRTC(currentUserId, currentUser?.username || "");

  const activeConvRef = useRef(activeConversation);
  activeConvRef.current = activeConversation;

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // Notification permission request handler
  const handleRequestNotificationPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === "granted") {
      await subscribeUserToPush();
    }
  };

  // Auto-subscribe to push when user is logged in and permission is already granted
  useEffect(() => {
    if (currentUser) {
      const currentPerm = getNotificationPermission();
      setNotificationPermission(currentPerm);
      if (currentPerm === "granted") {
        subscribeUserToPush();
      }
    }
  }, [currentUser]);

  // Listen for Service Worker notification click messages to open conversation
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const handleSwMessage = (event) => {
        if (event.data?.type === "OPEN_CONVERSATION" && event.data?.conversationId) {
          const targetId = event.data.conversationId;
          const conv = conversationsRef.current?.find((c) => c._id === targetId);
          if (conv) {
            handleSelectConversation(conv);
          }
        }
      };

      navigator.serviceWorker.addEventListener("message", handleSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      };
    }
  }, []);

  // Sync authenticated user on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const data = await api.getMe();
        if (data?.success && data?.user) {
          setCurrentUser(data.user);
          localStorage.setItem("auth_user", JSON.stringify(data.user));
          sessionStorage.setItem("auth_user", JSON.stringify(data.user));
        }
      } catch (err) {
        console.warn("Session check failed:", err);
      }
    };
    checkAuth();
  }, []);

  // 1. Fetch conversations from backend
  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      if (data?.success && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, []);

  // 2. Select conversation & join room
  const handleSelectConversation = async (conv) => {
    const socket = getSocket();

    // Leave previous conversation room
    if (activeConvRef.current && socket) {
      socket.emit("leave-conversation", activeConvRef.current._id);
    }

    setActiveConversation(conv);
    setIsPartnerTyping(false);
    setPartnerTypingName("");
    setHasMoreMessages(false);
    setIsLoadingMore(false);

    // Reset unread count for this conversation in sidebar
    setConversations((prev) =>
      prev.map((c) => (c._id === conv?._id ? { ...c, unreadCount: 0 } : c))
    );

    // Join new conversation room
    if (socket && conv?._id) {
      socket.emit("join-conversation", conv._id);
    }

    // Load message history (initial latest 30 messages)
    try {
      const data = await api.getMessages(conv._id, null, 30);
      if (data?.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
        setHasMoreMessages(!!data.hasMore);

        // Mark conversation messages as seen
        if (conv?._id) {
          api.markMessagesSeen(conv._id).catch(() => {});
          if (socket) {
            socket.emit("mark_seen", { conversationId: conv._id });
          }
        }
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
      setHasMoreMessages(false);
    }
  };

  // 3. Start or open conversation with a searched user
  const handleStartConversationWithUser = async (user) => {
    if (!user) return;
    const targetUserId = extractUserId(user);
    if (!targetUserId) return;

    // A. Check if a 1-on-1 conversation already exists with this user (exclude group chats!)
    const existing = conversations.find((c) =>
      !c.isGroupChat &&
      c.participants?.some((p) => extractUserId(p) === targetUserId)
    );

    if (existing) {
      handleSelectConversation(existing);
      return;
    }

    // B. Optimistically open chat immediately so user never disappears!
    const tempConv = {
      _id: targetUserId,
      isTemporary: true,
      participants: [
        { _id: currentUserId, username: currentUser?.username || "You", email: currentUser?.email || "" },
        { _id: targetUserId, username: user.username, email: user.email, avatar: user.avatar || user.media || "" }
      ],
      latestMessage: null
    };

    setActiveConversation(tempConv);
    setMessages([]);
    setIsPartnerTyping(false);
    setPartnerTypingName("");

    // C. Call backend to create or fetch real conversation
    try {
      const data = await api.createConversation(targetUserId);
      if (data?.success && data?.conversation) {
        const conv = data.conversation;
        setConversations((prev) => {
          const exists = prev.some((c) => c._id === conv._id);
          return exists ? prev : [conv, ...prev];
        });
        setActiveConversation(conv);

        const socket = getSocket();
        if (socket && conv?._id) {
          socket.emit("join-conversation", conv._id);
        }

        // Fetch existing messages if any
        try {
          const msgData = await api.getMessages(conv._id, null, 30);
          if (msgData?.success && Array.isArray(msgData.messages)) {
            setMessages(msgData.messages);
            setHasMoreMessages(!!msgData.hasMore);
          }
        } catch (msgErr) {
          console.error("Failed to load messages for conversation:", msgErr);
        }
      }
    } catch (err) {
      console.error("Failed to create conversation on backend:", err);
    }
  };

  // Cursor-based pagination: Load older messages before the oldest message on screen
  const handleLoadMoreMessages = async () => {
    if (!activeConversation?._id || !hasMoreMessages || isLoadingMore || messages.length === 0) {
      return false;
    }

    const oldestMessageId = messages[0]?._id;
    if (!oldestMessageId) return false;

    setIsLoadingMore(true);
    try {
      const data = await api.getMessages(activeConversation._id, oldestMessageId, 30);
      if (data?.success && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => (m._id || m.id)?.toString()));
          const newOlderMessages = data.messages.filter((m) => !existingIds.has((m._id || m.id)?.toString()));
          return [...newOlderMessages, ...prev];
        });
        setHasMoreMessages(!!data.hasMore);
        setIsLoadingMore(false);
        return true;
      } else {
        setHasMoreMessages(false);
        setIsLoadingMore(false);
        return false;
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
      setIsLoadingMore(false);
      return false;
    }
  };

  // 4. Send Message (Text & File, optional quoted reply)
  const handleSendMessage = async (text, file, replyTo = null) => {
    if (!activeConversation) return;

    try {
      const currentConvId = activeConversation._id;
      const data = await api.sendMessage(currentConvId, text, file, replyTo);

      if (data?.success && data?.data) {
        const sentMessage = data.data;

        // Deduplicate before appending to message list
        setMessages((prev) => {
          const msgId = (sentMessage._id || sentMessage.id)?.toString();
          const exists = prev.some((m) => (m._id || m.id)?.toString() === msgId);
          return exists ? prev : [...prev, sentMessage];
        });

        // If conversation was temporary, link to real conversation
        if (activeConversation.isTemporary || activeConversation._id !== sentMessage.conversationId) {
          setActiveConversation((prev) => ({
            ...prev,
            _id: sentMessage.conversationId,
            isTemporary: false
          }));

          const socket = getSocket();
          if (socket && sentMessage.conversationId) {
            socket.emit("join-conversation", sentMessage.conversationId);
          }
        }

        // Refresh conversation list preview
        loadConversations();
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // 5. Edit and Delete Message Handlers
  const handleEditMessage = async (messageId, newText) => {
    try {
      const data = await api.editMessage(messageId, newText);
      if (data?.success && data?.data) {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? data.data : m))
        );
      }
    } catch (err) {
      console.error("Error editing message:", err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const data = await api.deleteMessage(messageId);
      if (data?.success) {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  };

  // 6. Create Group Chat Handler
  const handleCreateGroup = async (groupName, participantIds, groupAvatarFile = null, groupDescription = "") => {
    try {
      const data = await api.createGroup(groupName, participantIds, groupAvatarFile, groupDescription);
      if (data?.success && data?.conversation) {
        const groupConv = data.conversation;
        setConversations((prev) => [groupConv, ...prev]);
        handleSelectConversation(groupConv);
        return true;
      }
    } catch (err) {
      console.error("Failed to create group:", err);
    }
    return false;
  };

  // 5. Typing Indicator socket emitters
  const handleTypingStart = () => {
    const socket = getSocket();
    const activeConv = activeConvRef.current || activeConversation;
    const convId = (activeConv?._id || "")?.toString().trim();
    const myId = extractUserId(currentUserRef.current || currentUser);
    const myUsername = currentUserRef.current?.username || currentUser?.username || "Someone";

    let partnerId = "";
    if (activeConv?.isTemporary) {
      partnerId = (activeConv._id || "").toString().trim();
    } else {
      const partner = activeConv?.participants?.find((p) => extractUserId(p) !== myId);
      partnerId = extractUserId(partner);
    }

    if (socket && (convId || partnerId)) {
      console.log("[Typing] Emitting typing-start:", { convId, partnerId, myId, myUsername });
      socket.emit("typing-start", {
        conversationId: convId,
        receiverId: partnerId,
        userId: myId,
        username: myUsername
      });
    }
  };

  const handleTypingStop = () => {
    const socket = getSocket();
    const activeConv = activeConvRef.current || activeConversation;
    const convId = (activeConv?._id || "")?.toString().trim();
    const myId = extractUserId(currentUserRef.current || currentUser);
    const myUsername = currentUserRef.current?.username || currentUser?.username || "Someone";

    let partnerId = "";
    if (activeConv?.isTemporary) {
      partnerId = (activeConv._id || "").toString().trim();
    } else {
      const partner = activeConv?.participants?.find((p) => extractUserId(p) !== myId);
      partnerId = extractUserId(partner);
    }

    if (socket && (convId || partnerId)) {
      console.log("[Typing] Emitting typing-stop:", { convId, partnerId, myId });
      socket.emit("typing-stop", {
        conversationId: convId,
        receiverId: partnerId,
        userId: myId,
        username: myUsername
      });
    }
  };

  // 6. Socket.IO Event Listeners
  useEffect(() => {
    if (!currentUserId) return;

    const socket = connectSocket(currentUserId);

    socket.on("connect", () => {
      setIsConnected(true);
      if (activeConvRef.current?._id) {
        socket.emit("join-conversation", activeConvRef.current._id);
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("online-users", (users) => {
      setOnlineUserIds(users.filter((id) => id !== currentUserId));
    });

    socket.on("user-online", ({ userId }) => {
      if (userId !== currentUserId) {
        setOnlineUserIds((prev) => [...new Set([...prev, userId])]);
      }
    });

    socket.on("user-offline", ({ userId }) => {
      setOnlineUserIds((prev) => prev.filter((id) => id !== userId));
    });

    // Real-time message receiver
    socket.on("receive_message", (message) => {
      const activeId = activeConvRef.current?._id;
      const myId = extractUserId(currentUserRef.current || currentUser);
      const senderId = extractUserId(message.sender);
      const isFromMe = !!(myId && senderId && myId === senderId);

      // CRITICAL: Sender must NEVER treat their own outgoing message as an incoming received message!
      if (isFromMe) {
        if (message.conversationId === activeId) {
          setMessages((prev) => {
            const msgId = (message._id || message.id)?.toString();
            const exists = prev.some((m) => (m._id || m.id)?.toString() === msgId);
            return exists ? prev : [...prev, message];
          });
        }
        return; // STOP HERE! Do not emit message_delivered or mark_seen for my own message!
      }

      // 1. If message was sent to me by someone else:
      // Emit delivery receipt immediately because my client just received it
      socket.emit("message_delivered", {
        messageId: message._id,
        conversationId: message.conversationId
      });

      // 2. If this conversation is currently open on my screen:
      if (message.conversationId === activeId) {
        setIsPartnerTyping(false);
        setPartnerTypingName("");
        setMessages((prev) => {
          const msgId = (message._id || message.id)?.toString();
          const exists = prev.some((m) => (m._id || m.id)?.toString() === msgId);
          return exists ? prev : [...prev, message];
        });

        // Mark seen because I am actively viewing this conversation
        api.markMessagesSeen(message.conversationId).catch(() => {});
        socket.emit("mark_seen", { conversationId: message.conversationId });
      }

      // 3. Update sidebar preview and unread count:
      setConversations((prev) =>
        prev.map((c) => {
          if (c._id === message.conversationId) {
            const isCurrentlyOpen = activeId === message.conversationId;
            return {
              ...c,
              latestMessage: message,
              unreadCount: isCurrentlyOpen ? 0 : (c.unreadCount || 0) + 1,
              updatedAt: message.createdAt || new Date().toISOString()
            };
          }
          return c;
        })
      );

      // Clear typing indicator for this conversation
      if (message.conversationId) {
        setTypingConversations((prev) => {
          if (!prev[message.conversationId]) return prev;
          const next = { ...prev };
          delete next[message.conversationId];
          return next;
        });
      }

      // 4. Trigger Desktop System Notification only if NOT currently viewing this chat or tab is minimized
      const activeIdStr = (activeConvRef.current?._id || "").toString().trim();
      const messageConvIdStr = (message.conversationId || "").toString().trim();
      const isCurrentlyOpen = !!(activeIdStr && messageConvIdStr && activeIdStr === messageConvIdStr);
      const isTabMinimizedOrHidden = typeof document !== "undefined" && document.hidden;

      // If user is actively looking at this conversation on screen, do NOT show popup!
      if (!isCurrentlyOpen || isTabMinimizedOrHidden) {
        const senderName = message.sender?.username || "Someone";
        const previewText = message.text || (message.mediaUrl ? "📎 Attachment / Media" : "New message");

        showSystemNotification(senderName, {
          body: previewText,
          tag: `conversation-${messageConvIdStr}`,
          data: { conversationId: messageConvIdStr }
        }, () => {
          window.focus();
          const targetConv = conversationsRef.current?.find((c) => c._id?.toString() === messageConvIdStr);
          if (targetConv) {
            handleSelectConversation(targetConv);
          }
        });
      }
    });

    // Real-time message delivered (Single tick -> Double grey tick)
    socket.on("message_delivered", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => {
          const mId = (m._id || m.id)?.toString();
          if (mId === messageId?.toString() && m.status !== "seen" && !m.isRead) {
            return { ...m, status: "delivered" };
          }
          return m;
        })
      );
    });

    socket.on("message_status_updated", ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((m) => {
          const mId = (m._id || m.id)?.toString();
          if (mId === messageId?.toString()) {
            return {
              ...m,
              status,
              isRead: status === "seen" ? true : m.isRead
            };
          }
          return m;
        })
      );
    });

    // Real-time messages seen (Double grey tick -> Double blue tick)
    socket.on("messages_seen", ({ conversationId, seenBy, messageIds }) => {
      const myId = currentUserId?.toString();
      // CRITICAL: If I am the one who saw the messages, do not change my own outgoing messages!
      if (seenBy && myId && seenBy.toString() === myId) {
        return;
      }

      const activeId = activeConvRef.current?._id;
      if (activeId === conversationId) {
        setMessages((prev) =>
          prev.map((m) => {
            const mSenderId = (m.sender?._id || m.sender?.id || m.sender)?.toString();
            if (mSenderId === myId) {
              if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
                const isMatch = messageIds.some(
                  (id) => id?.toString() === (m._id || m.id)?.toString()
                );
                return isMatch ? { ...m, status: "seen", isRead: true } : m;
              }
              return { ...m, status: "seen", isRead: true };
            }
            return m;
          })
        );
      }
    });

    // Real-time unread count updated from server
    socket.on("unread_count_updated", ({ conversationId, unreadCount }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c._id === conversationId ? { ...c, unreadCount } : c
        )
      );
    });

    // Real-time message edited
    socket.on("message_edited", (editedMsg) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === editedMsg._id ? editedMsg : m))
      );
    });

    // Real-time message deleted
    socket.on("message_deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    });

    // New conversation created by another user
    socket.on("new_conversation", (newConv) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === newConv._id);
        return exists ? prev : [newConv, ...prev];
      });
    });

    // Real-time group member added notification
    socket.on("group_member_added", ({ conversationId, conversation: updatedConv }) => {
      if (!updatedConv) return;
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === conversationId);
        if (exists) {
          return prev.map((c) => (c._id === conversationId ? updatedConv : c));
        } else {
          return [updatedConv, ...prev];
        }
      });

      if (activeConvRef.current?._id === conversationId) {
        setActiveConversation(updatedConv);
      }
    });

    // Real-time group member removed / left notification
    socket.on("group_member_removed", ({ conversationId, conversation: updatedConv, removedMemberId }) => {
      const myId = extractUserId(currentUserRef.current || currentUser);
      const isMe = myId && removedMemberId && myId.toString() === removedMemberId.toString();

      if (isMe || !updatedConv) {
        // If I was removed/left, remove the group from my sidebar and close it if active
        setConversations((prev) => prev.filter((c) => c._id !== conversationId));
        if (activeConvRef.current?._id === conversationId) {
          setActiveConversation(null);
        }
      } else {
        // Another member was removed, update the group for remaining participants
        setConversations((prev) =>
          prev.map((c) => (c._id === conversationId ? updatedConv : c))
        );
        if (activeConvRef.current?._id === conversationId) {
          setActiveConversation(updatedConv);
        }
      }
    });

    // Real-time group deleted notification
    socket.on("group_deleted", ({ conversationId }) => {
      setConversations((prev) => prev.filter((c) => c._id !== conversationId));
      if (activeConvRef.current?._id === conversationId) {
        setActiveConversation(null);
      }
    });

    // Real-time group details updated notification (avatar, name, description)
    socket.on("group_updated", ({ conversationId, conversation: updatedConv }) => {
      if (!updatedConv?._id) return;
      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? updatedConv : c))
      );
      if (activeConvRef.current?._id === conversationId) {
        setActiveConversation(updatedConv);
      }
    });

    // Real-time typing indicators
    const typingTimeouts = new Map();

    socket.on("user-typing", ({ conversationId, userId, username }) => {
      const myId = extractUserId(currentUserRef.current || currentUser);
      const typerId = extractUserId(userId);
      if (!typerId || typerId === myId) return;

      const activeConv = activeConvRef.current;
      const incomingConvId = (conversationId || "").toString().trim();
      const currentConvId = (activeConv?._id || "").toString().trim();

      const partner = activeConv?.participants?.find((p) => extractUserId(p) !== myId);
      const partnerId = extractUserId(partner);

      console.log("[Typing] Received user-typing event:", { incomingConvId, typerId, username, currentConvId, partnerId });

      // 1. Update sidebar typing indicators for this conversation
      if (incomingConvId) {
        setTypingConversations((prev) => ({
          ...prev,
          [incomingConvId]: { userId: typerId, username: username || "User" }
        }));
      }

      // 2. Check if this typing event matches the currently opened chat
      const isMatch = (incomingConvId && currentConvId && incomingConvId === currentConvId) ||
                      (partnerId && typerId && partnerId === typerId) ||
                      (currentConvId && typerId && currentConvId === typerId);

      if (isMatch) {
        setIsPartnerTyping(true);
        if (username) setPartnerTypingName(username);
      }

      // 3. Safety auto-expire timer (3.5s) if user-stop-typing is dropped
      const timeoutKey = incomingConvId || typerId;
      if (typingTimeouts.has(timeoutKey)) {
        clearTimeout(typingTimeouts.get(timeoutKey));
      }

      const timer = setTimeout(() => {
        if (incomingConvId) {
          setTypingConversations((prev) => {
            if (!prev[incomingConvId]) return prev;
            const next = { ...prev };
            delete next[incomingConvId];
            return next;
          });
        }
        if (isMatch) {
          setIsPartnerTyping(false);
          setPartnerTypingName("");
        }
        typingTimeouts.delete(timeoutKey);
      }, 3500);

      typingTimeouts.set(timeoutKey, timer);
    });

    socket.on("user-stop-typing", ({ conversationId, userId }) => {
      const myId = extractUserId(currentUserRef.current || currentUser);
      const typerId = extractUserId(userId);
      if (!typerId || typerId === myId) return;

      const activeConv = activeConvRef.current;
      const incomingConvId = (conversationId || "").toString().trim();
      const currentConvId = (activeConv?._id || "").toString().trim();

      const partner = activeConv?.participants?.find((p) => extractUserId(p) !== myId);
      const partnerId = extractUserId(partner);

      console.log("[Typing] Received user-stop-typing event:", { incomingConvId, typerId, currentConvId, partnerId });

      const timeoutKey = incomingConvId || typerId;
      if (typingTimeouts.has(timeoutKey)) {
        clearTimeout(typingTimeouts.get(timeoutKey));
        typingTimeouts.delete(timeoutKey);
      }

      if (incomingConvId) {
        setTypingConversations((prev) => {
          if (!prev[incomingConvId]) return prev;
          const next = { ...prev };
          delete next[incomingConvId];
          return next;
        });
      }

      const isMatch = (incomingConvId && currentConvId && incomingConvId === currentConvId) ||
                      (partnerId && typerId && partnerId === typerId) ||
                      (currentConvId && typerId && currentConvId === typerId);

      if (isMatch) {
        setIsPartnerTyping(false);
        setPartnerTypingName("");
      }
    });

    loadConversations();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("online-users");
      socket.off("user-online");
      socket.off("user-offline");
      socket.off("receive_message");
      socket.off("message_delivered");
      socket.off("message_status_updated");
      socket.off("messages_seen");
      socket.off("unread_count_updated");
      socket.off("message_edited");
      socket.off("message_deleted");
      socket.off("new_conversation");
      socket.off("group_member_added");
      socket.off("group_member_removed");
      socket.off("group_deleted");
      socket.off("group_updated");
      socket.off("user-typing");
      socket.off("user-stop-typing");
    };
  }, [currentUserId, loadConversations]);

  // Group updated callback (member added, removed, etc.)
  const handleGroupUpdated = (updatedConv) => {
    if (!updatedConv?._id) return;
    setActiveConversation(updatedConv);
    setConversations((prev) =>
      prev.map((c) => (c._id === updatedConv._id ? updatedConv : c))
    );
  };

  // Group deleted or left callback
  const handleGroupDeleted = (convId) => {
    if (!convId) return;
    setActiveConversation((prev) => (prev?._id === convId ? null : prev));
    setConversations((prev) => prev.filter((c) => c._id !== convId));
  };

  // Auth Handlers
  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem("auth_user", JSON.stringify(user));
    sessionStorage.setItem("auth_user", JSON.stringify(user));
    setIsAuthOpen(false);
  };

  const handleProfileUpdated = (updatedUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem("auth_user", JSON.stringify(updatedUser));
    sessionStorage.setItem("auth_user", JSON.stringify(updatedUser));
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error("Logout error:", err);
    }
    disconnectSocket();
    setCurrentUser(null);
    setActiveConversation(null);
    setConversations([]);
    setMessages([]);
    localStorage.removeItem("auth_user");
    sessionStorage.removeItem("auth_user");
    setIsConnected(false);
  };

  const handleOpenAuth = (isLoginMode) => {
    setAuthIsLogin(isLoginMode);
    setIsAuthOpen(true);
  };

  return (
    <div className="chat-app-root">
      {/* 1. Top Navbar */}
      <Navbar
        currentUser={currentUser}
        isConnected={isConnected}
        notificationPermission={notificationPermission}
        onRequestNotification={handleRequestNotificationPermission}
        onOpenAuth={handleOpenAuth}
        onOpenProfile={() => setIsProfileOpen(true)}
        onLogout={handleLogout}
      />

      {/* 2. Main Chat Layout (Sidebar + Chat Area) */}
      <div className="chat-layout">
        {currentUser ? (
          <>
            <Sidebar
              conversations={conversations}
              activeConversation={activeConversation}
              onSelectConversation={handleSelectConversation}
              onStartConversationWithUser={handleStartConversationWithUser}
              onCreateGroup={handleCreateGroup}
              onlineUserIds={onlineUserIds}
              currentUserId={currentUserId}
              typingConversations={typingConversations}
            />

            <ChatArea
              activeConversation={activeConversation}
              currentUserId={currentUserId}
              messages={messages}
              isPartnerTyping={isPartnerTyping}
              partnerTypingName={partnerTypingName}
              onlineUserIds={onlineUserIds}
              hasMoreMessages={hasMoreMessages}
              isLoadingMore={isLoadingMore}
              onLoadMoreMessages={handleLoadMoreMessages}
              onSendMessage={handleSendMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onStartCall={webrtc.startCall}
              onTypingStart={handleTypingStart}
              onTypingStop={handleTypingStop}
              onGroupUpdated={handleGroupUpdated}
              onGroupDeleted={handleGroupDeleted}
            />
          </>
        ) : (
          <div className="guest-welcome-screen">
            <div className="welcome-box">
              <span className="welcome-logo">💬</span>
              <h2>Welcome to BaatCheet Chat & Calling</h2>
              <p>Connect with friends, send messages, share files, and make real-time audio and video calls.</p>
              <div className="welcome-actions">
                <button className="btn-welcome signin" onClick={() => handleOpenAuth(true)}>
                  Sign In
                </button>
                <button className="btn-welcome register" onClick={() => handleOpenAuth(false)}>
                  Create an Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Authentication Modal Popup */}
      {isAuthOpen && (
        <div className="modal-backdrop" onClick={() => setIsAuthOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-modal" onClick={() => setIsAuthOpen(false)}>
              ✕
            </button>
            <AuthModal
              initialIsLogin={authIsLogin}
              onAuthSuccess={handleAuthSuccess}
            />
          </div>
        </div>
      )}

      {/* 4. Profile Edit Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={handleProfileUpdated}
      />

      {/* 5. WebRTC Audio & Video Calling Modal */}
      <VideoCallModal {...webrtc} />
    </div>
  );
}

export default App;
