const Redis = require('ioredis');

class RedisService {
  constructor() {
    this.isConnected = false;
    this.fallbackStore = new Map();
    this.fallbackExpiry = new Map();

    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 5) {
            return 10000; // Retry every 10s if down
          }
          return Math.min(times * 1000, 5000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('⚡ [Redis/Valkey]: Connected successfully to', redisUrl);
      });

      this.client.on('error', (err) => {
        if (this.isConnected) {
          console.warn('⚠️ [Redis/Valkey Connection Lost]: Operating in in-memory fallback mode.');
        }
        this.isConnected = false;
      });
    } catch (err) {
      console.warn('⚠️ [Redis/Valkey Init Warning]: Could not initialize client. Falling back to in-memory store.');
      this.client = null;
      this.isConnected = false;
    }
  }

  // --- Core Key-Value Operations ---

  async get(key) {
    if (this.isConnected && this.client) {
      try {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
      } catch (err) {
        // Fall through to in-memory
      }
    }
    // In-memory fallback
    const exp = this.fallbackExpiry.get(key);
    if (exp && Date.now() > exp) {
      this.fallbackStore.delete(key);
      this.fallbackExpiry.delete(key);
      return null;
    }
    const val = this.fallbackStore.get(key);
    return val !== undefined ? val : null;
  }

  async set(key, value, ttlSeconds = 3600) {
    if (this.isConnected && this.client) {
      try {
        const strVal = JSON.stringify(value);
        if (ttlSeconds) {
          await this.client.set(key, strVal, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, strVal);
        }
        return true;
      } catch (err) {
        // Fall through to in-memory
      }
    }
    // In-memory fallback
    this.fallbackStore.set(key, value);
    if (ttlSeconds) {
      this.fallbackExpiry.set(key, Date.now() + ttlSeconds * 1000);
    }
    return true;
  }

  async del(key) {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (_) {}
    }
    this.fallbackStore.delete(key);
    this.fallbackExpiry.delete(key);
  }

  // --- High-Speed Chat History Buffer ---

  async pushMessage(senderId, msg) {
    const key = `chat:buffer:${senderId}`;
    const payload = JSON.stringify({
      role: msg.role,
      text: msg.text,
      timestamp: msg.timestamp || new Date()
    });

    if (this.isConnected && this.client) {
      try {
        await this.client.rpush(key, payload);
        await this.client.ltrim(key, -20, -1); // Keep last 20 messages
        await this.client.expire(key, 86400 * 3); // 3 days TTL
        return;
      } catch (_) {}
    }

    // In-memory fallback
    let list = this.fallbackStore.get(key) || [];
    list.push(JSON.parse(payload));
    if (list.length > 20) {
      list = list.slice(-20);
    }
    this.fallbackStore.set(key, list);
    this.fallbackExpiry.set(key, Date.now() + 86400 * 3 * 1000);
  }

  async getRecentChat(senderId, limit = 15) {
    const key = `chat:buffer:${senderId}`;
    if (this.isConnected && this.client) {
      try {
        const raw = await this.client.lrange(key, -limit, -1);
        if (raw && raw.length > 0) {
          return raw.map(r => JSON.parse(r));
        }
      } catch (_) {}
    }

    const list = this.fallbackStore.get(key) || [];
    return list.slice(-limit);
  }

  // --- User Memory & Persona Cache Helpers ---

  async getCachedUserMemory(senderId) {
    return await this.get(`user:memory:${senderId}`);
  }

  async cacheUserMemory(senderId, userMemory, ttlSeconds = 3600) {
    await this.set(`user:memory:${senderId}`, userMemory, ttlSeconds);
  }

  async invalidateUserMemory(senderId) {
    await this.del(`user:memory:${senderId}`);
  }

  async getCachedPersonaConfig() {
    return await this.get('persona:config');
  }

  async cachePersonaConfig(config, ttlSeconds = 600) {
    await this.set('persona:config', config, ttlSeconds);
  }

  async invalidatePersonaConfig() {
    await this.del('persona:config');
  }
}

// Export singleton instance
module.exports = new RedisService();
