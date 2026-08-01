import fs from 'fs';

const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
    
    try {
        fs.appendFileSync('error_log.txt', `\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n${err.message}\n${err.stack}\n`);
    } catch (e) {}

    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    let message = err.message;

    // Mongoose bad ObjectId
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404;
        message = 'Resource not found';
    }

    // MongoDB Timeout/Selection Error
    if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkTimeoutError') {
        statusCode = 503; // Service Unavailable
        message = 'Database connection timeout. Please check your internet or MongoDB Atlas whitelist.';
    }

    res.status(statusCode).json({
        message,
        stack: err.stack,
        details: err.name
    });
};

export { notFound, errorHandler };
