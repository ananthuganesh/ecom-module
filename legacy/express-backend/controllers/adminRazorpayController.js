import asyncHandler from 'express-async-handler';
import Setting from '../models/settingModel.js';
import { encrypt } from '../utils/encryption.js';

// @desc    Get Razorpay settings
// @route   GET /api/admin/razorpay/settings
// @access  Private/Admin
export const getRazorpaySettings = asyncHandler(async (req, res) => {
    const setting = await Setting.findOne({ key: 'razorpay_settings' });
    
    const envKeyId = process.env.RAZORPAY_KEY_ID;
    const envKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const isEnvConnected = !!(envKeyId && envKeySecret);

    if (!setting) {
        return res.json({
            isConnected: isEnvConnected,
            keyId: envKeyId || '',
            environment: envKeyId?.startsWith('rzp_live_') ? 'live' : 'test',
            hasSecret: !!envKeySecret,
            hasWebhookSecret: !!process.env.RAZORPAY_WEBHOOK_SECRET,
            isFromEnv: isEnvConnected
        });
    }

    const value = setting.value;
    const actualIsConnected = value.isConnected || isEnvConnected;

    res.json({
        isConnected: actualIsConnected,
        keyId: value.keyId || envKeyId || '',
        environment: value.environment || (envKeyId?.startsWith('rzp_live_') ? 'live' : 'test'),
        hasSecret: !!(value.keySecret || envKeySecret),
        hasWebhookSecret: !!(value.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET),
        isFromEnv: !value.isConnected && isEnvConnected
    });
});

// @desc    Save/Update Razorpay settings
// @route   POST /api/admin/razorpay/settings
// @access  Private/Admin
export const saveRazorpaySettings = asyncHandler(async (req, res) => {
    const { keyId, keySecret, webhookSecret, environment } = req.body;

    const existingSetting = await Setting.findOne({ key: 'razorpay_settings' });
    
    if (!keyId) {
        res.status(400);
        throw new Error('Key ID is required');
    }

    // Check if we need a secret (first time setup)
    if (!keySecret && (!existingSetting || !existingSetting.value.keySecret)) {
        res.status(400);
        throw new Error('Key Secret is required for first time setup');
    }

    // Determine the secret to use: new one if provided, otherwise the existing one
    let encryptedSecret = existingSetting?.value?.keySecret;
    if (keySecret && keySecret.trim() !== '') {
        encryptedSecret = encrypt(keySecret);
    }

    // Determine the webhook secret to use
    let encryptedWebhookSecret = existingSetting?.value?.webhookSecret;
    if (webhookSecret !== undefined) {
        if (webhookSecret && webhookSecret.trim() !== '') {
            encryptedWebhookSecret = encrypt(webhookSecret);
        } else if (webhookSecret === "") {
            encryptedWebhookSecret = null;
        }
    }

    const settingValue = {
        keyId,
        keySecret: encryptedSecret,
        webhookSecret: encryptedWebhookSecret,
        environment: environment || 'test',
        isConnected: true
    };

    const updatedSetting = await Setting.findOneAndUpdate(
        { key: 'razorpay_settings' },
        { value: settingValue },
        { upsert: true, new: true }
    );

    res.json({
        message: 'Razorpay settings saved successfully',
        isConnected: true
    });
});

// @desc    Disconnect Razorpay
// @route   POST /api/admin/razorpay/disconnect
// @access  Private/Admin
export const disconnectRazorpay = asyncHandler(async (req, res) => {
    await Setting.findOneAndDelete({ key: 'razorpay_settings' });
    res.json({ message: 'Razorpay disconnected successfully' });
});
