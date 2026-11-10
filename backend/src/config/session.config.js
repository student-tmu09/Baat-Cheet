const session = require("express-session");
const { redisClient, getIsRedisAvailable } = require("./redis.config");

// Resilient session store extending session.Store (has EventEmitter .on methods)
class ResilientStore extends session.Store {
    constructor() {
        super();
        this.memoryStore = new session.MemoryStore();
    }

    get(sid, cb) {
        if (getIsRedisAvailable() && redisClient) {
            redisClient.get(`chat:sess:${sid}`, (err, data) => {
                if (err || !data) {
                    return this.memoryStore.get(sid, cb);
                }
                try {
                    return cb(null, JSON.parse(data));
                } catch {
                    return this.memoryStore.get(sid, cb);
                }
            });
        } else {
            return this.memoryStore.get(sid, cb);
        }
    }

    set(sid, sessionData, cb) {
        this.memoryStore.set(sid, sessionData, () => {});
        if (getIsRedisAvailable() && redisClient) {
            try {
                redisClient.set(`chat:sess:${sid}`, JSON.stringify(sessionData), "EX", 7 * 24 * 3600, () => {
                    cb?.(null);
                });
            } catch {
                cb?.(null);
            }
        } else {
            cb?.(null);
        }
    }

    destroy(sid, cb) {
        this.memoryStore.destroy(sid, () => {});
        if (getIsRedisAvailable() && redisClient) {
            try {
                redisClient.del(`chat:sess:${sid}`, () => cb?.(null));
            } catch {
                cb?.(null);
            }
        } else {
            cb?.(null);
        }
    }

    touch(sid, sessionData, cb) {
        this.memoryStore.touch(sid, sessionData, () => {});
        if (getIsRedisAvailable() && redisClient) {
            try {
                redisClient.expire(`chat:sess:${sid}`, 7 * 24 * 3600, () => cb?.(null));
            } catch {
                cb?.(null);
            }
        } else {
            cb?.(null);
        }
    }
}

const sessionMiddleware = session({
    name: "chat.sid",
    store: new ResilientStore(),
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
});

module.exports = sessionMiddleware;
