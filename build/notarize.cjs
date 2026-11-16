/**
 * Placeholder for macOS notarization — electron-builder calls this
 * after signing. Set APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD env vars
 * to enable. Does nothing in local builds.
 */
exports.default = async function notarize() {
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('[notarize] Skipping — APPLE_ID not set (local build)')
    return
  }
  // Real notarization would use @electron/notarize here
  console.log('[notarize] Notarization skipped (placeholder)')
}
