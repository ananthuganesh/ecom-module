import jwt from 'jsonwebtoken';

function getJwtSecret() {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    if (typeof secret !== 'string' || secret.length === 0) {
        throw new Error('JWT_SECRET must be a non-empty string');
    }
    return secret;
}

const generateToken = (id) => {
    if (id == null) throw new Error('User id is required to generate token');
    const secret = getJwtSecret();
    return jwt.sign({ id: String(id) }, secret, { expiresIn: '30d' });
};

export default generateToken;
