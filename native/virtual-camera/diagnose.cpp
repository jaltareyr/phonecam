#include <windows.h>
#include <mfapi.h>
#include <mfvirtualcamera.h>
#include <iostream>

#pragma comment(lib, "Mfplat.lib")
#pragma comment(lib, "mfsensorgroup.lib")

int wmain() {
    const HRESULT startup = MFStartup(MF_VERSION);
    if (FAILED(startup)) {
        std::wcerr << L"Media Foundation startup failed: 0x" << std::hex << startup << L'\n';
        return 1;
    }

    BOOL supported = FALSE;
    const HRESULT result = MFIsVirtualCameraTypeSupported(
        MFVirtualCameraType_SoftwareCameraSource, &supported);
    if (FAILED(result)) {
        std::wcerr << L"Virtual camera capability check failed: 0x" << std::hex << result << L'\n';
        MFShutdown();
        return 2;
    }

    std::wcout << L"Windows software virtual camera supported: "
               << (supported ? L"yes" : L"no") << L'\n';
    MFShutdown();
    return supported ? 0 : 3;
}
