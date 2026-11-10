const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { uploadMessageFile } = require("../middleware/multer.middleware");
const {
    createConversation,
    createGroupConversation,
    getUserConversations,
    getConversationDetails,
    addGroupMember,
    removeGroupMember,
    deleteGroup,
    updateGroupDetails
} = require("../controller/coversation.controller");

// All conversation routes require authentication
router.use(authMiddleware);

// RESTful routes
router.get("/", getUserConversations);
router.post("/", createConversation);
router.post("/group", uploadMessageFile, createGroupConversation);
router.put("/group/:conversationId", uploadMessageFile, updateGroupDetails);
router.post("/group/update", uploadMessageFile, updateGroupDetails);
router.put("/group/update", uploadMessageFile, updateGroupDetails);
router.post("/group/add-member", addGroupMember);
router.post("/add-member", addGroupMember);
router.post("/group/remove-member", removeGroupMember);
router.post("/remove-member", removeGroupMember);
router.post("/group/delete", deleteGroup);
router.delete("/group/:conversationId", deleteGroup);
router.get("/:conversationId", getConversationDetails);

// Legacy routes & aliases
router.post("/createconversation", createConversation);
router.get("/getUserConversations", getUserConversations);
router.get("/getconversationdetail/:conversationId", getConversationDetails);

module.exports = router;

