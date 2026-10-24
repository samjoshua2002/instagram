const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // recommended nonce size for GCM

/**
 * 32-byte key from ENCRYPTION_KEY: a 64-char hex string is used as-is,
 * any other string is stretched with SHA-256.
 */
function getKey() {
  const raw = (process.env.ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

class CryptoService {
  isConfigured() {
    return !!(process.env.ENCRYPTION_KEY || '').trim();
  }

  /**
   * Encrypts plaintext (tokens, API keys) for storage in MongoDB.
   * Returns { encryptedData, iv, authTag } as hex strings.
   */
  encrypt(text) {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return {
      encryptedData: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }

  /**
   * Decrypts a { encryptedData, iv, authTag } object. Throws if the data was tampered with.
   */
  decrypt({ encryptedData, iv, authTag }) {
    if (!encryptedData || !iv || !authTag) return '';
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedData, 'hex')), decipher.final()]).toString('utf8');
  }
}

module.exports = new CryptoService();
