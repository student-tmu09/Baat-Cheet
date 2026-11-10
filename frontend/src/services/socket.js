import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

let socket = null;

export const connectSocket = (userId) => {
    const cleanUserId = userId ? (userId._id || userId.id || userId).toString().trim() : "";

    // Reuse existing socket only if connected and registered for the same user
    if (socket && socket.connected && socket.auth?.userId === cleanUserId) {
        return socket;
    }

    // Cleanly close prior connection if user changed or was disconnected
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    if (!cleanUserId) {
        return null;
    }

    socket = io(BACKEND_URL, {
        auth: { userId: cleanUserId },
        query: { userId: cleanUserId },
        withCredentials: true,
        transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
        console.log(`[Socket] Connected to server as ${cleanUserId} (Socket ID: ${socket.id})`);
    });

    socket.on("connect_error", (err) => {
        console.error("[Socket] Connection error:", err.message);
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

