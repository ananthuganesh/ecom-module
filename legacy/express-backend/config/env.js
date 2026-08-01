import dns from 'dns';
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
    console.warn('[Env] Failed to set public DNS servers:', err.message);
}
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Force immediate environment loading
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import fs from 'fs';
const localEnv = path.resolve(__dirname, '../.env');
const rootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
} else if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
} else {
    dotenv.config();
}

console.log('[Env] Environment variables loaded.');

// Handle Docker Compose dollar sign escaping ($$ -> $) for local development
if (process.env.SHIPROCKET_PASSWORD) {
    process.env.SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD.replace(/\$\$/g, '$');
}
