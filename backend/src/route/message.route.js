const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { uploadMessageFile } = require("../middleware/multer.middleware");
const {
    sendMessage,
    getmessagehistory,
    editMessage,
    deleteMessage,
    markMessagesAsSeen,
    getUnreadCount
} = require("../controller/message.controller");

// All message routes require authentication
router.use(authMiddleware);

// Seen / Unread Routes (Placed before generic /:messageId)
router.patch("/mark-seen/:conversationId", markMessagesAsSeen);
router.get("/unread-count/:conversationId", getUnreadCount);

// Send message: supports both /:conversationId and /sendmessage/:conversationId
router.post("/:conversationId", uploadMessageFile, sendMessage);
router.post("/sendmessage/:conversationId", uploadMessageFile, sendMessage);
router.post("/", uploadMessageFile, sendMessage);

// Get message history: supports /:conversationId and /getmessagehistory/:conversationId
router.get("/:conversationId", getmessagehistory);
router.get("/getmessagehistory/:conversationId", getmessagehistory);

// Edit message
router.patch("/:messageId", editMessage);
router.patch("/editmessage/:messageId", editMessage);

// Delete message
router.delete("/:messageId", deleteMessage);
router.delete("/deletemessage/:messageId", deleteMessage);

module.exports = router;
