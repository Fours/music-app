import type { CapacitorConfig } from '@capacitor/cli'

// The iOS app wraps the same Vite build as the website. See docs/ios-app-plan.md.
const config: CapacitorConfig = {
  appId: 'com.kylewillett.skyloom',
  appName: 'Skyloom',
  webDir: 'dist',
  // The paper colour from index.html's theme-color, so launch doesn't flash white.
  backgroundColor: '#f6f4f0',
  ios: {
    // The page handles safe areas itself with env(safe-area-inset-*).
    contentInset: 'never',
  },
}

export default config
