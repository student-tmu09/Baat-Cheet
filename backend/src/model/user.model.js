const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        media:{
            type:String
        },
        isOnline: {
            type: Boolean,
            default: false
        },
        avatar:{
            type:String,
            
        },
        lastSeen: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

// Hash password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// Compare password (handles both bcrypt hash and legacy plain text fallback)
userSchema.methods.comparePassword = async function (enteredPassword) {
    if (!enteredPassword || !this.password) return false;

    // If password was stored as plain text (e.g. before bcrypt was installed)
    if (!this.password.startsWith("$2a$") && !this.password.startsWith("$2b$") && !this.password.startsWith("$2y$")) {
        return this.password === enteredPassword;
    }

    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = { User };
