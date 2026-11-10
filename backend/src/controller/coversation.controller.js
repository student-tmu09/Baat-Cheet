const mongoose = require("mongoose");
const Conversation = require("../model/conversation.model");
const Message = require("../model/message.model");
const userModule = require("../model/user.model");
const User = userModule.User || userModule;
const { getIO } = require("../config/socket.config");
const { uploadoncloudinary } = require("../config/cloudinary.config");

// Create or get existing 1-on-1 conversation
const createConversation = async (req, res) => {
    try {
        const senderId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        const { receiverId } = req.body;

        if (!senderId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (senderId.toString() === receiverId) {
            return res.status(400).json({ success: false, message: "Cannot chat with yourself" });
        }

        if (!mongoose.isValidObjectId(receiverId)) {
            return res.status(400).json({ success: false, message: "Invalid receiver ID" });
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ success: false, message: "Receiver not found" });
        }

        // Check if conversation already exists between the two users (1-on-1 only)
        let conversation = await Conversation.findOne({
            $or: [{ isGroupChat: false }, { isGroupChat: { $exists: false } }],
            participants: { $all: [senderId, receiverId], $size: 2 }
        }).populate("participants", "username email isOnline lastSeen avatar media");

        if (conversation) {
            return res.status(200).json({ success: true, conversation });
        }

        // Create new conversation
        conversation = await Conversation.create({
            participants: [senderId, receiverId],
            isGroupChat: false
        });

        await conversation.populate("participants", "username email isOnline lastSeen avatar media");

        // Notify receiver in real time via their personal Socket.IO room
        try {
            const io = getIO();
            io.to(`user:${receiverId}`).emit("new_conversation", conversation);
        } catch (socketErr) {
            console.error("Socket emit error:", socketErr.message);
        }

        return res.status(201).json({ success: true, conversation });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Get all conversations for current logged-in user (sidebar list with unreadCount)
const getUserConversations = async (req, res) => {
    try {
        const userId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const conversations = await Conversation.find({
            participants: userId
        })
            .populate("participants", "username email isOnline lastSeen avatar media")
            .populate("groupAdmin", "username email avatar media")
            .populate("latestMessage")
            .sort({ updatedAt: -1 });

        // Calculate unread message count for each conversation
        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const unreadCount = await Message.countDocuments({
                    conversationId: conv._id,
                    sender: { $ne: userId },
                    isRead: false
                });

                return {
                    ...conv.toObject(),
                    unreadCount
                };
            })
        );

        return res.status(200).json({
            success: true,
            conversations: conversationsWithUnread
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Get single conversation details
const getConversationDetails = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!mongoose.isValidObjectId(conversationId)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID" });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        })
            .populate("participants", "username email isOnline lastSeen avatar media")
            .populate("groupAdmin", "username email avatar media")
            .populate("latestMessage");

        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found or access denied" });
        }

        return res.status(200).json({
            success: true,
            conversation,
            latestMessageText: conversation.latestMessage?.text || ""
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Create Group Conversation
const createGroupConversation = async (req, res) => {
    try {
        const senderId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        let { groupName, participantIds, groupDescription } = req.body;

        if (!senderId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!groupName || typeof groupName !== "string" || !groupName.trim()) {
            return res.status(400).json({ success: false, message: "Group name is required" });
        }

        // Support stringified array when sent via FormData
        if (typeof participantIds === "string") {
            try {
                participantIds = JSON.parse(participantIds);
            } catch {
                participantIds = participantIds.split(",").map((id) => id.trim()).filter(Boolean);
            }
        }

        if (!Array.isArray(participantIds) || participantIds.length === 0) {
            return res.status(400).json({ success: false, message: "Please select at least one participant" });
        }

        // Optional Group Avatar from file upload
        let groupAvatar = "";
        if (req.file?.path) {
            const uploadResult = await uploadoncloudinary(req.file.path);
            if (uploadResult?.secure_url) {
                groupAvatar = uploadResult.secure_url;
            }
        } else if (req.body.groupAvatar) {
            groupAvatar = req.body.groupAvatar.trim();
        }

        // Include group creator
        const uniqueParticipants = Array.from(new Set([senderId, ...participantIds]));

        const conversation = await Conversation.create({
            groupName: groupName.trim(),
            groupAvatar,
            groupDescription: (groupDescription || "").trim(),
            isGroupChat: true,
            groupAdmin: senderId,
            participants: uniqueParticipants
        });

        await conversation.populate([
            { path: "participants", select: "username email isOnline lastSeen avatar media" },
            { path: "groupAdmin", select: "username email avatar media" }
        ]);

        // Realtime notify all participants via their personal socket rooms
        try {
            const io = getIO();
            uniqueParticipants.forEach((pId) => {
                io.to(`user:${pId}`).emit("new_conversation", conversation);
            });
        } catch (socketErr) {
            console.error("Socket emit error:", socketErr.message);
        }

        return res.status(201).json({
            success: true,
            message: "Group created successfully",
            conversation
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
// Add a new member to an existing group
const addGroupMember = async (req, res) => {
    try {
        const senderId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        const { conversationId, newMemberId } = req.body;

        if (!senderId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!conversationId || !newMemberId) {
            return res.status(400).json({
                success: false,
                message: "conversationId and newMemberId are required"
            });
        }

        // 1. Check if target user exists
        const validUser = await User.findById(newMemberId).select("username email avatar media isOnline");
        if (!validUser) {
            return res.status(404).json({ success: false, message: "User to add was not found" });
        }

        // 2. Find conversation and verify it's a group
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found" });
        }

        if (!conversation.isGroupChat) {
            return res.status(400).json({ success: false, message: "Cannot add members to a 1-on-1 chat" });
        }

        // 3. Verify requester is currently in the group
        const isSenderMember = conversation.participants.some(
            (p) => p.toString() === senderId.toString()
        );
        if (!isSenderMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this group" });
        }

        // 4. Check if user is already a member
        const isAlreadyMember = conversation.participants.some(
            (p) => p.toString() === newMemberId.toString()
        );
        if (isAlreadyMember) {
            return res.status(409).json({ success: false, message: "User is already in this group" });
        }

        // 5. Add new member using $addToSet
        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { $addToSet: { participants: newMemberId } },
            { new: true }
        )
            .populate("participants", "username email isOnline lastSeen avatar media")
            .populate("groupAdmin", "username email avatar media")
            .populate("latestMessage");

        // 6. Realtime Socket Notification to all participants (existing + newly added)
        try {
            const io = getIO();
            updatedConversation.participants.forEach((p) => {
                const pId = (p._id || p.id || p).toString();
                io.to(`user:${pId}`).emit("group_member_added", {
                    conversationId,
                    conversation: updatedConversation,
                    newMember: validUser,
                    addedBy: senderId
                });
            });
        } catch (socketErr) {
            console.error("Socket emit error on add member:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: `${validUser.username} added to the group successfully`,
            conversation: updatedConversation
        });
    } catch (error) {
        console.error("Add group member error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Remove a member from group (Admin can kick members; member can leave group)
const removeGroupMember = async (req, res) => {
    try {
        const senderId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        const { conversationId, memberId } = req.body;

        if (!senderId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!conversationId || !memberId) {
            return res.status(400).json({
                success: false,
                message: "conversationId and memberId are required"
            });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found" });
        }

        if (!conversation.isGroupChat) {
            return res.status(400).json({ success: false, message: "Cannot remove members from a 1-on-1 chat" });
        }

        const adminId = (conversation.groupAdmin || "").toString();
        const isSenderAdmin = adminId === senderId.toString();
        const isSelfLeave = senderId.toString() === memberId.toString();

        // Security: Only admin can kick other members; any member can leave themselves
        if (!isSelfLeave && !isSenderAdmin) {
            return res.status(403).json({
                success: false,
                message: "Only group admin can remove other members"
            });
        }

        // Verify member is actually in the group
        const isMemberInGroup = conversation.participants.some(
            (p) => p.toString() === memberId.toString()
        );
        if (!isMemberInGroup) {
            return res.status(404).json({ success: false, message: "Member is not in this group" });
        }

        // Remove the member
        const remainingParticipants = conversation.participants.filter(
            (p) => p.toString() !== memberId.toString()
        );

        // If no members remain, delete the entire group
        if (remainingParticipants.length === 0) {
            await Conversation.findByIdAndDelete(conversationId);
            await Message.deleteMany({ conversationId });

            try {
                const io = getIO();
                io.to(`user:${memberId}`).emit("group_deleted", { conversationId });
            } catch (err) {}

            return res.status(200).json({
                success: true,
                message: "Group had no remaining members and was deleted",
                groupDeleted: true,
                conversationId
            });
        }

        // If admin left, assign admin to the first remaining member
        let newAdminId = conversation.groupAdmin;
        if (adminId === memberId.toString()) {
            newAdminId = remainingParticipants[0];
        }

        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            {
                participants: remainingParticipants,
                groupAdmin: newAdminId
            },
            { new: true }
        )
            .populate("participants", "username email isOnline lastSeen avatar media")
            .populate("groupAdmin", "username email avatar media")
            .populate("latestMessage");

        // Realtime Socket Notification
        try {
            const io = getIO();
            // Notify remaining members
            updatedConversation.participants.forEach((p) => {
                const pId = (p._id || p.id || p).toString();
                io.to(`user:${pId}`).emit("group_member_removed", {
                    conversationId,
                    conversation: updatedConversation,
                    removedMemberId: memberId,
                    removedBy: senderId,
                    isSelfLeave
                });
            });

            // Notify removed member so their UI removes the group
            io.to(`user:${memberId}`).emit("group_member_removed", {
                conversationId,
                conversation: null,
                removedMemberId: memberId,
                removedBy: senderId,
                isSelfLeave
            });
        } catch (socketErr) {
            console.error("Socket emit error on remove member:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: isSelfLeave ? "You left the group successfully" : "Member removed successfully",
            conversation: updatedConversation,
            isSelfLeave
        });
    } catch (error) {
        console.error("Remove group member error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Delete entire group (Admin only)
const deleteGroup = async (req, res) => {
    try {
        const senderId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        const { conversationId } = req.body;

        if (!senderId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!conversationId) {
            return res.status(400).json({ success: false, message: "conversationId is required" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found" });
        }

        if (!conversation.isGroupChat) {
            return res.status(400).json({ success: false, message: "Cannot delete a 1-on-1 chat" });
        }

        const adminId = (conversation.groupAdmin || "").toString();
        if (adminId !== senderId.toString()) {
            return res.status(403).json({ success: false, message: "Only group admin can delete this group" });
        }

        const participantIds = conversation.participants.map((p) => p.toString());

        await Conversation.findByIdAndDelete(conversationId);
        await Message.deleteMany({ conversationId });

        // Notify all participants in real time
        try {
            const io = getIO();
            participantIds.forEach((pId) => {
                io.to(`user:${pId}`).emit("group_deleted", { conversationId });
            });
        } catch (socketErr) {
            console.error("Socket emit error on delete group:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Group and its messages were deleted successfully",
            conversationId
        });
    } catch (error) {
        console.error("Delete group error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Update Group Profile (Name, Avatar, Description)
const updateGroupDetails = async (req, res) => {
    try {
        const senderId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        const conversationId = req.params.conversationId || req.body.conversationId;
        const { groupName, groupDescription, removeAvatar } = req.body;

        if (!senderId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!conversationId) {
            return res.status(400).json({ success: false, message: "conversationId is required" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Group conversation not found" });
        }

        if (!conversation.isGroupChat) {
            return res.status(400).json({ success: false, message: "Cannot update non-group conversation" });
        }

        // Check if user is a member of this group
        const isMember = conversation.participants.some(
            (p) => p.toString() === senderId.toString()
        );
        if (!isMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this group" });
        }

        // 1. Update Group Name if provided
        if (groupName !== undefined && typeof groupName === "string" && groupName.trim()) {
            conversation.groupName = groupName.trim();
        }

        // 2. Update Group Description if provided
        if (groupDescription !== undefined && typeof groupDescription === "string") {
            conversation.groupDescription = groupDescription.trim();
        }

        // 3. Update Group Avatar if file uploaded
        if (req.file?.path) {
            const uploadResult = await uploadoncloudinary(req.file.path);
            if (uploadResult?.secure_url) {
                conversation.groupAvatar = uploadResult.secure_url;
            }
        } else if (req.body.groupAvatar) {
            conversation.groupAvatar = req.body.groupAvatar.trim();
        } else if (removeAvatar === "true" || removeAvatar === true) {
            conversation.groupAvatar = "";
        }

        await conversation.save();

        await conversation.populate([
            { path: "participants", select: "username email isOnline lastSeen avatar media" },
            { path: "groupAdmin", select: "username email avatar media" },
            { path: "latestMessage" }
        ]);

        // Realtime notify all participants via socket
        try {
            const io = getIO();
            conversation.participants.forEach((p) => {
                const pId = (p._id || p.id || p).toString();
                io.to(`user:${pId}`).emit("group_updated", {
                    conversationId: conversation._id.toString(),
                    conversation
                });
            });
        } catch (socketErr) {
            console.error("Socket emit error on update group details:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Group details updated successfully",
            conversation
        });
    } catch (error) {
        console.error("Update group details error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createConversation,
    createGroupConversation,
    getUserConversations,
    getConversationDetails,
    addGroupMember,
    removeGroupMember,
    deleteGroup,
    updateGroupDetails,
    updateGroupProfile: updateGroupDetails
};