const { Server } = require("socket.io");
const Message = require("../model/message.model");
const Conversation = require("../model/conversation.model");
const userModule = require("../model/user.model");
const User = userModule.User || userModule;

let io;

// Map to track active connections: userId -> Set of socket.id (supports multiple devices/tabs)
const onlineUsers = new Map();

const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:5173",
            credentials: true
        }
    });

    io.on("connection", async (socket) => {
        // ----------------------------------------------------
        // 1. AUTHENTICATION & SETUP
        // ----------------------------------------------------
        const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

        if (!userId) {
            console.log("Socket connection rejected: No userId provided");
            socket.disconnect(true);
            return;
        }

        console.log(`User connected: ${userId} (Socket ID: ${socket.id})`);

        // Join user's personal room for targeted 1-on-1 events (e.g. read receipts, incoming calls)
        socket.join(`user:${userId}`);

        // ----------------------------------------------------
        // 2. ONLINE / OFFLINE STATUS
        // ----------------------------------------------------
        let userSockets = onlineUsers.get(userId);

        if (!userSockets) {
            userSockets = new Set();
            onlineUsers.set(userId, userSockets);

            // User was offline and just came online on their first device/tab
            io.emit("user-online", {
                userId,
                isOnline: true
            });

            // Update user status in database
            try {
                await User.findByIdAndUpdate(userId, {
                    isOnline: true
                });
            } catch (err) {
                console.error("Error updating user online status in DB:", err.message);
            }
        }

        // Add this socket connection to the user's set of active sockets
        userSockets.add(socket.id);

        // Send list of all currently online users to the newly connected user
        socket.emit("online-users", Array.from(onlineUsers.keys()));

        // ----------------------------------------------------
        // 3. CONVERSATION ROOMS (Join / Leave)
        // ----------------------------------------------------
        socket.on("join-conversation", (conversationId) => {
            if (!conversationId) return;
            const convIdStr = conversationId.toString();
            socket.join(convIdStr);
            console.log(`User ${userId} joined conversation room: ${convIdStr}`);
        });

        socket.on("leave-conversation", (conversationId) => {
            if (!conversationId) return;
            const convIdStr = conversationId.toString();
            socket.leave(convIdStr);
            console.log(`User ${userId} left conversation room: ${convIdStr}`);
        });

        // ----------------------------------------------------
        // 4. TYPING INDICATOR
        // ----------------------------------------------------
        // Broadcasts to everyone in the conversation EXCEPT the sender
        socket.on("typing-start", async (data) => {
            const { conversationId, receiverId, userId: explicitUserId, username: explicitUsername } = data || {};
            const senderUserId = (explicitUserId || userId || socket.handshake.auth?.userId || socket.handshake.query?.userId || "").toString().trim();
            if (!senderUserId) return;

            const convIdStr = (conversationId || "").toString().trim();
            const receiverIdStr = (receiverId || "").toString().trim();

            const payload = {
                conversationId: convIdStr,
                userId: senderUserId,
                username: (explicitUsername || "").toString().trim()
            };

            console.log(`[Socket] typing-start from ${senderUserId} (${payload.username || "User"}) -> conv: ${convIdStr || "none"}, receiver: ${receiverIdStr || "none"}`);

            // 1. Broadcast to conversation room if valid
            if (convIdStr) {
                socket.to(convIdStr).emit("user-typing", payload);
            }

            // 2. Direct emit to receiver's personal user room for instant zero-latency delivery
            if (receiverIdStr) {
                io.to(`user:${receiverIdStr}`).emit("user-typing", payload);
            } else if (convIdStr) {
                try {
                    const conv = await Conversation.findById(convIdStr).select("participants");
                    if (conv && Array.isArray(conv.participants)) {
                        conv.participants.forEach((p) => {
                            const pId = (p._id || p.id || p).toString().trim();
                            if (pId !== senderUserId) {
                                io.to(`user:${pId}`).emit("user-typing", payload);
                            }
                        });
                    }
                } catch (err) {}
            }
        });

        socket.on("typing-stop", async (data) => {
            const { conversationId, receiverId, userId: explicitUserId, username: explicitUsername } = data || {};
            const senderUserId = (explicitUserId || userId || socket.handshake.auth?.userId || socket.handshake.query?.userId || "").toString().trim();
            if (!senderUserId) return;

            const convIdStr = (conversationId || "").toString().trim();
            const receiverIdStr = (receiverId || "").toString().trim();

            const payload = {
                conversationId: convIdStr,
                userId: senderUserId,
                username: (explicitUsername || "").toString().trim()
            };

            console.log(`[Socket] typing-stop from ${senderUserId} -> conv: ${convIdStr || "none"}, receiver: ${receiverIdStr || "none"}`);

            if (convIdStr) {
                socket.to(convIdStr).emit("user-stop-typing", payload);
            }

            if (receiverIdStr) {
                io.to(`user:${receiverIdStr}`).emit("user-stop-typing", payload);
            } else if (convIdStr) {
                try {
                    const conv = await Conversation.findById(convIdStr).select("participants");
                    if (conv && Array.isArray(conv.participants)) {
                        conv.participants.forEach((p) => {
                            const pId = (p._id || p.id || p).toString().trim();
                            if (pId !== senderUserId) {
                                io.to(`user:${pId}`).emit("user-stop-typing", payload);
                            }
                        });
                    }
                } catch (err) {}
            }
        });
        // ----------------------------------------------------
        // 5. MESSAGE DELIVERED & SEEN (Read Receipts)
        // ----------------------------------------------------
        // Deliver message acknowledgment from receiver
        socket.on("message_delivered", async ({ messageId, conversationId }) => {
            try {
                if (!messageId) return;
                const message = await Message.findOneAndUpdate(
                    {
                        _id: messageId,
                        sender: { $ne: userId },
                        status: "sent"
                    },
                    {
                        $set: {
                            status: "delivered",
                            deliveredAt: new Date()
                        }
                    },
                    { new: true }
                );

                if (!message) return;

                const payload = {
                    messageId: message._id.toString(),
                    conversationId: (conversationId || message.conversationId)?.toString(),
                    status: "delivered"
                };

                // Notify sender directly via personal user room
                io.to(`user:${message.sender.toString()}`).emit("message_delivered", payload);
                io.to(`user:${message.sender.toString()}`).emit("message_status_updated", payload);
                if (conversationId) {
                    io.to(conversationId.toString()).emit("message_delivered", payload);
                    io.to(conversationId.toString()).emit("message_status_updated", payload);
                }
            } catch (err) {
                console.error("Socket message_delivered error:", err.message);
            }
        });

        // Mark messages as seen when chat is open
        socket.on("mark_seen", async ({ conversationId }) => {
            if (!conversationId) return;
            try {
                const unread = await Message.find({
                    conversationId,
                    sender: { $ne: userId },
                    status: { $ne: "seen" }
                }).select("_id sender");

                if (!unread.length) {
                    io.to(`user:${userId}`).emit("unread_count_updated", {
                        conversationId: conversationId.toString(),
                        unreadCount: 0
                    });
                    return;
                }

                const ids = unread.map((m) => m._id);

                await Message.updateMany(
                    {
                        _id: { $in: ids }
                    },
                    {
                        $set: {
                            status: "seen",
                            isRead: true,
                            seenAt: new Date()
                        },
                        $addToSet: { readBy: userId }
                    }
                );

                const senderIds = [
                    ...new Set(unread.map((m) => (m.sender?._id || m.sender).toString()))
                ];

                const seenPayload = {
                    conversationId: conversationId.toString(),
                    messageIds: ids.map((id) => id.toString()),
                    seenBy: userId.toString(),
                    seenAt: new Date()
                };

                senderIds.forEach((sId) => {
                    io.to(`user:${sId}`).emit("messages_seen", seenPayload);
                });

                io.to(conversationId.toString()).emit("messages_seen", seenPayload);

                io.to(`user:${userId}`).emit("unread_count_updated", {
                    conversationId: conversationId.toString(),
                    unreadCount: 0
                });
            } catch (err) {
                console.error("Socket mark_seen error:", err.message);
            }
        });

        // ----------------------------------------------------
        // 6. WEBRTC AUDIO/VIDEO CALLING SIGNALING
        // ----------------------------------------------------
        // Call initiation
        socket.on("call-user", ({ receiverId, isVideoCall, callerName }) => {
            if (!receiverId) return;
            io.to(`user:${receiverId}`).emit("incoming-call", {
                callerId: userId,
                callerName: callerName || "Someone",
                isVideoCall: isVideoCall !== false
            });
        });

        // Forward WebRTC Offer
        socket.on("webrtc-offer", ({ receiverId, offer, callerName }) => {
            if (!receiverId || !offer) return;
            io.to(`user:${receiverId}`).emit("webrtc-offer", {
                callerId: userId,
                callerName: callerName || "Someone",
                offer
            });
        });

        // Forward WebRTC Answer
        socket.on("webrtc-answer", ({ callerId, answer }) => {
            if (!callerId || !answer) return;
            io.to(`user:${callerId}`).emit("webrtc-answer", {
                receiverId: userId,
                answer
            });
        });

        // Exchange ICE Candidates (Network paths)
        socket.on("ice-candidate", ({ targetUserId, candidate }) => {
            if (!targetUserId || !candidate) return;
            io.to(`user:${targetUserId}`).emit("ice-candidate", {
                fromUserId: userId,
                candidate
            });
        });

        // End / Reject Call
        socket.on("end-call", ({ targetUserId }) => {
            if (!targetUserId) return;
            io.to(`user:${targetUserId}`).emit("call-ended", {
                fromUserId: userId
            });
        });

        // ----------------------------------------------------
        // 7. DISCONNECTION (Handling Offline Status)
        // ----------------------------------------------------
        socket.on("disconnect", async () => {
            console.log(`Socket disconnected: ${socket.id} (User: ${userId})`);

            const sockets = onlineUsers.get(userId);
            if (!sockets) return;

            sockets.delete(socket.id);

            // User is truly offline only when ALL their devices/tabs have disconnected
            if (sockets.size === 0) {
                onlineUsers.delete(userId);
                const lastSeen = new Date();

                // Broadcast to all clients that this user went offline
                io.emit("user-offline", {
                    userId,
                    isOnline: false,
                    lastSeen
                });

                // Update database with offline status and lastSeen timestamp
                try {
                    await User.findByIdAndUpdate(userId, {
                        isOnline: false,
                        lastSeen
                    });
                } catch (err) {
                    console.error("Error updating user offline status in DB:", err.message);
                }
            }
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.IO not initialized. Call initSocket(httpServer) first.");
    }
    return io;
};

// Check if a user is currently connected and actively inside a specific conversation room
const isUserInConversation = (userId, conversationId) => {
    if (!io || !userId || !conversationId) return false;
    const cleanUserId = userId.toString().trim();
    const cleanConvId = conversationId.toString().trim();

    const userSockets = onlineUsers.get(cleanUserId);
    if (!userSockets || userSockets.size === 0) return false;

    const room = io.sockets.adapter.rooms.get(cleanConvId);
    if (!room || room.size === 0) return false;

    for (const socketId of userSockets) {
        if (room.has(socketId)) {
            return true;
        }
    }
    return false;
};

module.exports = { initSocket, getIO, isUserInConversation };