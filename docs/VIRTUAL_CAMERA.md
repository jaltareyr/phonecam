# Windows virtual camera work

The target is a user-mode Media Foundation software virtual camera, so other Windows applications can select PhoneCam as a capture device. This computer has Windows build 26200, Visual Studio 2022 Build Tools, and Windows SDK 10.0.22621.0. The native probe in `native/virtual-camera/diagnose.cpp` built successfully and reported `Windows software virtual camera supported: yes`.

Microsoft's MIT-licensed Windows-Camera virtual camera sample is available locally under ignored `tools/Windows-Camera`. Its `SimpleMediaSource` demonstrates synthetic frame production and its installer demonstrates registration. The current sample targets Windows SDK 10.0.26100.0, which is newer than the SDK installed here; it also uses NuGet packages and several project components. We will use it as an API reference while creating a focused PhoneCam source and frame bridge.

Implemented components and validation steps:

1. A COM media source offers one 1280×720 NV12 or RGB stream at 30 fps and reads the live frame file.
2. The installer registers it as an all-users virtual camera; uninstaller removes registration first.
3. The desktop writes frames to `%ProgramData%\PhoneCam\frame.bin` with sequence and timestamp metadata.
4. Validate installation, removal, app exit, reconnect, reboot, Windows Camera, and video-call selection.

The administrator installer must run before PhoneCam appears as a Windows camera. A compiled installer alone does not register it.
