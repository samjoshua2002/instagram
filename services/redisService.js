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

      // 'connect' fires before the server is usable (AUTH/SELECT may still be pending); 'ready' means commands work
      this.client.on('ready', () => {
        this.isConnected = true;
        console.log('⚡ [Redis/Valkey]: Connected successfully to', redisUrl.replace(/\/\/[^@/]*@/, '//****@'));
      });

      const markDown = () => {
        if (this.isConnected) {
          console.warn('⚠️ [Redis/Valkey Connection Lost]: Operating in in-memory fallback mode.');
        }
        this.isConnected = false;
      };
      this.client.on('error', markDown);
      this.client.on('close', markDown);
      this.client.on('end', markDown);
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
    // A copy, like a Redis read: callers mutating the result must not change the stored value
    return val !== undefined ? structuredClone(val) : null;
  }

  // While Redis is down, expired keys were only dropped when read, so the in-memory store grew forever
  _pruneFallback(maxKeys = 5000) {
    if (this.fallbackStore.size < maxKeys) return;
    const now = Date.now();
    for (const [key, expiresAt] of this.fallbackExpiry) {
      if (expiresAt < now) {
        this.fallbackStore.delete(key);
        this.fallbackExpiry.delete(key);
      }
    }
    // Still full: drop the oldest keys (a Map keeps insertion order)
    for (const key of this.fallbackStore.keys()) {
      if (this.fallbackStore.size < maxKeys) break;
      this.fallbackStore.delete(key);
      this.fallbackExpiry.delete(key);
    }
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
    this._pruneFallback();
    // Stored as Redis would see it (JSON round trip), so ObjectIds, Dates and documents behave the same
    this.fallbackStore.set(key, value === undefined ? null : JSON.parse(JSON.stringify(value)));
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
    this._pruneFallback();
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
    return structuredClone(list.slice(-limit));
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

  // Persona cache is per owner: persona:config:<ownerId>, or persona:config:legacy for the admin (ownerId null)
  personaConfigKey(ownerId) {
    return `persona:config:${ownerId ? String(ownerId) : 'legacy'}`;
  }

  async getCachedPersonaConfig(ownerId = null) {
    return await this.get(this.personaConfigKey(ownerId));
  }

  /** ownerId defaults to config.ownerId. */
  async cachePersonaConfig(config, ttlSeconds = 600, ownerId) {
    const owner = ownerId !== undefined ? ownerId : (config && config.ownerId) || null;
    await this.set(this.personaConfigKey(owner), config, ttlSeconds);
  }

  /**
   * Drops one owner's cached persona. Called with no argument (older call sites) it drops every
   * owner's cached persona, plus the old shared 'persona:config' key.
   */
  async invalidatePersonaConfig(ownerId) {
    if (ownerId !== undefined) {
      await this.del(this.personaConfigKey(ownerId));
      return;
    }
    await this.del('persona:config');
    if (this.isConnected && this.client) {
      try {
        let cursor = '0';
        do {
          const [next, keys] = await this.client.scan(cursor, 'MATCH', 'persona:config:*', 'COUNT', 200);
          cursor = next;
          if (keys.length) await this.client.del(...keys);
        } while (cursor !== '0');
      } catch (_) {}
    }
    for (const key of [...this.fallbackStore.keys()]) {
      if (key.startsWith('persona:config:')) {
        this.fallbackStore.delete(key);
        this.fallbackExpiry.delete(key);
      }
    }
  }
}

// Export singleton instance
module.exports = new RedisService();
