const Redis = require("ioredis");

let redisClient = null;
let isRedisAvailable = false;

try {
    redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
        enableOfflineQueue: false, // Do not hang HTTP requests when Redis is down
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        retryStrategy(times) {
            if (times > 2) {
                return 15000; // Poll slowly in the background
            }
            return 2000;
        }
    });

    redisClient.connect().then(() => {
        isRedisAvailable = true;
        console.log("Redis connected successfully");
    }).catch(() => {
        isRedisAvailable = false;
        console.warn("⚠️ Redis not detected on localhost:6379. Using In-Memory session fallback (no functionality blocked).");
    });

    redisClient.on("connect", () => {
        isRedisAvailable = true;
    });

    redisClient.on("error", () => {
        isRedisAvailable = false;
    });
} catch (err) {
    isRedisAvailable = false;
    console.warn("⚠️ Redis init skipped:", err.message);
}

module.exports = {
    redisClient,
    getIsRedisAvailable: () => isRedisAvailable
};
