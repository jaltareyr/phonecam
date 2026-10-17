# Windows virtual camera work

The `media-source` folder vendors the Microsoft Windows-Camera virtual camera sample under its MIT license (`LICENSE.microsoft`). This keeps the native C++ source and project reproducible in Git. Build it with:

```powershell
./scripts/build-virtual-camera.ps1
```

The build currently produces the sample's **synthetic** media source DLL. It is not installed or registered as a PhoneCam camera. The next native implementation steps are to replace its generated test frames with a frame bridge from the Electron/WebRTC receiver, assign a PhoneCam CLSID, register the COM source, and create the camera with `MFCreateVirtualCamera`. Only after video-call applications can select and display the live phone image will this feature be marked complete.
