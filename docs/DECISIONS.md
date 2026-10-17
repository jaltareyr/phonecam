# Design decisions

## 2026-10-17: Android browser sender for the first slice

A browser sender allows us to validate camera capture and transport before packaging an Android app. USB forwarding maps the PC server to `localhost` on Android, where browser camera permission is available without a LAN certificate. The first receiver is a browser page so transport can be tested independently of Windows virtual camera registration.

## 2026-10-17: Independent protocol

The installed iVCam application is reference material. PhoneCam uses its own pairing messages and WebRTC media transport. REA classified the installed `iVCam.exe` as native x86-64 PE, but without Ghidra it has not recovered native functions or iVCam's private network protocol. Interoperability with the iVCam mobile app is outside the current baseline.
