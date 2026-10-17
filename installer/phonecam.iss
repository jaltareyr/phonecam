#ifndef AppVersion
  #define AppVersion "0.2.0"
#endif

[Setup]
AppId={{8A9CFE1C-5914-42B1-B674-E34354102CC2}
AppName=PhoneCam
AppVersion={#AppVersion}
AppPublisher=PhoneCam Project
DefaultDirName={autopf}\PhoneCam
DefaultGroupName=PhoneCam
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\PhoneCam.exe
OutputDir=..\release\installer
OutputBaseFilename=PhoneCam-Setup-{#AppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
CloseApplications=yes
RestartApplications=no

[Dirs]
Name: "{commonappdata}\PhoneCam"; Permissions: users-modify

[Files]
Source: "..\release\PhoneCam-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "native\frame.bin,certs\*"

[Icons]
Name: "{autoprograms}\PhoneCam"; Filename: "{app}\PhoneCam.exe"
Name: "{autodesktop}\PhoneCam"; Filename: "{app}\PhoneCam.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[UninstallDelete]
Type: files; Name: "{commonappdata}\PhoneCam\frame.bin"
Type: dirifempty; Name: "{commonappdata}\PhoneCam"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    ExitCode := -1;
    if not Exec(ExpandConstant('{app}\native\PhoneCamCameraManager.exe'),
      'install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) then
      RaiseException('PhoneCam camera registration failed (code ' + IntToStr(ExitCode) + ').');
  end;
end;

function InitializeUninstall: Boolean;
var
  ExitCode: Integer;
begin
  ExitCode := -1;
  Result := Exec(ExpandConstant('{app}\native\PhoneCamCameraManager.exe'),
    'remove', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) and (ExitCode = 0);
  if not Result then
    MsgBox('PhoneCam could not remove its Windows camera (code ' + IntToStr(ExitCode) +
      '). The uninstall was stopped so the camera registration is not left pointing to missing files.', mbError, MB_OK);
end;
