const webpush = require("web-push");

const subject = process.env.VAPID_SUBJECT || "mailto:admin@batcheet.com";
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
    } catch (err) {
        console.error("[WebPush] Failed to initialize VAPID details:", err.message);
    }
} else {
    console.warn("[WebPush] VAPID keys not configured in environment variables.");
}

module.exports = webpush;
