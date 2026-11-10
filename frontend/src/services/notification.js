import { api } from "./api";

// Convert base64 VAPID key to Uint8Array for PushManager
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export const isNotificationSupported = () => {
    return typeof window !== "undefined" && "Notification" in window;
};

export const getNotificationPermission = () => {
    if (!isNotificationSupported()) return "denied";
    return Notification.permission;
};

export const requestNotificationPermission = async () => {
    if (!isNotificationSupported()) return "denied";
    try {
        const permission = await Notification.requestPermission();
        return permission;
    } catch (err) {
        console.error("Error requesting notification permission:", err);
        return "denied";
    }
};

let swRegistration = null;

export const registerServiceWorker = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
        return null;
    }

    try {
        if (!swRegistration) {
            swRegistration = await navigator.serviceWorker.register("/sw.js", {
                scope: "/"
            });
            console.log("[Notification] Service Worker registered with scope:", swRegistration.scope);
        }
        return swRegistration;
    } catch (err) {
        console.warn("[Notification] Service Worker registration failed:", err.message);
        return null;
    }
};

export const subscribeUserToPush = async () => {
    if (!isNotificationSupported()) return false;

    try {
        const permission = await requestNotificationPermission();
        if (permission !== "granted") {
            console.log("[Notification] Permission not granted:", permission);
            return false;
        }

        const registration = await registerServiceWorker();
        if (!registration || !("pushManager" in registration)) {
            console.warn("[Notification] PushManager not supported in this browser");
            return false;
        }

        // Fetch server's public VAPID key
        const keyData = await api.getVapidPublicKey();
        if (!keyData?.success || !keyData?.publicKey) {
            console.warn("[Notification] Could not fetch VAPID public key from server");
            return false;
        }

        const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);

        // Check for existing subscription or create new
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey
                });
            } catch (subErr) {
                console.error("[Notification] pushManager.subscribe failed:", subErr.message);
                if (subErr.message?.includes("push service error") || subErr.name === "AbortError") {
                    console.warn(
                        "[Notification] ⚠️ BRAVE BROWSER: Push messaging is blocked by default.\n" +
                        "Please go to brave://settings/privacy and turn ON 'Use Google services for push messaging' and restart Brave."
                    );
                }
                return false;
            }
        }

        // Save subscription to backend database
        const subJson = subscription.toJSON();
        const saveRes = await api.savePushSubscription(subJson);
        console.log("[Notification] ✅ Push subscription registered on server:", saveRes);
        return true;
    } catch (err) {
        console.error("[Notification] Error subscribing to push notifications:", err);
        return false;
    }
};

// Show a direct system notification (desktop popup)
export const showSystemNotification = async (title, options = {}, onClick = null) => {
    if (!isNotificationSupported() || Notification.permission !== "granted") {
        return null;
    }

    const defaultOptions = {
        renotify: true,
        tag: "chat-message",
        ...options
    };

    // Prevent Windows native toast engine from dropping notifications with .svg icons
    if (defaultOptions.icon && defaultOptions.icon.endsWith(".svg")) {
        delete defaultOptions.icon;
    }
    if (defaultOptions.badge && defaultOptions.badge.endsWith(".svg")) {
        delete defaultOptions.badge;
    }

    try {
        // Method A: Via active Service Worker if available
        const registration = await registerServiceWorker();
        if (registration && typeof registration.showNotification === "function") {
            await registration.showNotification(title, defaultOptions);
            return true;
        }

        // Method B: Standard HTML5 Notification constructor fallback
        const notification = new Notification(title, defaultOptions);
        if (onClick) {
            notification.onclick = () => {
                window.focus();
                onClick();
                notification.close();
            };
        }
        return notification;
    } catch (err) {
        console.warn("[Notification] showSystemNotification fallback:", err.message);
        try {
            const cleanOptions = {
                body: defaultOptions.body || "",
                tag: defaultOptions.tag
            };
            const notification = new Notification(title, cleanOptions);
            if (onClick) {
                notification.onclick = () => {
                    window.focus();
                    onClick();
                    notification.close();
                };
            }
            return notification;
        } catch (fallbackErr) {
            console.error("[Notification] Failed to show notification:", fallbackErr);
            return null;
        }
    }
};

