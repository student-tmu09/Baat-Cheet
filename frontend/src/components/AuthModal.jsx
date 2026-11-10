import React, { useState, useEffect } from "react";
import { api } from "../services/api";

export const AuthModal = ({ onAuthSuccess, initialIsLogin = true }) => {
    const [isLogin, setIsLogin] = useState(initialIsLogin);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setIsLogin(initialIsLogin);
        setError("");
        setAvatarFile(null);
        setAvatarPreview("");
    }, [initialIsLogin]);

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        } else {
            setAvatarFile(null);
            setAvatarPreview("");
        }
    };

    const handleRemoveAvatar = () => {
        setAvatarFile(null);
        setAvatarPreview("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            let data;
            if (isLogin) {
                data = await api.login(email.trim(), password);
            } else {
                data = await api.register(username.trim(), email.trim(), password, avatarFile);
            }

            if (data?.success && data?.user) {
                onAuthSuccess(data.user);
            } else {
                setError(data?.message || "Authentication failed");
            }
        } catch (err) {
            setError(err.message || "Server connection failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-card">
            <h2>{isLogin ? "🔐 Sign In" : "📝 Create Account"}</h2>
            <p className="auth-subtitle">
                {isLogin
                    ? "Welcome back! Enter your email and password."
                    : "Register to start chatting and video calling with friends."}
            </p>

            {error && <div className="auth-error">⚠️ {error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
                {!isLogin && (
                    <>
                        {/* Optional Avatar Upload Field */}
                        <div className="form-group avatar-upload-field">
                            <label>Profile Picture (Optional)</label>
                            <div className="avatar-picker-row">
                                <div className="avatar-preview-circle">
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="Preview" className="avatar-img" />
                                    ) : (
                                        <span className="avatar-preview-icon">👤</span>
                                    )}
                                </div>
                                <div className="avatar-picker-actions">
                                    <input
                                        type="file"
                                        id="register-avatar-input"
                                        accept="image/png,image/jpeg,image/jpg,image/webp"
                                        onChange={handleAvatarChange}
                                        style={{ display: "none" }}
                                    />
                                    <label htmlFor="register-avatar-input" className="btn-upload-avatar">
                                        📷 {avatarFile ? "Change Photo" : "Upload Photo"}
                                    </label>
                                    {avatarFile && (
                                        <button
                                            type="button"
                                            className="btn-remove-avatar"
                                            onClick={handleRemoveAvatar}
                                        >
                                            ✕ Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Username</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. rahul_kumar"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </>
                )}

                <div className="form-group">
                    <label>Email Address</label>
                    <input
                        type="email"
                        required
                        placeholder="e.g. user@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label>Password</label>
                    <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                <button type="submit" className="btn-primary auth-submit" disabled={loading}>
                    {loading ? "Processing..." : isLogin ? "Sign In" : "Register"}
                </button>
            </form>

            <div className="auth-switch">
                {isLogin ? (
                    <p>
                        Don't have an account?{" "}
                        <span onClick={() => { setIsLogin(false); setError(""); }}>
                            Register now
                        </span>
                    </p>
                ) : (
                    <p>
                        Already have an account?{" "}
                        <span onClick={() => { setIsLogin(true); setError(""); }}>
                            Sign in
                        </span>
                    </p>
                )}
            </div>
        </div>
    );
};
