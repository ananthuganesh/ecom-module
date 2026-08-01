import asyncHandler from '../middleware/asyncHandler.js';
import generateToken from '../utils/generateToken.js';
import User from '../models/userModel.js';
import Otp from '../models/otpModel.js';
import twilio from 'twilio';

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(401);
        throw new Error('Invalid email or password');
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user) {
        res.status(401);
        throw new Error('Invalid email or password');
    }
    let ok = await user.matchPassword(password);
    if (!ok && user.password && !user.password.startsWith('$2')) {
        if (user.password === password) {
            user.password = password;
            await user.save();
            ok = true;
        }
    }
    if (!ok) {
        res.status(401);
        throw new Error('Invalid email or password');
    }
    res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
    });
});

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }
    const user = await User.create({ name, email, password });
    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            token: generateToken(user._id),
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
        res.json({ _id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        if (req.body.password) user.password = req.body.password;
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            isAdmin: updatedUser.isAdmin,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Get all users (Admin)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
    const users = await User.find({});
    res.json(users);
});

// @desc    Get user by ID (Admin)
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
        res.json(user);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Delete user (Admin)
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        if (user.isAdmin) {
            res.status(400);
            throw new Error('Cannot delete admin user');
        }
        await User.deleteOne({ _id: user._id });
        res.json({ message: 'User removed' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user (Admin)
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.isAdmin = Boolean(req.body.isAdmin);
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            isAdmin: updatedUser.isAdmin,
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Send OTP to phone
// @route   POST /api/users/send-otp
// @access  Public
const sendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        res.status(400);
        throw new Error('Phone number is required');
    }

    // Live SMS sending via Twilio Verify
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID) {
        try {
            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            
            // Format phone number to E.164 if not already (e.g., +91...)
            const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
            
            await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verifications
                .create({ to: formattedPhone, channel: 'whatsapp' });

            console.log(`[Twilio Verify] WhatsApp verification sent to ${formattedPhone}`);
            
            res.status(200).json({
                success: true,
                message: 'Verification code sent'
            });
        } catch (error) {
            console.error('Twilio Verify Error:', error.message);
            res.status(500);
            throw new Error(`Failed to send verification: ${error.message}`);
        }
    } else {
        // Fallback for development if Twilio is not configured
        console.log(`[SMS MOCK] Twilio not configured. Phone: ${phone}`);
        res.status(200).json({
            success: true,
            message: 'Mock OTP sent (Twilio not configured)',
            otp: "123456" // Hardcoded for local testing without Twilio
        });
    }
});

// @desc    Verify OTP and Log in/Sign up
// @route   POST /api/users/verify-otp
// @access  Public
const verifyOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        res.status(400);
        throw new Error('Phone and OTP are required');
    }

    // Format phone number to E.164
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    // Verify via Twilio Verify
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID) {
        try {
            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const verificationCheck = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verificationChecks
                .create({ to: formattedPhone, code: otp });

            if (verificationCheck.status !== 'approved') {
                res.status(400);
                throw new Error('Invalid or expired verification code');
            }
        } catch (error) {
            console.error('Twilio Verify Check Error:', error.message);
            res.status(400);
            throw new Error(`Verification failed: ${error.message}`);
        }
    } else {
        // Mock verification for development
        if (otp !== "123456") {
            res.status(400);
            throw new Error('Invalid mock OTP');
        }
    }

    // Find user or create new one
    let user = await User.findOne({ phone });

    if (!user) {
        user = await User.create({
            name: `User ${phone.slice(-4)}`,
            phone,
            isPhoneVerified: true
        });
    } else {
        user.isPhoneVerified = true;
        await user.save();
    }

    res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
    });
});

export { authUser, registerUser, getUserProfile, updateUserProfile, getUsers, getUserById, deleteUser, updateUser, sendOTP, verifyOTP };
