# Contributing to PhoneCam

Thanks for helping make an open-source Android-to-Windows webcam practical.
Bug reports, device test results, accessibility improvements, documentation,
and code contributions are welcome.

## Before starting

Read the [README](README.md), [roadmap](docs/ROADMAP.md), and
[community guidelines](CODE_OF_CONDUCT.md). Search existing issues to avoid
duplicate work. For a substantial feature or protocol change, open an issue
with the use case and proposed approach before investing in a large patch.

## Development

Use Node.js 22.12+ (24 LTS recommended), then run `npm ci`. `npm start` starts
the local server and `npm run desktop` opens Electron. Native Windows camera
build requirements are in [DEVELOPMENT.md](docs/DEVELOPMENT.md).

Fork the repository and create a focused branch. Keep each pull request about
one problem. Explain the user-visible behavior and tradeoffs. Include a regression
test for changes to pairing, security, media transport, or native memory access.
For visual changes, include screenshots with synthetic or nonprivate content.

Before opening a PR:

```sh
npm run check
npm test
```

The CI workflow tests JavaScript on Windows and Linux with Node 22 and 24 and
compiles the native Windows camera. Passing CI does not prove a physical phone
works in Zoom; report the devices and applications actually tested. Follow
the [manual test guide](docs/TESTING.md) for changes touching the camera path.

For changes to the desktop stream/export path, also run `npm run test:desktop`
on Windows. It uses synthetic video and does not access a physical camera.

## Pull requests

Describe the problem, resulting behavior, verification, and known limitations.
Link the relevant issue when there is one. Draft PRs are welcome for early
feedback. Maintainers may request smaller changes or additional device testing.

Do not commit certificates, keys, credentials, pairing codes, captured frames,
personal recordings, `node_modules`, or packaged executables. Preserve third-party
notices and use original or appropriately licensed assets. Development must
keep PhoneCam's protocol and implementation independent of proprietary products.

By submitting a contribution, you agree to license your contribution under
the project's MIT license. No separate contributor agreement is required.

## Reporting problems

Use the issue forms for bugs, feature requests, or device compatibility results.
Include steps, expected/actual behavior, OS/app versions, and relevant redacted
errors. Security vulnerabilities belong in a
[private security report](https://github.com/jaltareyr/phonecam/security/advisories/new).
