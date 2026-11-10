const mongoose = require("mongoose");
const webpush = require("../config/webpush.config");
const PushSubscription = require("../model/pushSubscription.model");

const sendPushNotification = async (userId, payload) => {
    try {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.warn("[PushService] ⚠️ VAPID keys not configured in backend/.env");
            return;
        }

        const cleanUserId = (userId?._id || userId?.id || userId)?.toString().trim();
        if (!cleanUserId) return;

        // Query by both ObjectId and String to guarantee a match
        const userQuery = mongoose.isValidObjectId(cleanUserId)
            ? { $or: [{ user: new mongoose.Types.ObjectId(cleanUserId) }, { user: cleanUserId }] }
            : { user: cleanUserId };

        const subscriptions = await PushSubscription.find(userQuery);

        if (!subscriptions || subscriptions.length === 0) {
            console.log(`[PushService] ℹ️ User ${cleanUserId} has 0 registered push subscriptions in DB. (User must click 'Enable Notifications' on their browser while logged in).`);
            return;
        }

        console.log(`[PushService] 🚀 Sending Web Push to ${subscriptions.length} device(s) for user ${cleanUserId}...`);

        const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: sub.keys
                };

                try {
                    await webpush.sendNotification(
                        pushSubscription,
                        JSON.stringify(payload)
                    );
                    console.log(`[PushService] ✅ Push notification delivered successfully to endpoint: ${sub.endpoint.slice(0, 40)}...`);
                } catch (error) {
                    // Subscription expired or invalid (404 or 410 Gone)
                    if (error.statusCode === 404 || error.statusCode === 410) {
                        console.log(`[PushService] 🗑️ Subscription expired (404/410), removing from DB.`);
                        await PushSubscription.deleteOne({ _id: sub._id });
                    } else {
                        console.error(`[PushService] ❌ Push send error (${error.statusCode || "unknown"}):`, error.message);
                    }
                }
            })
        );
    } catch (err) {
        console.error("[PushService] sendPushNotification error:", err.message);
    }
};

module.exports = { sendPushNotification };
