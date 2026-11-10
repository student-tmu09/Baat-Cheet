require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sessionMiddleware = require("./src/config/session.config");
const connectToDatabase = require("./src/middleware/db.middleware");

// Route imports
const authRoutes = require("./src/route/auth.route");
const conversationRoutes = require("./src/route/conversation.route");
const messageRoutes = require("./src/route/message.route");
const pushRoutes = require("./src/route/push.route");

const app = express();

// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware with Redis store
app.use(sessionMiddleware);

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/push", pushRoutes);

// Connect to Database
connectToDatabase();

// Central JSON Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("Unhandled Server Error:", err.stack || err.message || err);
    return res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error"
    });
});

module.exports = app;
