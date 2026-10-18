# Third-party notices

PhoneCam's original code is released under the [MIT license](LICENSE).
Third-party components retain their respective copyright and license terms.

## Windows virtual camera

Files in `native/virtual-camera/media-source` derive from Microsoft's
[Windows-Camera virtual camera sample](https://github.com/microsoft/Windows-Camera/tree/master/Samples/VirtualCamera).
They retain Microsoft's copyright notices and the
[Microsoft MIT license](native/virtual-camera/LICENSE.microsoft). PhoneCam
modifies the sample to read live frames and exposes it through its own manager.
The native build also restores the packages pinned in
`native/virtual-camera/media-source/packages.config`; those packages retain
their own notices and licenses.

## Desktop runtime and JavaScript dependencies

The desktop distribution includes Electron and Chromium, which carry their
own licenses and third-party notices. Keep the `LICENSE` and
`LICENSES.chromium.html` files beside the executable. JavaScript dependencies
are listed in `package.json` and locked in `package-lock.json`; their license
files remain in the packaged application's dependencies. They include
`@peculiar/x509`, `bonjour-service`, `qrcode`, `reflect-metadata`, and `ws`.
Build tools are development dependencies and have their own licenses.

## Product references

iVCam and E2ESOFT are names of independent third-party products and owners.
PhoneCam is an independent implementation. No iVCam executable, driver,
protocol implementation, model, LUT, icon, or artwork is distributed here.
REA was used for limited component inspection during research and is not a
runtime dependency. Research notes are retained as historical evidence, not
as compatibility or feature-parity claims.
