#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <iostream>
#include <string>

#pragma comment(lib, "Mfplat.lib")
#pragma comment(lib, "Mf.lib")
#pragma comment(lib, "Mfreadwrite.lib")

int wmain() {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) return 1;
    hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) { CoUninitialize(); return 2; }
    IMFAttributes* attributes = nullptr;
    IMFActivate** devices = nullptr;
    IMFMediaSource* source = nullptr;
    IMFSourceReader* reader = nullptr;
    IMFMediaBuffer* buffer = nullptr;
    IMFSample* sample = nullptr;
    UINT32 count = 0;
    hr = MFCreateAttributes(&attributes, 1);
    if (SUCCEEDED(hr)) hr = attributes->SetGUID(MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
        MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID);
    if (SUCCEEDED(hr)) hr = MFEnumDeviceSources(attributes, &devices, &count);
    for (UINT32 i = 0; SUCCEEDED(hr) && i < count; ++i) {
        wchar_t* name = nullptr;
        UINT32 length = 0;
        if (SUCCEEDED(devices[i]->GetAllocatedString(MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME,
            &name, &length))) {
            if (std::wstring(name).find(L"PhoneCam") != std::wstring::npos)
                hr = devices[i]->ActivateObject(IID_PPV_ARGS(&source));
            CoTaskMemFree(name);
            if (source) break;
        }
    }
    if (SUCCEEDED(hr) && !source) hr = HRESULT_FROM_WIN32(ERROR_NOT_FOUND);
    if (SUCCEEDED(hr)) hr = MFCreateSourceReaderFromMediaSource(source, nullptr, &reader);
    DWORD actualStream = 0;
    DWORD flags = 0;
    LONGLONG timestamp = 0;
    for (int attempt = 0; SUCCEEDED(hr) && attempt < 60 && !sample; ++attempt) {
        hr = reader->ReadSample(static_cast<DWORD>(MF_SOURCE_READER_FIRST_VIDEO_STREAM), 0,
            &actualStream, &flags, &timestamp, &sample);
        if (flags & MF_SOURCE_READERF_ENDOFSTREAM) break;
    }
    if (SUCCEEDED(hr) && sample) hr = sample->ConvertToContiguousBuffer(&buffer);
    if (SUCCEEDED(hr) && buffer) {
        BYTE* data = nullptr;
        DWORD maxLength = 0;
        DWORD length = 0;
        hr = buffer->Lock(&data, &maxLength, &length);
        if (SUCCEEDED(hr)) {
            unsigned long long checksum = 0;
            unsigned long long litPixels = 0;
            const DWORD lumaLength = (length == 1280 * 720 * 3 / 2) ? 1280 * 720 : length;
            for (DWORD i = 0; i < lumaLength; i += 4096) {
                checksum += data[i];
                if (data[i] > 24) ++litPixels;
            }
            std::wcout << L"PhoneCam frame received: " << length << L" bytes, flags "
                       << flags << L", sampled checksum " << checksum
                       << L", lit samples " << litPixels;
            if (length == 1280 * 720 * 3 / 2)
                std::wcout << L", first NV12 YUV " << static_cast<unsigned>(data[0])
                           << L"," << static_cast<unsigned>(data[1280 * 720])
                           << L"," << static_cast<unsigned>(data[1280 * 720 + 1]);
            std::wcout << L'\n';
            buffer->Unlock();
        }
    }
    if (FAILED(hr) || !sample) std::wcerr << L"PhoneCam capture failed or returned no frame: 0x"
        << std::hex << static_cast<unsigned>(hr) << L", flags " << flags << L'\n';
    if (buffer) buffer->Release();
    if (sample) sample->Release();
    if (reader) reader->Release();
    if (source) source->Release();
    if (devices) { for (UINT32 i = 0; i < count; ++i) devices[i]->Release(); CoTaskMemFree(devices); }
    if (attributes) attributes->Release();
    MFShutdown();
    CoUninitialize();
    return SUCCEEDED(hr) && sample ? 0 : 3;
}
