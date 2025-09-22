import User from '../models/User.js';
import { buildQrCodeUrl, verifyTotp } from '../utils/totp.js';

class TotpService {
  constructor() {
    this.pendingSecrets = new Map();
  }

  async generateSetup(user) {
    const secret = User.generateOtpSecret(user.login);
    const qrCode = buildQrCodeUrl(secret.otpauth_url);

    this.pendingSecrets.set(user.id, secret.base32);

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCode
    };
  }

  getPendingSecret(userId) {
    return this.pendingSecrets.get(userId) || null;
  }

  clearPendingSecret(userId) {
    this.pendingSecrets.delete(userId);
  }

  verify(token, secret, window = 1) {
    if (!secret) return false;
    return verifyTotp(token, secret, window);
  }
}

export default new TotpService();
