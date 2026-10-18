#include "media-source/FrameSnapshot.h"
#include <algorithm>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>

void require(bool result, const char* message) { if (!result) throw std::runtime_error(message); }
int main() {
    try {
        using namespace phonecam;
        auto frame = std::make_unique<SharedFrame>();
        frame->sequence = 2; frame->width = frameWidth; frame->height = frameHeight; frame->timestampMs = 1000;
        for (std::size_t i = 0; i < frameBytes; i += 4) {
            frame->rgba[i] = 210; frame->rgba[i + 1] = 80; frame->rgba[i + 2] = 20; frame->rgba[i + 3] = 255;
        }
        FrameSnapshot snapshot; snapshot.initialize();
        const auto barrier = [] {};
        require(snapshot.read(frame.get(), 1001, barrier), "Initial complete frame missing");
        constexpr auto pitch = static_cast<std::int32_t>(frameWidth * 4);
        std::vector<std::uint8_t> output(frameBytes + 32, 0x5a);
        require(snapshot.writeBgra(output.data() + 16, frameBytes, pitch, 0xffffffff), "Positive RGB stride failed");
        require(output[16] == 20 && output[17] == 80 && output[18] == 210, "RGBA/BGRA colors incorrect");
        auto* topRow = output.data() + 16 + (frameHeight - 1) * pitch;
        require(snapshot.writeBgra(topRow, frameBytes, -pitch, 0xffffffff), "Negative RGB stride failed");
        require(topRow[0] == 20 && topRow[2] == 210, "Bottom-up colors incorrect");
        require(std::all_of(output.begin(), output.begin() + 16, [](auto x) { return x == 0x5a; }) &&
            std::all_of(output.end() - 16, output.end(), [](auto x) { return x == 0x5a; }), "RGB write crossed guard bytes");
        require(!snapshot.writeBgra(topRow, frameBytes - 1, -pitch, 0xffffffff), "Short buffer accepted");
        require(!snapshot.writeBgra(topRow, frameBytes, -4, 0xffffffff), "Narrow stride accepted");
        frame->sequence = 3; std::fill_n(frame->rgba, frameBytes, std::uint8_t{0});
        for (int i = 0; i < 100; ++i) {
            require(snapshot.read(frame.get(), 1010, barrier), "Concurrent writer caused black flash");
            require(snapshot.writeBgra(output.data() + 16, frameBytes, pitch, 0xffffffff) && output[18] == 210,
                "Incomplete frame replaced last complete frame");
        }
        require(!snapshot.read(frame.get(), 6001, barrier), "Stale frame retained after timeout");
        frame->sequence = 4; frame->timestampMs = 7000;
        require(snapshot.read(frame.get(), 7001, barrier), "New complete frame did not recover");
        frame->sequence = 6; frame->timestampMs = 7005;
        require(snapshot.read(frame.get(), 7006, [&] { frame->sequence = frame->sequence + 2; }),
            "Frame changed during copy caused a flash instead of retaining the complete frame");
        frame->sequence = 6; frame->width = 0; frame->height = 0;
        require(!snapshot.read(frame.get(), 7002, barrier), "Stopped camera kept showing old frame");
        require(!snapshot.writeBgra(output.data() + 16, frameBytes, pitch, 0xffffffff), "Stopped cached pixels remained available");
        frame->width = frameWidth; frame->height = frameHeight; frame->timestampMs = 0xfffffff0;
        require(snapshot.read(frame.get(), 5, barrier), "32-bit timestamp wrap incorrectly stale");
        std::cout << "Frame snapshot tests passed: contention, stale/stop, stride, colors, bounds, and timestamp wrap.\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
