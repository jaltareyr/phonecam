# Connect an Android phone to PhoneCam

## Requirements

- Windows 11 x64, build 22000 or newer, for the native virtual camera.
- Android with a recent Chrome version. The current phone client is a web page.
- A trusted local network for Wi-Fi, or a USB cable plus Android SDK platform-tools.
- Administrator access to install/register the Windows camera. No administrator
  access is needed for the portable preview after ordinary file permissions are available.

## Windows installation

Download the installer from [GitHub Releases](https://github.com/jaltareyr/phonecam/releases).
Compare its hash with the release's `SHA256SUMS.txt` using PowerShell:

```powershell
Get-FileHash .\PhoneCam-Setup-0.7.0-x64.exe -Algorithm SHA256
```

Run Setup and approve the Windows administrator prompt. The alpha executable is
unsigned; publisher identity is not validated by a commercial signing certificate.
Install only a release you intend to test. Setup installs the app and native
camera under Program Files. Start PhoneCam from the Start menu.

Close existing PhoneCam apps and source development servers before an upgrade.
Restart Zoom, Meet's browser tab, or other camera consumers after updating, because
they may keep the old media source loaded. Do not run two desktop instances that
write the same frame bridge.

## WiFi

1. Connect the phone and PC to the same trusted network. Guest networks, client
   isolation, VPN routes, or firewall rules may prevent direct communication.
2. In PhoneCam, click the connection indicator at the lower left. Select **Wi-Fi**.
3. For initial setup, open the displayed address on Android and obtain the PC's
   CA certificate using the download link in the connection panel or phone page.
   If a certificate warning prevents access, complete that step yourself on your
   phone only after confirming the address belongs to your PC. Merely bypassing
   the warning may not make camera capture available.
4. In Android Settings, find **Install a certificate → CA certificate** (the path
   varies by manufacturer). Install that PC's `phonecam-ca.crt`. This gives the
   generated CA trust on your phone; never install one from an unknown PC. The
   CA private key stays on your PC and must not be shared.
5. Reopen the displayed HTTPS address, or scan the QR code. The QR includes the
   pairing code. Allow Chrome's camera permission; allow microphone only if needed.
6. Choose settings, tap **Start**, and click **Accept phone** on the PC. The phone
   preview should then appear on Windows. A fresh page/phone needs approval;
   a brief reconnect in the same session can resume automatically.

If a Windows firewall prompt appears, allow only the network scope you intend
to use. Do not forward port 8443 through your router. Codes awaiting a phone
expire after five minutes; use **Get new code** if an old QR stops working.

## USB

Install Android SDK platform-tools from the Android developer site and enable
USB debugging on your phone. Connect it and approve that PC on Android, then:

```sh
adb devices
adb reverse tcp:8080 tcp:8080
```

Open `http://localhost:8080/phone` in Android Chrome, enter the code from the PC,
tap Start, and approve the phone on the PC. Chrome treats localhost as a secure
camera origin, so this path does not need the Wi-Fi CA. Reapply the ADB forwarding
after reconnecting a cable or restarting ADB. This alpha's USB mode uses ADB;
it is not a native phone USB app.

## Use the Windows camera

Keep the desktop app running with live video. Select **PhoneCam** in the desired
application's camera selector. The current output is 720p/30 regardless of the
phone capture setting. Camera permission in Windows and the consumer app must
allow access. A selectable phone microphone device is not included.

Virtual-camera enumeration and Media Foundation capture have been tested on the
development PC. Zoom/Meet/Teams/OBS live compatibility and long calls remain
open validation work; record results using the repository's device-test form.

## Troubleshooting

- **Phone camera will not start:** check Android's Camera access toggle and Chrome
  permission, close other camera tabs/apps, then force stop and reopen Chrome.
  Another Chrome tab held the camera in one verified development failure.
- **Phone preview works, PC blank:** approve the connection on the PC, check both
  devices are reachable, and inspect the phone's Sending and PC's Received stats.
- **Call app is dark:** first confirm the desktop preview, select PhoneCam, install
  the newest alpha, and restart the consumer. Include actual negotiated dimensions
  and codec in a device report; avoid assuming the requested resolution was delivered.
- **Port 8080 in use:** close older PhoneCam or development servers, then restart.
- **Wi-Fi address changed:** the server renews its leaf certificate. Reopen the new
  address shown by the PC; a different PC has a different CA and needs separate trust.

## Uninstall

Use Windows Installed apps to uninstall PhoneCam. Setup removes the virtual
camera registration. Per-user certificate files remain under
`%LOCALAPPDATA%\PhoneCam\certs`; source runs use `certs/` in the checkout.
Remove that PhoneCam CA from Android's trusted user certificates when finished.
Delete local certificate files only when you no longer need that PC's pairing setup.
