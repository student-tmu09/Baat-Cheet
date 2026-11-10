# 💬 BaatCheet (बातचीत)
### Modern Full-Stack Real-Time Messaging & WebRTC Communication Platform

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?style=flat-square&logo=socket.io&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Audio_&_Video-333333?style=flat-square&logo=webrtc&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Media_CDN-3448C5?style=flat-square&logo=cloudinary&logoColor=white)

---

## 🌟 About The Project

**BaatCheet** is a feature-rich, production-grade real-time chat application inspired by WhatsApp and Telegram. Built on the MERN stack with native **Socket.IO** and **WebRTC**, it goes far beyond standard tutorial chat apps by offering 1-on-1 and group messaging, direct peer-to-peer video/audio calling, voice note recordings, delivery/read receipts, quoted message replies, multi-device presence tracking, and background web push notifications.

---

## ✨ Key Features

### 💬 1-on-1 Real-Time Chatting
- **Instant Messaging:** Ultra-low latency messaging powered by Socket.IO rooms.
- **Message Status Ticks:** 
  - `✓` Sent (Message stored in database).
  - `✓✓` Delivered (Message reached recipient's client).
  - `✓✓` Seen (Blue ticks when recipient opens the chat).
- **Typing Indicators:** Real-time animated typing status with sender username.
- **Online / Offline Status:** Multi-device presence tracking with timestamped `lastSeen`.

### 👥 Advanced Group Chat Management
- **Group Creation:** Custom group name, description/bio, and group avatar upload (Cloudinary).
- **Admin Hierarchy & Controls:** Group admins can add members, remove/kick members, and delete groups.
- **Self-Leave with Auto-Succession:** If an admin leaves the group, admin privileges are automatically reassigned to the next oldest active member.
- **Real-Time Group Sync:** Immediate UI updates for all members when details change or members are removed.

### 📞 WebRTC Audio & Video Calling
- **Direct P2P Calling:** Zero server-bandwidth video and audio streaming via native browser `RTCPeerConnection`.
- **STUN Server Integration:** Public Google and Twilio STUN servers for reliable NAT traversal.
- **Call Controls:** Incoming call ringtone dialog, Accept / Decline buttons, Mute/Unmute microphone, and Video On/Off toggles.

### 🎙️ Rich Media & Voice Notes
- **Voice Messages:** Built-in audio recorder using browser `MediaRecorder` API with waveform playback.
- **Media Uploads:** Images, photos, and file attachments securely stored and delivered via Cloudinary CDN.
- **Disk Optimization:** Automatic temporary file cleanup after Cloudinary upload.

### ⚡ Advanced UX & Performance
- **Quoted / Tagged Replies:** Hover on any message to quote-reply. Clicking the quoted bubble smoothly scrolls to the original message and triggers an animated highlight glow.
- **Message Editing & Deletion:** Edit sent messages or delete for everyone in real time.
- **Infinite Scrolling:** Cursor/Timestamp-based pagination (`before: timestamp`) for fast message history loading without database offset skips.
- **Web Push Notifications:** VAPID push alerts and Service Worker (`sw.js`) background notification rendering.
- **Resilient Caching:** Redis session store with an automated in-memory fallback for zero-downtime reliability.

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Vanilla CSS, Lucide Icons |
| **Backend** | Node.js, Express 5, RESTful APIs |
| **Realtime Engine** | Socket.IO (v4.8.4) |
| **Video & Audio Calling** | Native WebRTC (`RTCPeerConnection`), Google & Twilio STUN |
| **Database** | MongoDB & Mongoose (v9.11.2) |
| **Cloud Storage** | Cloudinary API, Multer |
| **Caching / Sessions** | Redis (`ioredis`), `connect-redis`, Express Session |
| **Notifications** | Web Push (`web-push`), VAPID, Service Worker |

---

## 📁 Project Structure

```
.
├── backend/
│   ├── public/temp/                # Temporary upload folder (auto-cleaned)
│   ├── src/
│   │   ├── config/
│   │   │   ├── cloudinary.config.js # Cloudinary SDK setup
│   │   │   ├── redis.config.js      # Resilient Redis connection
│   │   │   ├── session.config.js    # Session store with memory fallback
│   │   │   ├── socket.config.js     # Socket.IO rooms, presence, WebRTC signaling
│   │   │   └── webpush.config.js    # VAPID notification setup
│   │   ├── controller/
│   │   │   ├── auth.controller.js   # User auth, login, profile edit, search
│   │   │   ├── coversation.controller.js # 1-on-1 & group chats, member management
│   │   │   ├── message.controller.js# Send, replyTo, edit, delete, mark seen
│   │   │   └── push.controller.js   # Web push subscription management
│   │   ├── middleware/              # Auth, Multer, Database middlewares
│   │   ├── model/                   # Mongoose models: User, Conversation, Message, Push
│   │   ├── route/                   # Express API routes
│   │   └── services/                # Push notification service
│   ├── app.js                       # Express setup, CORS, and error handlers
│   ├── server.js                    # Server startup and Socket.IO initialization
│   ├── .env.example                 # Backend environment variable template
│   └── package.json
│
└── frontend/
    ├── public/
    │   ├── sw.js                    # Service worker for push notifications
    │   └── favicon.svg, icons.svg
    ├── src/
    │   ├── components/              # ChatArea, Sidebar, Navbar, VideoCallModal, GroupModal, etc.
    │   ├── hooks/                   # useWebRTC custom hook
    │   ├── services/                # api.js, socket.js, sound.js, notification.js
    │   ├── App.css                  # UI styling & animations
    │   ├── App.jsx                  # Root state controller & real-time events
    │   └── main.jsx
    ├── .env.example                 # Frontend environment variable template
    ├── vite.config.js
    └── package.json
```

---

## 🚀 Getting Started (Local Setup)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas URI)
- Cloudinary Account (Free tier API credentials)

---

### 1. Clone Repository
```bash
git clone https://github.com/your-username/baatcheet.git
cd baatcheet
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` folder (refer to `.env.example`):
```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
SESSION_SECRET=your_super_secret_session_key

MONGO_URI=mongodb://localhost:27017/batcheet

# Optional: Redis (auto falls back to memory store if omitted)
REDIS_URL=redis://localhost:6379

# Cloudinary (Required for avatars & media)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Web Push (VAPID)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your_email@example.com
```

Start the backend:
```bash
npm run dev
```
*(Server will start on `http://localhost:3000`)*

---

### 3. Frontend Setup
Open a second terminal window:
```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/` (refer to `.env.example`):
```env
VITE_BACKEND_URL=http://localhost:3000
```

Start the frontend:
```bash
npm run dev
```
*(Frontend will open on `http://localhost:5173`)*

---

## 🌐 Production Deployment Guide

### Deploying the Backend (Render.com / Railway.app)
> ⚠️ **Important:** Do NOT deploy the backend to Vercel/Netlify Serverless functions, as serverless cannot keep persistent WebSocket connections open. Use a persistent container service like Render, Railway, or Koyeb.

1. Create a new **Web Service** on [Render.com](https://render.com).
2. Connect your GitHub repository.
3. Set the following settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. In **Environment Variables**, add the values from `backend/.env.example`.
5. Deploy! Render will provide your live API URL (e.g. `https://baatcheet-backend.onrender.com`).

---

### Deploying the Frontend (Vercel / Netlify)
1. Create a new project on [Vercel](https://vercel.com).
2. Connect your GitHub repository.
3. Set the following settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** `Vite`
4. In **Environment Variables**, add:
   ```env
   VITE_BACKEND_URL=https://baatcheet-backend.onrender.com
   ```
5. Click **Deploy**!
6. Copy your Vercel URL (e.g., `https://baatcheet.vercel.app`) and update the `CLIENT_URL` variable in your Render backend settings.

---

## 📡 Socket.IO Real-Time Events Reference

| Event Name | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `join-conversation` | Client ➔ Server | `conversationId` | Joins a specific chat room |
| `receive_message` | Server ➔ Client | `Message` object | Delivers newly created message |
| `message_delivered`| Client ➔ Server ➔ Client | `{ messageId, conversationId }` | Marks message as delivered (`✓✓`) |
| `mark_seen` | Client ➔ Server | `{ conversationId }` | Marks unread messages as seen (`✓✓` Blue) |
| `typing-start` | Client ➔ Server ➔ Client | `{ conversationId, username }` | Triggers partner typing status |
| `typing-stop` | Client ➔ Server ➔ Client | `{ conversationId }` | Clears partner typing status |
| `call-user` | Client ➔ Server ➔ Client | `{ receiverId, isVideoCall }` | Initiates WebRTC call dialog |
| `webrtc-offer` | Client ➔ Server ➔ Client | `{ offer, receiverId }` | Transmits SDP offer to callee |
| `webrtc-answer`| Client ➔ Server ➔ Client | `{ answer, callerId }` | Transmits SDP answer to caller |
| `ice-candidate`| Client ➔ Server ➔ Client | `{ candidate, targetUserId }` | Exchanges network paths for P2P |

---

## 📄 License

This project is open-source and available under the [ISC License](LICENSE).
