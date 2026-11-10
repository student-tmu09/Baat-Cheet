import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";

export const GroupModal = ({ isOpen, onClose, onCreateGroup, currentUserId }) => {
    const [groupName, setGroupName] = useState("");
    const [groupDescription, setGroupDescription] = useState("");
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState("");
    const [users, setUsers] = useState([]);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setGroupName("");
            setGroupDescription("");
            setAvatarFile(null);
            setAvatarPreview("");
            setSelectedUserIds([]);
            setError("");
            loadUsers();
        }
    }, [isOpen]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith("image/")) {
                setError("Please select a valid image file (PNG, JPG, WEBP, etc.)");
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setError("Image file size must be less than 5MB");
                return;
            }
            setError("");
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveAvatar = () => {
        setAvatarFile(null);
        setAvatarPreview("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await api.searchUsers("");
            if (data?.success && Array.isArray(data.users)) {
                setUsers(data.users.filter((u) => (u._id || u.id) !== currentUserId));
            }
        } catch (err) {
            console.error("Failed to load users for group creation:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleUser = (userId) => {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!groupName.trim()) {
            setError("Please enter a group name");
            return;
        }
        if (selectedUserIds.length === 0) {
            setError("Please select at least one member to add");
            return;
        }

        setError("");
        setLoading(true);
        try {
            const success = await onCreateGroup(
                groupName.trim(),
                selectedUserIds,
                avatarFile,
                groupDescription.trim()
            );
            if (success) {
                onClose();
            } else {
                setError("Failed to create group. Please try again.");
            }
        } catch (err) {
            setError(err.message || "Error creating group");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-container group-modal" onClick={(e) => e.stopPropagation()}>
                <button className="btn-close-modal" onClick={onClose}>
                    ✕
                </button>
                <div className="group-card">
                    <h2>👥 Create New Group</h2>
                    <p className="group-subtitle">Set group photo, name, description and select members.</p>

                    {error && <div className="auth-error">⚠️ {error}</div>}

                    <form onSubmit={handleCreate}>
                        {/* Group Avatar Picker */}
                        <div className="group-avatar-upload-box">
                            <div className="group-avatar-preview-wrap">
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="Group Preview" className="group-avatar-preview-img" />
                                ) : (
                                    <div className="group-avatar-placeholder">
                                        <span>👥</span>
                                    </div>
                                )}
                            </div>
                            <div className="group-avatar-actions">
                                <button
                                    type="button"
                                    className="btn-select-avatar"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {avatarPreview ? "Change Group Icon" : "Upload Group Icon"}
                                </button>
                                {avatarPreview && (
                                    <button
                                        type="button"
                                        className="btn-remove-avatar"
                                        onClick={handleRemoveAvatar}
                                    >
                                        Remove
                                    </button>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: "none" }}
                                    onChange={handleFileChange}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Group Name *</label>
                            <input
                                type="text"
                                placeholder="e.g. Project Team, Friends, Family"
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Group Description (Optional)</label>
                            <textarea
                                className="group-description-input"
                                placeholder="What is this group about? (topics, purpose, guidelines...)"
                                value={groupDescription}
                                onChange={(e) => setGroupDescription(e.target.value)}
                                rows={2}
                                maxLength={250}
                            />
                        </div>

                        <div className="form-group">
                            <label>Select Members ({selectedUserIds.length} selected) *</label>
                            <div className="group-users-list">
                                {loading && users.length === 0 ? (
                                    <div className="loading-users">Loading registered users...</div>
                                ) : users.length === 0 ? (
                                    <div className="no-users">No other registered users found.</div>
                                ) : (
                                    users.map((u) => {
                                        const isSelected = selectedUserIds.includes(u._id || u.id);
                                        return (
                                            <div
                                                key={u._id || u.id}
                                                className={`group-user-item ${isSelected ? "selected" : ""}`}
                                                onClick={() => handleToggleUser(u._id || u.id)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <div className="avatar-mini">
                                                    {u.avatar || u.media ? (
                                                        <img
                                                            src={u.avatar || u.media}
                                                            alt={u.username || "User"}
                                                            className="avatar-img"
                                                        />
                                                    ) : (
                                                        u.username ? u.username.charAt(0).toUpperCase() : "U"
                                                    )}
                                                </div>
                                                <div className="user-text">
                                                    <span className="u-name">{u.username}</span>
                                                    <span className="u-email">{u.email}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary btn-create-group"
                            disabled={loading || !groupName.trim() || selectedUserIds.length === 0}
                        >
                            {loading ? "Creating Group..." : `Create Group (${selectedUserIds.length} members)`}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

