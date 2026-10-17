#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfvirtualcamera.h>
#include <iostream>
#include <string>

#pragma comment(lib, "Mfplat.lib")
#pragma comment(lib, "Mf.lib")
#pragma comment(lib, "Mfsensorgroup.lib")
#pragma comment(lib, "Advapi32.lib")

namespace {
constexpr wchar_t sourceId[] = L"{2C01C8CD-D79C-416A-8700-7F7924E08088}";
constexpr wchar_t cameraName[] = L"PhoneCam";
constexpr wchar_t classKey[] = L"Software\\Classes\\CLSID\\{2C01C8CD-D79C-416A-8700-7F7924E08088}";

void showError(const wchar_t* step, HRESULT error) {
    std::wcerr << step << L" failed: 0x" << std::hex << static_cast<unsigned>(error) << L'\n';
}

HRESULT registerSource() {
    // Remove the per-user COM registration used during early local experiments.
    RegDeleteTreeW(HKEY_CURRENT_USER, classKey);
    wchar_t path[MAX_PATH];
    if (!GetModuleFileNameW(nullptr, path, MAX_PATH)) return HRESULT_FROM_WIN32(GetLastError());
    wchar_t* separator = wcsrchr(path, L'\\');
    if (!separator) return E_FAIL;
    *(separator + 1) = L'\0';
    if (wcscat_s(path, L"PhoneCamMediaSource.dll") != 0) return E_FAIL;
    const DWORD attributes = GetFileAttributesW(path);
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY))
        return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);

    HKEY key = nullptr;
    LONG result = RegCreateKeyExW(HKEY_LOCAL_MACHINE, classKey, 0, nullptr, 0,
        KEY_SET_VALUE | KEY_CREATE_SUB_KEY, nullptr, &key, nullptr);
    if (result != ERROR_SUCCESS) return HRESULT_FROM_WIN32(result);
    const wchar_t* description = L"PhoneCam media source";
    result = RegSetValueExW(key, nullptr, 0, REG_SZ,
        reinterpret_cast<const BYTE*>(description), static_cast<DWORD>((wcslen(description) + 1) * sizeof(wchar_t)));
    RegCloseKey(key);
    if (result != ERROR_SUCCESS) return HRESULT_FROM_WIN32(result);

    std::wstring inproc = std::wstring(classKey) + L"\\InprocServer32";
    result = RegCreateKeyExW(HKEY_LOCAL_MACHINE, inproc.c_str(), 0, nullptr, 0,
        KEY_SET_VALUE, nullptr, &key, nullptr);
    if (result != ERROR_SUCCESS) return HRESULT_FROM_WIN32(result);
    result = RegSetValueExW(key, nullptr, 0, REG_SZ,
        reinterpret_cast<const BYTE*>(path), static_cast<DWORD>((wcslen(path) + 1) * sizeof(wchar_t)));
    const wchar_t* threading = L"Both";
    if (result == ERROR_SUCCESS) result = RegSetValueExW(key, L"ThreadingModel", 0, REG_SZ,
        reinterpret_cast<const BYTE*>(threading), static_cast<DWORD>((wcslen(threading) + 1) * sizeof(wchar_t)));
    RegCloseKey(key);
    return HRESULT_FROM_WIN32(result);
}

HRESULT updateCamera(bool remove) {
    IMFVirtualCamera* camera = nullptr;
    HRESULT hr = MFCreateVirtualCamera(MFVirtualCameraType_SoftwareCameraSource,
        MFVirtualCameraLifetime_System, MFVirtualCameraAccess_CurrentUser,
        cameraName, sourceId, nullptr, 0, &camera);
    if (FAILED(hr)) return hr;
    hr = remove ? camera->Remove() : camera->Start(nullptr);
    camera->Release();
    return hr;
}

HRESULT listCameras() {
    IMFAttributes* attributes = nullptr;
    HRESULT hr = MFCreateAttributes(&attributes, 1);
    if (FAILED(hr)) return hr;
    hr = attributes->SetGUID(MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
        MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID);
    IMFActivate** devices = nullptr;
    UINT32 count = 0;
    if (SUCCEEDED(hr)) hr = MFEnumDeviceSources(attributes, &devices, &count);
    if (SUCCEEDED(hr)) {
        std::wcout << L"Camera devices: " << count << L'\n';
        for (UINT32 index = 0; index < count; ++index) {
            wchar_t* name = nullptr;
            UINT32 length = 0;
            if (SUCCEEDED(devices[index]->GetAllocatedString(
                MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, &name, &length))) {
                std::wcout << L"- " << name << L'\n';
                CoTaskMemFree(name);
            }
            devices[index]->Release();
        }
        CoTaskMemFree(devices);
    }
    attributes->Release();
    return hr;
}

HRESULT checkComSource() {
    CLSID clsid{};
    HRESULT hr = CLSIDFromString(sourceId, &clsid);
    if (FAILED(hr)) return hr;
    IMFActivate* activation = nullptr;
    hr = CoCreateInstance(clsid, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&activation));
    if (SUCCEEDED(hr)) {
        std::wcout << L"PhoneCam COM media source activates successfully\n";
        activation->Release();
    }
    return hr;
}

}

int wmain(int argc, wchar_t* argv[]) {
    if (argc != 2 || (wcscmp(argv[1], L"install") != 0 &&
        wcscmp(argv[1], L"remove") != 0 && wcscmp(argv[1], L"list") != 0 &&
        wcscmp(argv[1], L"check-com") != 0 &&
        wcscmp(argv[1], L"cleanup-user") != 0)) {
        std::wcerr << L"Usage: PhoneCamCameraManager install|remove|list|check-com|cleanup-user\n";
        return 2;
    }
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) { showError(L"COM initialization", hr); return 1; }
    hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) { showError(L"Media Foundation startup", hr); CoUninitialize(); return 1; }
    if (wcscmp(argv[1], L"install") == 0) {
        hr = registerSource();
        if (FAILED(hr)) showError(L"COM source registration", hr);
        if (SUCCEEDED(hr)) {
            hr = updateCamera(false);
            if (FAILED(hr)) {
                showError(L"virtual camera start", hr);
                RegDeleteTreeW(HKEY_LOCAL_MACHINE, classKey);
            }
        }
    } else if (wcscmp(argv[1], L"remove") == 0) {
        hr = updateCamera(true);
        if (SUCCEEDED(hr)) RegDeleteTreeW(HKEY_LOCAL_MACHINE, classKey);
        RegDeleteTreeW(HKEY_CURRENT_USER, classKey);
    } else if (wcscmp(argv[1], L"cleanup-user") == 0) {
        LONG result = RegDeleteTreeW(HKEY_CURRENT_USER, classKey);
        hr = result == ERROR_FILE_NOT_FOUND ? S_OK : HRESULT_FROM_WIN32(result);
    } else if (wcscmp(argv[1], L"check-com") == 0) hr = checkComSource();
    else hr = listCameras();
    if (FAILED(hr)) showError(argv[1], hr);
    else if (wcscmp(argv[1], L"list") != 0) std::wcout << L"PhoneCam camera " << argv[1] << L" succeeded\n";
    MFShutdown();
    CoUninitialize();
    return FAILED(hr) ? 1 : 0;
}
