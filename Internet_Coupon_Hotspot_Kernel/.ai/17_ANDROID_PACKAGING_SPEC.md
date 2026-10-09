# Phase 17: Android Packaging, PWA Evaluation, Permissions & Secure Storage

## 1. Architectural Decision: PWA vs. Capacitor vs. Native Kotlin

### A. Customer Captive Portal & Voucher Access: Progressive Web App (PWA)
- **Problem**: Forcing public cafe/hotspot customers to download an Android APK from Google Play or sideload an untrusted package just to access 30 minutes of Wi-Fi is an unacceptable friction barrier (>80% drop-off).
- **Solution**: Zero-install PWA with Web App Manifest (`/manifest.webmanifest`), responsive viewport, captive portal browser compatibility, offline connectivity banner (`OfflineIndicator`), and optional home screen installation (`PWAInstallButton`).
- **Delivery**: Instant access via standard captive portal redirect (`/` with Customer Portal tab or direct `/portal` route).

### B. Hotspot Owner & Operator Terminal: Hybrid Capacitor Container
- **Problem**: Hotspot operators running on dedicated Android POS terminals, tablets, or phones require persistent sessions, full-screen kiosk display, auto-reconnect, and native push/foreground alerts.
- **Solution**: Capacitor 6+ container (`capacitor.config.ts`) wrapping the React + Vite frontend bundle (`dist/`).
- **Status & Honest Disclosure**:
  - PWA Web App Manifest, Installability & Offline Indicators: **IMPLEMENTED & UNIT-TESTED**.
  - Physical Android Device / Gradle APK compilation: **NOT TESTED on physical hardware in cloud sandbox** (requires local Android SDK/Gradle).

---

## 2. Android Manifest & Permissions Specification (`AndroidManifest.xml`)

Targeting Android 11 through Android 15 (API Levels 30–35):

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.hotspot.internetcoupon">

    <!-- Essential Network Communications -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <!-- Android 13+ Notification Dispatch -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- Foreground Service for Authoritative Session Reconciliation -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- Hardware Features -->
    <uses-feature android:name="android.hardware.wifi" android:required="true" />

    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

---

## 3. Secure Storage Specification for Android

On Android devices, secrets (such as operator auth tokens, gateway admin API keys, and local voucher offline caches) must NOT be stored in unencrypted SharedPreferences.

### Architecture
- **Master Key**: Android Keystore Provider (`AndroidKeyStore`) with AES-256-GCM hardware-backed key encryption.
- **Encrypted Preferences**: Android Jetpack `EncryptedSharedPreferences`:
  - `MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)`
  - Key encryption scheme: `AES256_SIV`
  - Value encryption scheme: `AES256_GCM`
- **Fallback Web Storage**: Web Crypto API + PBKDF2/AES-GCM for browsers with `localStorage` salt and token rotation.

---

## 4. Verification Gates
- [x] Web App Manifest (`manifest.webmanifest`, `manifest.json`) compliant with Chromium & iOS installability standards.
- [x] In-app install button (`PWAInstallButton`) with `beforeinstallprompt` handling, standalone auto-suppression, and iOS instructions.
- [x] Dynamic offline indicator (`useOnlineStatus` + `OfflineIndicator`) warning users on network dropouts.
- [x] `capacitor.config.ts` configured for Android packaging.
- [ ] Physical device hardware validation: **NOT TESTED on physical device** (marked honest per Completion Gates).
