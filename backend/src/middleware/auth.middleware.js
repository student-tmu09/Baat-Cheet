const userModule = require("../model/user.model");
const User = userModule.User || userModule;

const authMiddleware = async (req, res, next) => {
    try {
        const headerUserId = req.headers["x-user-id"];
        const sessionUserId = req.session?.userId;
        const targetUserId = headerUserId || sessionUserId;

        if (!targetUserId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Please log in"
            });
        }

        const user = await User.findById(targetUserId).select("-password");
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User session valid, but user no longer exists"
            });
        }

        // Attach user document to request object
        req.user = user;
        if (req.session) {
            req.session.userId = user._id.toString();
        }
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Authentication error",
            error: error.message
        });
    }
};

module.exports = authMiddleware;

