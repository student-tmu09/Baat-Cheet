import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";

export const ProfileModal = ({ isOpen, onClose, currentUser, onProfileUpdated }) => {
    const [username, setUsername] = useState("");
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && currentUser) {
            setUsername(currentUser.username || "");
            setAvatarFile(null);
            setAvatarPreview(currentUser.avatar || currentUser.media || "");
            setError("");
            setSuccessMsg("");
        }
    }, [isOpen, currentUser]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate image type
            if (!file.type.startsWith("image/")) {
                setError("Please select a valid image file (PNG, JPG, WEBP, etc.)");
                return;
            }
            // Max file size: 5MB
            if (file.size > 5 * 1024 * 1024) {
                setError("Image file size must be less than 5MB");
                return;
            }

            setError("");
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveSelectedFile = () => {
        setAvatarFile(null);
        setAvatarPreview(currentUser?.avatar || currentUser?.media || "");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");

        const cleanUsername = username.trim();
        if (!cleanUsername) {
            setError("Username cannot be empty");
            return;
        }

        // Check if anything actually changed
        const isUsernameChanged = cleanUsername !== currentUser?.username;
        const isAvatarChanged = !!avatarFile;

        if (!isUsernameChanged && !isAvatarChanged) {
            setError("No changes made to update");
            return;
        }

        setLoading(true);
        try {
            const data = await api.updateProfile(cleanUsername, avatarFile);
            if (data?.success && data?.user) {
                setSuccessMsg("Profile updated successfully! 🎉");
                onProfileUpdated?.(data.user);
                setTimeout(() => {
                    onClose?.();
                }, 1200);
            } else {
                setError(data?.message || "Failed to update profile");
            }
        } catch (err) {
            setError(err.message || "Server connection error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const currentInitial = currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : "U";

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-container profile-edit-modal" onClick={(e) => e.stopPropagation()}>
                <div className="profile-modal-header">
                    <h2>👤 Edit Profile</h2>
                    <button type="button" className="btn-close-modal" onClick={onClose} title="Close">
                        ✕
                    </button>
                </div>

                <p className="profile-modal-subtitle">
                    Update your profile picture and display username.
                </p>

                {error && <div className="auth-error">⚠️ {error}</div>}
                {successMsg && <div className="auth-success">✓ {successMsg}</div>}

                <form onSubmit={handleSubmit} className="profile-edit-form">
                    {/* 1. Avatar Picker Section */}
                    <div className="profile-avatar-section">
                        <div className="avatar-preview-wrapper">
                            {avatarPreview ? (
                                <img src={avatarPreview} alt={username || "User"} className="avatar-preview-img" />
                            ) : (
                                <div className="avatar-preview-initial">{currentInitial}</div>
                            )}
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                        />

                        <div className="avatar-meta-actions">
                            <button
                                type="button"
                                className="btn-change-photo"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                📷 Choose Photo
                            </button>
                            {avatarFile && (
                                <button
                                    type="button"
                                    className="btn-remove-new-photo"
                                    onClick={handleRemoveSelectedFile}
                                    title="Cancel selected photo"
                                >
                                    Cancel Photo
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 2. Username Field */}
                    <div className="form-group">
                        <label>Display Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter new username"
                            required
                            minLength={2}
                            maxLength={30}
                        />
                    </div>

                    {/* 3. Email Field (Readonly) */}
                    <div className="form-group">
                        <label>
                            Registered Email <span className="locked-badge">🔒 Locked</span>
                        </label>
                        <input
                            type="email"
                            value={currentUser?.email || ""}
                            disabled
                            className="input-disabled"
                            title="Email cannot be changed"
                        />
                    </div>

                    {/* 4. Action Buttons */}
                    <div className="profile-form-actions">
                        <button
                            type="button"
                            className="btn-cancel-edit"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-save-profile"
                            disabled={loading}
                        >
                            {loading ? "Saving Changes..." : "💾 Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

