const mongoose = require("mongoose");
const Message = require("../model/message.model");
const Conversation = require("../model/conversation.model");
const userModule = require("../model/user.model");
const User = userModule.User || userModule;
const { getIO, isUserInConversation } = require("../config/socket.config");
const { uploadoncloudinary } = require("../config/cloudinary.config");
const { sendPushNotification } =
    require("../services/push.service");
// Send message (handles text, file uploads, conversationId or receiverId)
const sendMessage = async (req, res, next) => {
    try {
        const senderId = req.session?.userId;
        

        // 1. Auth check
        if (!senderId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Please log in first via /api/auth/login"
            });
        }

        // Support conversationId from params OR body, or receiverId
        const targetId = req.params.conversationId || req.body?.conversationId || req.body?.receiverId;
        const text = req.body?.text || req.body?.message || req.body?.content;
        const replyTo = req.body?.replyTo;

        if (!targetId || !mongoose.isValidObjectId(targetId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversationId or receiverId. Please provide a valid 24-character MongoDB ObjectId in the URL (/api/messages/:conversationId) or in request body."
            });
        }

        const hasText = typeof text === "string" && text.trim().length > 0;
        const hasFile = !!req.file;

        if (!hasText && !hasFile) {
            return res.status(400).json({
                success: false,
                message: "Message must contain either text ('text' field) or a file ('file' field)"
            });
        }

        // 2. Find conversation by conversationId
        let conversation = await Conversation.findOne({
            _id: targetId,
            participants: senderId
        });

        // 3. Fallback: If targetId is not a conversation, check if it's a receiver's userId
        if (!conversation) {
            const receiver = await User.findById(targetId);
            if (receiver) {
                if (targetId.toString() === senderId.toString()) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot send a message to yourself"
                    });
                }

                // Find existing conversation between sender and receiver
                conversation = await Conversation.findOne({
                    participants: { $all: [senderId, targetId], $size: 2 }
                });

                // Auto-create conversation if it does not exist yet
                if (!conversation) {
                    conversation = await Conversation.create({
                        participants: [senderId, targetId],
                        isGroupChat: false
                    });
                }
            }
        }

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or access denied. Ensure you are a participant of this conversation."
            });
        }

        const conversationId = conversation._id;

        // 4. Handle file upload to Cloudinary if file is attached
        let mediaUrl = "";
        if (hasFile) {
            if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
                return res.status(500).json({
                    success: false,
                    message: "Cloudinary credentials missing in .env. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
                });
            }

            const uploadResult = await uploadoncloudinary(req.file.path);
            if (!uploadResult || !uploadResult.secure_url) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload file to Cloudinary. Please check Cloudinary configuration."
                });
            }
            mediaUrl = uploadResult.secure_url;
        }

        // 5. Save message to MongoDB (supporting quoted reply)
        const messageData = {
            conversationId,
            sender: senderId,
            text: hasText ? text.trim() : "",
            mediaUrl
        };
        if (replyTo && mongoose.isValidObjectId(replyTo)) {
            messageData.replyTo = replyTo;
        }

        const message = await Message.create(messageData);

        // 6. Update conversation latestMessage and updatedAt
        conversation.latestMessage = message._id;
        await conversation.save();

        // Populate sender and replyTo info for response and socket broadcast
        await message.populate([
            { path: "sender", select: "username email isOnline avatar media" },
            {
                path: "replyTo",
                select: "text mediaUrl sender createdAt",
                populate: { path: "sender", select: "username email avatar media" }
            }
        ]);

        // 7. Emit real-time message via Socket.IO
        try {
            const io = getIO();
            // Emit to active conversation room
            io.to(conversationId.toString()).emit("receive_message", message);

            // ALSO emit to each participant's personal room (so users on sidebar or outside this chat get the message)
            if (conversation.participants && Array.isArray(conversation.participants)) {
                conversation.participants.forEach((p) => {
                    const pId = (p._id || p.id || p).toString();
                    if (pId !== senderId.toString()) {
                        io.to(`user:${pId}`).emit("receive_message", message);
                    }
                });
            }
        } catch (socketErr) {
            console.error("Socket emit error (non-fatal):", socketErr.message);
        }
        // 8. Send push notifications to other participants (non-blocking)
        try {
            const senderName = req.user?.username || "Someone";
            const messagePreview = hasText ? text : (hasFile ? "📎 Attachment / Media" : "New message");
            const notificationPayload = {
                title: conversation.isGroupChat
                    ? `${conversation.groupName || "Group"}: ${senderName}`
                    : senderName,
                body: messagePreview,
                data: {
                    conversationId: conversationId.toString(),
                    senderId: senderId.toString()
                },
                tag: `conversation-${conversationId}`
            };

            if (conversation.participants && Array.isArray(conversation.participants)) {
                conversation.participants.forEach((p) => {
                    const pId = (p._id || p.id || p).toString();
                    if (pId !== senderId.toString()) {
                        // If participant is actively inside this conversation room on Socket.IO, skip push notification
                        if (isUserInConversation(pId, conversationId)) {
                            console.log(`[Push] User ${pId} is actively in conversation ${conversationId}, skipping push.`);
                            return;
                        }

                        sendPushNotification(pId, notificationPayload).catch((pushErr) => {
                            console.error(`[Push] Failed for user ${pId}:`, pushErr.message);
                        });
                    }
                });
            }
        } catch (pushErr) {
            console.error("[Push] Trigger error (non-fatal):", pushErr.message);
        }
        return res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: message
        });
    } catch (error) {
        console.error("SendMessage Error:", error);
        next(error);
    }
};

// Fetch message history for a conversation with Cursor Pagination
const getmessagehistory = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId =req.session?.userId;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
        const { before } = req.query; // Cursor: ObjectId string of the oldest message on client
      
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
        }

        if (!mongoose.isValidObjectId(conversationId)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID" });
        }

        // Verify participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        });

        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found or access denied" });
        }

        const query = { conversationId };

        // If before cursor is provided, fetch messages older than the cursor (_id < before)
        if (before && mongoose.isValidObjectId(before)) {
            query._id = { $lt: new mongoose.Types.ObjectId(before) };
        }

        // Fetch descending (_id: -1) to get the most recent messages before the cursor
        const messages = await Message.find(query)
            .populate("sender", "username email avatar media")
            .populate({
                path: "replyTo",
                select: "text mediaUrl sender createdAt",
                populate: { path: "sender", select: "username email avatar media" }
            })
            .sort({ _id: -1 })
            .limit(limit)
            .lean();

        // Reverse back to chronological order (oldest to newest) for client display
        messages.reverse();

        const hasMore = messages.length === limit;
        const nextCursor = messages.length > 0 ? messages[0]._id : null;

        return res.status(200).json({
            success: true,
            messages,
            nextCursor,
            hasMore
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Edit message
const editMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const { text } = req.body;
        const userId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!mongoose.isValidObjectId(messageId)) {
            return res.status(400).json({ success: false, message: "Invalid message ID" });
        }

        if (typeof text !== "string" || !text.trim()) {
            return res.status(400).json({ success: false, message: "Message text is required" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        // Check ownership
        if (message.sender.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "You cannot edit this message" });
        }

        message.text = text.trim();
        await message.save();

        try {
            const io = getIO();
            io.to(message.conversationId.toString()).emit("message_edited", message);
        } catch (socketErr) {
            console.error("Socket emit error:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Message updated successfully",
            data: message
        });
    } catch (error) {
        next(error);
    }
};

const deleteMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const userId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!mongoose.isValidObjectId(messageId)) {
            return res.status(400).json({ success: false, message: "Invalid message ID" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        if (message.sender.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "You cannot delete this message" });
        }

        await Message.findByIdAndDelete(messageId);

        try {
            const io = getIO();
            io.to(message.conversationId.toString()).emit("message_deleted", {
                messageId: message._id.toString(),
                conversationId: message.conversationId.toString()
            });
        } catch (socketErr) {
            console.error("Socket emit error:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Message deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

// Mark messages as seen/read in a conversation
const markMessagesAsSeen = async (req, res, next) => {
    try {
        const conversationId = req.params.conversationId || req.body?.conversationId;
        const userId = req.session?.userId || req.user?._id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID" });
        }

        const unread = await Message.find({
            conversationId,
            sender: { $ne: userId },
            status: { $ne: "seen" }
        }).select("_id");

        const messageIds = unread.map((m) => m._id.toString());

        const result = await Message.updateMany(
            {
                conversationId,
                sender: { $ne: userId },
                status: { $ne: "seen" }
            },
            {
                $set: { status: "seen", isRead: true, seenAt: new Date() },
                $addToSet: { readBy: userId }
            }
        );

        // Real-time broadcast: notify everyone in conversation room & participants
        try {
            const io = getIO();
            const payload = {
                conversationId: conversationId.toString(),
                messageIds,
                seenBy: userId.toString(),
                seenAt: new Date()
            };

            io.to(conversationId.toString()).emit("messages_seen", payload);

            // Also emit to all participants in their personal user rooms
            const conversation = await Conversation.findById(conversationId);
            if (conversation && conversation.participants) {
                conversation.participants.forEach((pId) => {
                    io.to(`user:${pId.toString()}`).emit("messages_seen", payload);
                });
            }

            // Update unread count for current user to 0
            io.to(`user:${userId.toString()}`).emit("unread_count_updated", {
                conversationId: conversationId.toString(),
                unreadCount: 0
            });
        } catch (socketErr) {
            console.error("Socket emit error in markMessagesAsSeen:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Messages marked as seen",
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("markMessagesAsSeen Error:", error);
        next(error);
    }
};

// Get unread message count for a specific conversation
const getUnreadCount = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.session?.userId || req.user?._id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID" });
        }

        const count = await Message.countDocuments({
            conversationId,
            sender: { $ne: userId },
            isRead: false
        });

        try {
            const io = getIO();
            io.to(`user:${userId.toString()}`).emit("unread_count_updated", {
                conversationId: conversationId.toString(),
                unreadCount: count
            });
        } catch (socketErr) {
            console.error("Socket emit error in getUnreadCount:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            conversationId,
            unreadCount: count
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    sendMessage,
    getmessagehistory,
    editMessage,
    deleteMessage,
    markMessagesAsSeen,
    getUnreadCount
};
