const { signAsync } = require("@electron/osx-sign");

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

/**
 * electron-builder's default signer hands codesign the identity's name, which codesign rejects as
 * ambiguous when the same certificate sits in two keychains (Xcode's signing keychain and the
 * login keychain on a developer Mac). The options it passes a custom signer carry the certificate
 * hash instead, which names exactly one identity. Otherwise this is the default: osx-sign with a
 * few retries for timestamp-server hiccups.
 */
exports.default = async function signMac(opts) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await signAsync(opts);
      return;
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};
