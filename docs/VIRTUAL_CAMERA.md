# Windows virtual camera work

The target is a user-mode Media Foundation software virtual camera, so other Windows applications can select PhoneCam as a capture device. This computer has Windows build 26200, Visual Studio 2022 Build Tools, and Windows SDK 10.0.22621.0. The native probe in `native/virtual-camera/diagnose.cpp` built successfully and reported `Windows software virtual camera supported: yes`.

Microsoft's MIT-licensed Windows-Camera virtual camera sample is available locally under ignored `tools/Windows-Camera`. Its `SimpleMediaSource` demonstrates synthetic frame production and its installer demonstrates registration. The current sample targets Windows SDK 10.0.26100.0, which is newer than the SDK installed here; it also uses NuGet packages and several project components. We will use it as an API reference while creating a focused PhoneCam source and frame bridge.

Next implementation steps:

1. Build a minimal COM media source that offers one 1280×720 NV12 or RGB stream at 30 fps and produces a known test pattern.
2. Register it as a current-user virtual camera and verify visibility in Windows Camera and OBS.
3. Transfer frames from the desktop receiver to the media source over a local shared-memory or named-pipe boundary, with timestamps and backpressure.
4. Add install and removal controls, then test after app exit, reconnect, and reboot.

No virtual camera has been registered by the current build. The native probe only checks API availability.
