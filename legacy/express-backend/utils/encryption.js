import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Encrypts a string using AES-256-CBC.
 * The output format is iv:encryptedData (hex encoded).
 */
export const encrypt = (text) => {
    if (!text) return null;
    
    // Use a stable encryption key from .env
    // If missing, we use the JWT_SECRET as a fallback (not ideal but works for dev)
    const secretKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
    
    if (!secretKey) {
        throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set for encryption');
    }

    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(String(secretKey)).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Decrypts a string previously encrypted by the encrypt function.
 */
export const decrypt = (text) => {
    if (!text) return null;

    const secretKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
    const key = crypto.createHash('sha256').update(String(secretKey)).digest();
    
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
};
