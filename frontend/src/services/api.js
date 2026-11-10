const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const getStoredUserId = () => {
    try {
        const saved = sessionStorage.getItem("auth_user") || localStorage.getItem("auth_user");
        if (!saved) return "";
        const u = JSON.parse(saved);
        return (u?._id || u?.id || u?.userId || (u?.user && (u.user._id || u.user.id)) || "").toString().trim();
    } catch {
        return "";
    }
};

const getHeaders = (extra = {}) => {
    const userId = getStoredUserId();
    const headers = { ...extra };
    if (userId) {
        headers["x-user-id"] = userId;
    }
    return headers;
};

export const api = {
    // Auth APIs
    async register(username, email, password, avatarFile = null) {
        if (avatarFile) {
            const formData = new FormData();
            formData.append("username", username);
            formData.append("email", email);
            formData.append("password", password);
            formData.append("avatar", avatarFile);

            const res = await fetch(`${BASE_URL}/api/auth/register`, {
                method: "POST",
                headers: getHeaders(), // Let browser auto-set multipart boundary
                credentials: "include",
                body: formData
            });
            return res.json();
        } else {
            const res = await fetch(`${BASE_URL}/api/auth/register`, {
                method: "POST",
                headers: getHeaders({ "Content-Type": "application/json" }),
                credentials: "include",
                body: JSON.stringify({ username, email, password })
            });
            return res.json();
        }
    },

    async login(email, password) {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ email, password })
        });
        return res.json();
    },

    async getMe() {
        const res = await fetch(`${BASE_URL}/api/auth/me`, {
            method: "GET",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async logout() {
        const res = await fetch(`${BASE_URL}/api/auth/logout`, {
            method: "POST",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async updateProfile(username, avatarFile = null) {
        const formData = new FormData();
        if (username) formData.append("username", username);
        if (avatarFile) formData.append("avatar", avatarFile);

        const res = await fetch(`${BASE_URL}/api/auth/profile`, {
            method: "PUT",
            headers: getHeaders(), // Let browser set multipart/form-data boundary automatically
            credentials: "include",
            body: formData
        });
        return res.json();
    },

    async searchUsers(username = "") {
        const url = username
            ? `${BASE_URL}/api/auth/search?username=${encodeURIComponent(username)}`
            : `${BASE_URL}/api/auth/search`;

        const res = await fetch(url, {
            method: "GET",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    // Conversation APIs
    async getConversations() {
        const res = await fetch(`${BASE_URL}/api/conversations`, {
            method: "GET",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async createConversation(receiverId) {
        const res = await fetch(`${BASE_URL}/api/conversations`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ receiverId })
        });
        return res.json();
    },

    async createGroup(groupName, participantIds, groupAvatarFile = null, groupDescription = "") {
        if (groupAvatarFile || groupDescription) {
            const formData = new FormData();
            formData.append("groupName", groupName);
            formData.append("participantIds", JSON.stringify(participantIds));
            if (groupDescription) formData.append("groupDescription", groupDescription);
            if (groupAvatarFile) formData.append("avatar", groupAvatarFile);

            const res = await fetch(`${BASE_URL}/api/conversations/group`, {
                method: "POST",
                headers: getHeaders(), // Let browser set multipart/form-data boundary
                credentials: "include",
                body: formData
            });
            return res.json();
        }

        const res = await fetch(`${BASE_URL}/api/conversations/group`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ groupName, participantIds })
        });
        return res.json();
    },

    async updateGroupProfile(conversationId, { groupName, groupDescription, avatarFile = null, removeAvatar = false } = {}) {
        const formData = new FormData();
        formData.append("conversationId", conversationId);
        if (groupName !== undefined && groupName !== null) formData.append("groupName", groupName);
        if (groupDescription !== undefined && groupDescription !== null) formData.append("groupDescription", groupDescription);
        if (removeAvatar) formData.append("removeAvatar", "true");
        if (avatarFile) formData.append("avatar", avatarFile);

        const res = await fetch(`${BASE_URL}/api/conversations/group/update`, {
            method: "POST",
            headers: getHeaders(), // Let browser set multipart/form-data boundary
            credentials: "include",
            body: formData
        });
        return res.json();
    },

    async updateGroupDetails(conversationId, data) {
        return this.updateGroupProfile(conversationId, data);
    },

    async addGroupMember(conversationId, newMemberId) {
        const res = await fetch(`${BASE_URL}/api/conversations/group/add-member`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ conversationId, newMemberId })
        });
        return res.json();
    },

    async removeGroupMember(conversationId, memberId) {
        const res = await fetch(`${BASE_URL}/api/conversations/group/remove-member`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ conversationId, memberId })
        });
        return res.json();
    },

    async deleteGroup(conversationId) {
        const res = await fetch(`${BASE_URL}/api/conversations/group/delete`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ conversationId })
        });
        return res.json();
    },

    // Message APIs
    async getMessages(conversationId, before = null, limit = 30) {
        let url = `${BASE_URL}/api/messages/${conversationId}?limit=${limit}`;
        if (before) {
            url += `&before=${encodeURIComponent(before)}`;
        }
        const res = await fetch(url, {
            method: "GET",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async sendMessage(conversationId, text, file = null, replyTo = null) {
        const formData = new FormData();
        if (text) formData.append("text", text);
        if (file) formData.append("file", file);
        if (replyTo) formData.append("replyTo", replyTo);

        const res = await fetch(`${BASE_URL}/api/messages/${conversationId}`, {
            method: "POST",
            headers: getHeaders(),
            credentials: "include",
            body: formData
        });
        return res.json();
    },

    async editMessage(messageId, text) {
        const res = await fetch(`${BASE_URL}/api/messages/${messageId}`, {
            method: "PATCH",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({ text })
        });
        return res.json();
    },

    async deleteMessage(messageId) {
        const res = await fetch(`${BASE_URL}/api/messages/${messageId}`, {
            method: "DELETE",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async markMessagesSeen(conversationId) {
        if (!conversationId) return { success: false };
        const res = await fetch(`${BASE_URL}/api/messages/mark-seen/${conversationId}`, {
            method: "PATCH",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async getUnreadCount(conversationId) {
        if (!conversationId) return { success: false, unreadCount: 0 };
        const res = await fetch(`${BASE_URL}/api/messages/unread-count/${conversationId}`, {
            method: "GET",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    // Push Notification APIs
    async getVapidPublicKey() {
        const res = await fetch(`${BASE_URL}/api/push/public-key`, {
            method: "GET",
            headers: getHeaders(),
            credentials: "include"
        });
        return res.json();
    },

    async savePushSubscription(subscription) {
        const res = await fetch(`${BASE_URL}/api/push/subscribe`, {
            method: "POST",
            headers: getHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify(subscription)
        });
        return res.json();
    }
};
