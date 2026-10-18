PhoneCam's first public alpha turns an Android Chrome camera into a local Windows
desktop preview and includes a native Windows 11 x64 virtual camera.

This release adds PC approval for new phones, separate viewer/session credentials,
local-only desktop controls, bounded signaling, and native RGB stride fixes.
Frame export now runs independently of window painting, and the native reader
retains the last complete frame during concurrent writes to avoid black flashes.
Synthetic hidden-window streaming and native contention regression tests pass.

**Downloads are unsigned.** Use the Setup EXE to register/update the Windows
camera; the Portable EXE runs the preview and does not register a camera. Compare
downloads against SHA256SUMS.txt. See the README and connection guide for Android's
Wi-Fi CA setup or USB via ADB.

**Known limits:** virtual camera output is fixed at 720p/30. Live Zoom/Meet/Teams/OBS
compatibility, 30-minute calls, and installation on another PC still need validation.
Native Android/iOS apps, a Windows virtual microphone, and AI background effects
are not included. This release should be treated as an experimental alpha.

Community device tests, bug reports, and pull requests are welcome. Read
CONTRIBUTING.md and use private security reporting for vulnerabilities.
