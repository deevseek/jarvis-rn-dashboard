# Jarvis Emergency React Native Dashboard

Dashboard React Native / Expo untuk mengontrol Jarvis ESP32 melalui Adafruit IO.

## Fitur

- Dashboard status online/offline berdasarkan timestamp feed Adafruit IO.
- Polling realtime API Adafruit IO, default 1.5 detik.
- Tombol relay: test power relay, test reset relay, power on, hard reset, force power off.
- Tombol service via agent: restart Cloudflared, Nginx, PHP, MySQL, reboot server, power off server.
- Telemetry ESP32, server agent, alerts, audit log.
- Settings disimpan lokal di aplikasi dengan AsyncStorage.

## Feed yang dipakai

Dengan prefix `jarvis`, aplikasi memakai feed:

- `jarvis-command`
- `jarvis-result`
- `jarvis-status`
- `jarvis-heartbeat`
- `jarvis-telemetry`
- `jarvis-alerts`
- `jarvis-agent`
- `jarvis-audit`

## Cara menjalankan

```bash
npm install
npm install expo-asset
npx expo start
```

Untuk Android:

```bash
npx expo start --android
```

## Settings aplikasi

Buka tab Settings lalu isi:

- Adafruit Username: `antdev`
- Adafruit AIO Key: AIO Key Adafruit IO kamu
- Feed Prefix: `jarvis`
- Command Auth: samakan dengan firmware Jarvis, atau kosongkan jika firmware juga kosong
- API Base: `https://io.adafruit.com/api/v2`
- Polling ms: `1500`
- Offline setelah detik: `25`

## Catatan keamanan

AIO Key disimpan di storage lokal aplikasi. Jangan membagikan APK ke publik jika AIO Key sudah tertanam/tersimpan di perangkat.
