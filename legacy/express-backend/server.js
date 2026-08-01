import './config/env.js';
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import shippingRoutes from './routes/shippingRoutes.js';
import stripeRoutes from './routes/stripeRoutes.js';
import paymentRoutes from './modules/payment/payment.routes.js';
import abandonedCheckoutRoutes from './routes/abandonedCheckoutRoutes.js';
import handleWebhook from './modules/payment/payment.webhook.js';
import couponRoutes from './routes/couponRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';
import adminRoutes from './routes/adminRoutes/index.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment is already loaded via import './config/env.js' above.

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('Fatal: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error('Fatal: MONGO_URI is missing. Add it to backend/.env or set the env var.');
  process.exit(1);
}
connectDB();

const app = express();
app.use(compression());

// Trust proxy (essential for Nginx/Cloudflare)
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[Backend] ${req.method} ${req.url}`);
    next();
});

// CORS Configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        // If ALLOWED_ORIGINS is not set, allow all in development
        if (!process.env.ALLOWED_ORIGINS) return callback(null, true);

        const origins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
        const isAllowed = origins.some(o => origin.includes(o));

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

// Razorpay Webhook MUST come BEFORE express.json() and bypasses CORS
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded product images from public folder
const possiblePaths = [
    path.join(process.cwd(), 'public', 'uploads'),
    path.join(process.cwd(), 'backend', 'public', 'uploads'),
    path.resolve(__dirname, 'public', 'uploads'),
    path.resolve(__dirname, '..', 'public', 'uploads')
];

let finalUploadPath = possiblePaths[0];
for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
        finalUploadPath = p;
        break;
    }
}

console.log(`[Backend] Serving static files from: ${finalUploadPath}`);
app.use('/uploads', express.static(finalUploadPath, {
    maxAge: '30d', // Cache images for 30 days
    etag: true,
    lastModified: true
}));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/stripe', stripeRoutes);
// Razorpay payment module (replaces Stripe for Indian payments)
app.use('/api/payments', paymentRoutes);
app.use('/api/abandoned-checkout', abandonedCheckoutRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/admin', adminRoutes);

// Health check & Root
app.get('/', (req, res) => res.json({ message: 'Urban Aana API is running' }));
app.get('/api/health', (req, res) => res.json({ status: 'API is running' }));

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
console.log(`[Backend] Initializing on port ${PORT}...`);
app.listen(PORT, () => console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));
