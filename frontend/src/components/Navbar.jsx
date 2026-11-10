import React from "react";

export const Navbar = ({
    currentUser,
    isConnected,
    notificationPermission,
    onRequestNotification,
    onOpenAuth,
    onOpenProfile,
    onLogout
}) => {
    return (
        <header className="app-navbar">
            <div className="navbar-brand">
                <span className="brand-logo">💬</span>
                <span className="brand-title">BaatCheet</span>
                <span className={`status-badge ${isConnected ? "online" : "offline"}`}>
                    {isConnected ? "● Connected" : "○ Offline"}
                </span>
            </div>

            <div className="navbar-actions">
                {currentUser ? (
                    <div className="user-profile">
                        {/* Desktop / System Notification Permission Button */}
                        {notificationPermission !== "granted" ? (
                            <button
                                type="button"
                                className="btn-enable-notifications"
                                onClick={onRequestNotification}
                                title="Click to enable desktop system notifications for new messages"
                            >
                                🔔 Enable Notifications
                            </button>
                        ) : (
                            <span
                                className="notifications-active-badge"
                                title="Desktop system notifications are enabled"
                            >
                                🔔
                            </span>
                        )}

                        <div className="user-profile-info">
                            <div className="avatar-circle">
                                {currentUser.avatar || currentUser.media ? (
                                    <img
                                        src={currentUser.avatar || currentUser.media}
                                        alt={currentUser.username || "User"}
                                        className="avatar-img"
                                    />
                                ) : (
                                    currentUser.username ? currentUser.username.charAt(0).toUpperCase() : "U"
                                )}
                            </div>
                            <span className="user-name">{currentUser.username}</span>
                        </div>

                        <button
                            type="button"
                            className="btn-edit-profile"
                            onClick={onOpenProfile}
                            title="Edit Profile"
                        >
                            ✏️ Edit Profile
                        </button>
                        <button className="btn-logout" onClick={onLogout} title="Sign Out">
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <div className="auth-buttons">
                        <button className="btn-nav signin" onClick={() => onOpenAuth(true)}>
                            Sign In
                        </button>
                        <button className="btn-nav register" onClick={() => onOpenAuth(false)}>
                            Register
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};
