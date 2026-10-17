# Windows virtual camera work

The `media-source` folder vendors and adapts the Microsoft Windows-Camera virtual camera sample under its MIT license (`LICENSE.microsoft`). PhoneCam now has its own CLSID and a 1280×720 media source. The selected Electron preview is letterboxed into a 1280×720 RGBA frame file; the media source reads completed frames and converts them to RGB32 or NV12. An absent or stale frame produces black video.

Build the DLL and camera manager with:

```powershell
./scripts/build-virtual-camera.ps1
```

Then package the desktop app. `package-desktop.mjs` copies the two native binaries to `release/PhoneCam-win32-x64/native`, beside `frame.bin`.

Windows must register the custom COM media source in the machine registry before `MFCreateVirtualCamera` can start it. From an **administrator** PowerShell terminal, after packaging:

```powershell
& 'D:\Projects_1\phonecam\release\PhoneCam-win32-x64\native\PhoneCamCameraManager.exe' install
& 'D:\Projects_1\phonecam\release\PhoneCam-win32-x64\native\PhoneCamCameraManager.exe' list
```

The manager only writes `HKLM\Software\Classes\CLSID\{2C01C8CD-D79C-416A-8700-7F7924E08088}` and registers one current-user camera. To remove the camera and that COM registration from an administrator terminal:

```powershell
& 'D:\Projects_1\phonecam\release\PhoneCam-win32-x64\native\PhoneCamCameraManager.exe' remove
```

**Verification status:** the DLL and manager build, the frame file protocol passes its test, and COM activation works in a normal user process. Per-user COM registration did not allow Windows virtual camera startup; the administrator UAC prompt was canceled, so system registration and video-call selection remain unverified. After installation, test the PhoneCam entry in Windows Camera or a browser camera selector with a connected phone before declaring this feature complete. Microsoft's [virtual camera API](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera) documents the registration model.
