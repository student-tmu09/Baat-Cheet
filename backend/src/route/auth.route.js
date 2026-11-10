const express = require("express");
const router = express.Router();

const {
    registeruser,
    loginuser,
    getcurrentuser,
    logoutuser,
    searchUser,
    updateProfile
} = require("../controller/auth.controller");

const authMiddleware = require("../middleware/auth.middleware");
const { uploadMessageFile } = require("../middleware/multer.middleware");

// Public routes (supports optional avatar file upload)
router.post("/register", uploadMessageFile, registeruser);
router.post("/login", loginuser);

// Protected routes
router.get("/me", authMiddleware, getcurrentuser);
router.post("/logout", authMiddleware, logoutuser);
router.get("/search", authMiddleware, searchUser);
router.post("/search", authMiddleware, searchUser);
router.put("/profile", authMiddleware, uploadMessageFile, updateProfile);
router.post("/update-profile", authMiddleware, uploadMessageFile, updateProfile);

module.exports = router;
