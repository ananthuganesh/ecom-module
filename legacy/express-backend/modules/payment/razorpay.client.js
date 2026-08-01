/**
 * razorpay.client.js
 * -------------------
 * Updated to support dynamic credentials from the database.
 */

import Razorpay from 'razorpay';
import Setting from '../../models/settingModel.js';
import { decrypt } from '../../utils/encryption.js';

let _client = null;
let _currentKeyId = null;

/**
 * Returns the Razorpay client instance.
 * Fetches credentials from DB (priority) or .env (fallback).
 * This is now ASYNC because it talks to the database.
 */
const getRazorpayClient = async () => {
  try {
    // 1. Try to fetch from database
    const dbSetting = await Setting.findOne({ key: 'razorpay_settings' });
    let keyId, keySecret;

    if (dbSetting && dbSetting.value && dbSetting.value.isConnected) {
      keyId = dbSetting.value.keyId;
      // Decrypt the secret from the database
      keySecret = decrypt(dbSetting.value.keySecret);
    } else {
      // 2. Fallback to .env
      keyId = process.env.RAZORPAY_KEY_ID;
      keySecret = process.env.RAZORPAY_KEY_SECRET;
    }

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not found in DB or .env');
    }

    // 3. If keys haven't changed, reuse existing client (Caching)
    if (_client && _currentKeyId === keyId) {
      return _client;
    }

    // 4. Initialize new client
    const isLive = keyId && keyId.startsWith('rzp_live_');
    const maskedId = keyId ? `${keyId.slice(0, 8)}...` : 'MISSING';
    console.log(`[Razorpay] Initializing ${isLive ? 'LIVE' : 'TEST'} client with ${dbSetting && dbSetting.value && dbSetting.value.isConnected ? 'DB' : '.env'} keys (ID: ${maskedId})`);
    _client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    _currentKeyId = keyId;

    return _client;
  } catch (error) {
    console.error('[Razorpay] Initialization Error:', error.message);
    throw error;
  }
};

/**
 * Utility to get the current Key ID without full client init (useful for frontend config)
 */
export const getActiveKeyId = async () => {
    const dbSetting = await Setting.findOne({ key: 'razorpay_settings' });
    if (dbSetting && dbSetting.value && dbSetting.value.isConnected) {
        return dbSetting.value.keyId;
    }
    return process.env.RAZORPAY_KEY_ID;
};

export default getRazorpayClient;
