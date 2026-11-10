const PushSubscription = require("../model/pushSubscription.model");

// Return VAPID public key to client for subscribing
const getVapidPublicKey = (req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY || "";
    if (!publicKey) {
        return res.status(500).json({
            success: false,
            message: "VAPID public key not configured on server"
        });
    }

    return res.status(200).json({
        success: true,
        publicKey
    });
};

// Save or update push subscription for authenticated user
const saveSubscription = async (req, res) => {
    try {
        const userId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Please log in first"
            });
        }

        const subscription = req.body;

        if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            return res.status(400).json({
                success: false,
                message: "Invalid push subscription object"
            });
        }

        await PushSubscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            {
                user: userId,
                endpoint: subscription.endpoint,
                keys: subscription.keys
            },
            {
                upsert: true,
                new: true
            }
        );

        console.log(`[PushController] ✅ Saved push subscription for user ${userId} (endpoint: ${subscription.endpoint.slice(0, 40)}...)`);

        return res.status(200).json({
            success: true,
            message: "Push subscription saved successfully"
        });
    } catch (error) {
        console.error("Save subscription error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save push subscription",
            error: error.message
        });
    }
};

// Unsubscribe an endpoint
const unsubscribe = async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (endpoint) {
            await PushSubscription.deleteOne({ endpoint });
        }
        return res.status(200).json({
            success: true,
            message: "Unsubscribed successfully"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    getVapidPublicKey,
    saveSubscription,
    unsubscribe
};
