const express = require("express");
const router = express.Router();

const {
    getVapidPublicKey,
    saveSubscription,
    unsubscribe
} = require("../controller/push.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Public route to get VAPID public key
router.get("/public-key", getVapidPublicKey);

// Protected routes to manage subscriptions
router.post("/subscribe", authMiddleware, saveSubscription);
router.post("/unsubscribe", authMiddleware, unsubscribe);

module.exports = router;
