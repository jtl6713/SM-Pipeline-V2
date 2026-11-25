const crypto = require('crypto');
const MAX_BYTES = 8 * 1024 * 1024;
function decodeStoryAudio(value) {
    if (!value || typeof value !== 'object' ||
        typeof value.base64 !== 'string' || typeof value.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.sha256) ||
        value.base64.length === 0 || value.base64.length > 4 * Math.ceil(MAX_BYTES / 3) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64) ||
        value.base64.length % 4 !== 0) {
        throw new Error('Invalid bounded Story audio payload');
    }
    const data = Buffer.from(value.base64, 'base64');
    if (!data.length || data.length > MAX_BYTES || data.toString('base64') !== value.base64 ||
        crypto.createHash('sha256').update(data).digest('hex') !== value.sha256) {
        throw new Error('Story audio payload checksum mismatch');
    }
    return data;
}
module.exports = {decodeStoryAudio};
