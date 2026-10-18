# Security model and limits

PhoneCam currently assumes a **trusted local network and a trusted Windows PC**.
It is an alpha, not a public camera relay or a hardened multi-user service.

## Connection boundaries

- Desktop HTML, room creation, QR generation, and connectivity metadata are
  available only over the loopback HTTP listener. The LAN HTTPS listener serves
  the phone page and phone signaling, not the desktop viewer.
- A newly created room has a six-character code plus a separate random 256-bit
  viewer credential. The code alone cannot take the viewer role. Viewer credentials
  are held in page memory and are not put into the QR code.
- A new phone must be approved in the PC app before signaling is relayed. A phone
  that knows the code can request approval; the user should approve only a phone
  they just connected. The code is not strong identity verification.
- An approved phone receives a random resume credential held in that page's memory.
  The same session can reconnect; another phone/page needs fresh approval.
- HTTP and WebSocket requests reject unrecognized Host values and cross-origin
  browser Origins. Room creation also requires the viewer's explicit request header.
  Origins alone do not authenticate nonbrowser clients; the token and approval
  checks remain necessary.
- Limits bound room creation, connection count, join attempts, messages, payloads,
  and idle sessions. Codes awaiting approval expire after five minutes; interrupted
  approved sessions have a two-minute reconnect grace period. Active sessions
  are kept alive with WebSocket ping/pong.

## Media and certificates

The server relays signaling only. WebRTC handles encrypted media between peers;
PhoneCam configures no external STUN/TURN service. No telemetry or cloud account
is implemented. Camera access and optional microphone access require the phone's
permission. Recordings/snapshots are user-initiated downloads.

Android Chrome needs a trusted secure origin for Wi-Fi camera capture. Each PC
generates a local CA and retains its private key. Installing that CA on a phone
grants trust to that CA, so protect its private key and remove the trust when
finished. A native mobile client with authenticated certificate pinning is future
work that could avoid system-wide user CA installation.

## Remaining limits

- The shared frame file is unencrypted and installer permissions allow local
  users to modify its directory. Other software or users with filesystem access
  may read or alter frames. The app is not isolated from a compromised PC.
- Rate limits reduce routine abuse; they are not comprehensive denial-of-service
  protection and have not undergone independent penetration testing.
- An attacker with a code can occupy a pending phone slot until decline/expiry.
  Desktop approval is essential, and the QR should be treated as session information.
- Browser camera capabilities, mobile background behavior, and Windows camera
  privacy settings differ across devices and OS versions.
- The alpha installer is unsigned and the update process is manual.

Do not expose the LAN listener to the public internet. Report vulnerabilities
using [SECURITY.md](../SECURITY.md).
