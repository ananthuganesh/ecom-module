import asyncHandler from './asyncHandler.js';

/**
 * Restrict access to admin users only. Must be used after protect middleware.
 */
const adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.isAdmin === true) {
    next();
  } else {
    res.status(403);
    throw new Error('Access denied. Admin only.');
  }
});

export { adminOnly };
