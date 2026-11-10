const { uploadoncloudinary } = require("../config/cloudinary.config");
const userModule = require("../model/user.model");
const User = userModule.User || userModule;

// Register new user
const registeruser = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Username, email, and password are required"
            });
        }

        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username or email already exists"
            });
        }

        // Avatar image file is OPTIONAL
        let avatarUrl = "";
        if (req.file?.path) {
            const uploadResult = await uploadoncloudinary(req.file.path);
            if (uploadResult?.secure_url) {
                avatarUrl = uploadResult.secure_url;
            }
        }

        const user = await User.create({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
            avatar: avatarUrl,
            media: avatarUrl
        });

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: {
                _id: user._id,
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || user.media || "",
                media: user.media || user.avatar || ""
            }
        });
    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Login user
const loginuser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Attach session attributes if session is present
        if (req.session) {
            req.session.userId = user._id.toString();
            req.session._id = user._id.toString();
            req.session.username = user.username;
            req.session.email = user.email;

            try {
                req.session.save((saveErr) => {
                    if (saveErr) console.warn("Session save warning:", saveErr.message);
                });
            } catch (err) {
                console.warn("Session save exception:", err.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                _id: user._id,
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || user.media || "",
                media: user.media || user.avatar || ""
            }
        });
    } catch (error) {
        console.error("Login Catch Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Fetch currently authenticated user
const getcurrentuser = async (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Current user fetched successfully",
        user: req.user
    });
};

// Logout and clear session
const logoutuser = async (req, res) => {
    res.clearCookie("chat.sid");
    if (req.session) {
        try {
            req.session.destroy(() => {});
        } catch (e) {
            console.warn("Session destroy warning:", e.message);
        }
    }
    return res.status(200).json({
        success: true,
        message: "Logged out successfully"
    });
};

// Search / List registered users
const searchUser = async (req, res) => {
    try {
        const username = req.query?.username || req.query?.search || req.query?.q || req.body?.username || req.body?.search;
        const searchTerm = typeof username === "string" ? username.trim() : "";

        // If search term is provided, filter by username, otherwise return registered users
        const filter = searchTerm
            ? { username: { $regex: searchTerm, $options: "i" } }
            : {};

        if (req.user?._id) {
            filter._id = { $ne: req.user._id };
        }

        const users = await User.find(filter)
            .select("username email isOnline lastSeen avatar media")
            .limit(50);

        return res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
// Update user profile (username, avatar)
const updateProfile = async (req, res) => {
    try {
        const userId = req.user?._id?.toString() || req.headers["x-user-id"] || req.session?.userId;
        const { username } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Please log in"
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // 1. Update username if provided and changed
        if (username && typeof username === "string" && username.trim()) {
            const cleanUsername = username.trim();
            if (cleanUsername !== user.username) {
                const existing = await User.findOne({
                    username: cleanUsername,
                    _id: { $ne: user._id }
                });
                if (existing) {
                    return res.status(409).json({
                        success: false,
                        message: "Username already taken by another user"
                    });
                }
                user.username = cleanUsername;
            }
        }

        // 2. Upload avatar to Cloudinary if file provided
        if (req.file?.path) {
            const uploadResult = await uploadoncloudinary(req.file.path);
            if (uploadResult?.secure_url) {
                user.avatar = uploadResult.secure_url;
                user.media = uploadResult.secure_url;
            }
        }

        await user.save();

        if (req.session) {
            req.session.username = user.username;
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: {
                _id: user._id,
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || user.media || "",
                media: user.media || user.avatar || ""
            }
        });
    } catch (error) {
        console.error("Update Profile Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update profile"
        });
    }
};

module.exports = {
    registeruser,
    loginuser,
    getcurrentuser,
    logoutuser,
    searchUser,
    updateProfile
};
