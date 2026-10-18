// PhoneCam frame bridge: retain complete frames across concurrent writes.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>

namespace phonecam {
constexpr std::uint32_t frameWidth = 1280;
constexpr std::uint32_t frameHeight = 720;
constexpr std::size_t frameBytes = frameWidth * frameHeight * 4;
struct SharedFrame {
    volatile std::int32_t sequence;
    std::uint32_t width;
    std::uint32_t height;
    std::uint32_t timestampMs;
    std::uint8_t rgba[frameBytes];
};
static_assert(offsetof(SharedFrame, rgba) == 16, "Frame file layout must match JavaScript writer");

class FrameSnapshot {
    std::vector<std::uint8_t> complete;
    std::vector<std::uint8_t> staging;
    std::int32_t sequence = 0;
    std::uint32_t timestamp = 0;
    bool available = false;
public:
    void initialize() { complete.resize(frameBytes); staging.resize(frameBytes); available = false; }

    template<class Barrier>
    bool read(const SharedFrame* source, std::uint32_t now, Barrier barrier) {
        if (!source) { available = false; return false; }
        for (int attempt = 0; attempt < 3; ++attempt) {
            const auto before = source->sequence;
            if (before & 1) continue;
            barrier();
            const auto width = source->width, height = source->height, stamp = source->timestampMs;
            if (width != frameWidth || height != frameHeight || std::uint32_t(now - stamp) > 5000) {
                barrier();
                if (before == source->sequence) { available = false; return false; }
                continue;
            }
            if (available && before == sequence && stamp == timestamp) {
                barrier();
                if (before == source->sequence) return true;
                continue;
            }
            std::memcpy(staging.data(), source->rgba, frameBytes);
            barrier();
            if (before == source->sequence) {
                complete.swap(staging);
                sequence = before;
                timestamp = stamp;
                available = true;
                return true;
            }
        }
        // A writer being busy is not a disconnected camera. Never return a
        // partially copied image or flash black between two valid frames.
        return available && std::uint32_t(now - timestamp) <= 5000;
    }

    static bool validLayout(std::size_t length, std::int32_t pitch) {
        const auto stride = pitch < 0 ? -std::int64_t(pitch) : std::int64_t(pitch);
        return stride >= frameWidth * 4 && std::uint64_t(stride) * frameHeight <= length;
    }

    bool writeBgra(std::uint8_t* output, std::size_t length, std::int32_t pitch, std::uint32_t mask) const {
        if (!output || !available || !validLayout(length, pitch)) return false;
        for (std::uint32_t row = 0; row < frameHeight; ++row) {
            const auto* source = complete.data() + row * frameWidth * 4;
            auto* target = output + static_cast<std::ptrdiff_t>(row) * pitch;
            for (std::uint32_t column = 0; column < frameWidth; ++column) {
                target[0] = source[2] & static_cast<std::uint8_t>(mask);
                target[1] = source[1] & static_cast<std::uint8_t>(mask >> 8);
                target[2] = source[0] & static_cast<std::uint8_t>(mask >> 16);
                target[3] = 0xff;
                source += 4; target += 4;
            }
        }
        return true;
    }
};
}
