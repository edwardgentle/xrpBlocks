program XRPServePack;
{$APPTYPE CONSOLE}
{$R *.res}

{
  XRPServePack - TEST BUILD of XRPServe that serves the XRPBlocks IDE from
  one encrypted file, xrpblocks.pak, instead of loose files.

  Put XRPServePack.exe and xrpblocks.pak in the same folder. No index.html,
  js, css or devices folders are needed there. The pack is read once at
  startup, checked, decrypted into memory and served from memory. If even
  one byte of the pack has been changed, the server refuses to start.

  If there is no xrpblocks.pak next to the exe, it falls back to serving
  loose files from its own folder, exactly like XRPServe (handy for
  development). A pack that is present but fails the check is never
  bypassed.

  Build the pack with:  python tools\build_pack.py
  The key is compiled in from PackKey.inc (created by build_pack.py
  --genkey). If PackKey.inc changes, rebuild this exe AND the pack.

  Crypto uses only System.Hash (SHA-256), which ships with Delphi:
    encKey = SHA256(key + 'enc'), macKey = SHA256(key + 'mac')
    keystream block i = SHA256(encKey + nonce + UInt64(i))
    tag = HMAC-SHA256(macKey, header + body)
  See tools\build_pack.py for the full file layout.

  Usage:  XRPServePack.exe [port]        Start serving (default port 8765)
          XRPServePack.exe stop [port]   Stop an already-running instance
}

uses
  System.SysUtils,
  System.Classes,
  System.IOUtils,
  System.StrUtils,
  System.NetEncoding,
  System.Hash,
  System.Generics.Collections,
  Winapi.Windows,
  Winapi.ShellAPI,
  IdContext,
  IdCustomHTTPServer,
  IdHTTPServer,
  IdGlobal,
  IdSchedulerOfThreadPool;

{$I PackKey.inc}

const
  DEFAULT_PORT = 8765;
  STOP_EVENT_NAME = 'Global\XRPServe_StopEvent_%d';
  PACK_FILE_NAME = 'xrpblocks.pak';
  PACK_VERSION = 1;
  PACK_HEADER_LEN = 21; // 'XRPK' + version byte + 16-byte nonce
  PACK_NONCE_OFS = 5;
  PACK_NONCE_LEN = 16;
  PACK_TAG_LEN = 32;

type
  TPackEntries = TDictionary<string, TBytes>;

procedure ShowFatal(const Msg: string);
begin
  Winapi.Windows.MessageBox(0, PChar(Msg), 'XRPServe', MB_ICONERROR or MB_OK);
end;

{ --------------------------------------------------------------------------
  Pack reading
  -------------------------------------------------------------------------- }

function Sha256Of(const A, B: TBytes): TBytes;
var
  H: THashSHA2;
begin
  H := THashSHA2.Create;           // SHA-256 is the default
  if Length(A) > 0 then H.Update(A);
  if Length(B) > 0 then H.Update(B);
  Result := H.HashAsBytes;
end;

function HmacSha256(const Key, Data: TBytes): TBytes;
var
  IPad, OPad, Inner: TBytes;
  I: Integer;
  B: Byte;
begin
  // Key is 32 bytes, shorter than SHA-256's 64-byte block, so no pre-hash.
  SetLength(IPad, 64);
  SetLength(OPad, 64);
  for I := 0 to 63 do
  begin
    if I < Length(Key) then B := Key[I] else B := 0;
    IPad[I] := B xor $36;
    OPad[I] := B xor $5C;
  end;
  Inner := Sha256Of(IPad, Data);
  Result := Sha256Of(OPad, Inner);
end;

function SameTag(const A, B: TBytes): Boolean;
var
  I: Integer;
  Diff: Byte;
begin
  Result := False;
  if (Length(A) <> PACK_TAG_LEN) or (Length(B) <> PACK_TAG_LEN) then Exit;
  Diff := 0;
  for I := 0 to PACK_TAG_LEN - 1 do
    Diff := Diff or (A[I] xor B[I]);
  Result := Diff = 0;
end;

function Suffixed(const Key: TBytes; const S: string): TBytes;
var
  I: Integer;
begin
  SetLength(Result, Length(Key) + Length(S));
  for I := 0 to High(Key) do Result[I] := Key[I];
  for I := 1 to Length(S) do Result[Length(Key) + I - 1] := Byte(Ord(S[I]));
end;

{ Decrypt Body in place with the SHA-256 counter keystream. }
procedure XorKeystream(var Body: TBytes; const EncKey, Nonce: TBytes);
var
  Block, KS: TBytes;
  H: THashSHA2;
  Counter: UInt64;
  Pos, J, N, I: Integer;
begin
  // Block = encKey (32) + nonce (16) + counter (8, little-endian)
  SetLength(Block, 56);
  for I := 0 to 31 do Block[I] := EncKey[I];
  for I := 0 to 15 do Block[32 + I] := Nonce[I];
  Counter := 0;
  Pos := 0;
  while Pos < Length(Body) do
  begin
    for I := 0 to 7 do
      Block[48 + I] := Byte((Counter shr (8 * I)) and $FF);
    H := THashSHA2.Create;
    H.Update(Block);
    KS := H.HashAsBytes;
    N := Length(Body) - Pos;
    if N > 32 then N := 32;
    for J := 0 to N - 1 do
      Body[Pos + J] := Body[Pos + J] xor KS[J];
    Inc(Pos, 32);
    Inc(Counter);
  end;
end;

function LoadPack(const FileName: string; Entries: TPackEntries;
  out ErrMsg: string): Boolean;
var
  Blob, Key, EncKey, MacKey, Nonce, Signed, Tag, Body, Data: TBytes;
  I, P, Count, PathLen, DataLen: Integer;
  Path: string;

  function Need(N: Integer): Boolean;
  begin
    Result := (N >= 0) and (P + N <= Length(Body));
  end;

  function ReadU16: Integer;
  begin
    Result := Integer(Body[P]) or (Integer(Body[P + 1]) shl 8);
    Inc(P, 2);
  end;

  function ReadU32: Integer;
  begin
    Result := Integer(Cardinal(Body[P]) or (Cardinal(Body[P + 1]) shl 8) or
      (Cardinal(Body[P + 2]) shl 16) or (Cardinal(Body[P + 3]) shl 24));
    Inc(P, 4);
  end;

begin
  Result := False;
  ErrMsg := 'The XRPBlocks pack is damaged or has been modified.';

  Blob := TFile.ReadAllBytes(FileName);
  if Length(Blob) < PACK_HEADER_LEN + PACK_TAG_LEN then Exit;
  if (Blob[0] <> Ord('X')) or (Blob[1] <> Ord('R')) or (Blob[2] <> Ord('P'))
    or (Blob[3] <> Ord('K')) then Exit;
  if Blob[4] <> PACK_VERSION then
  begin
    ErrMsg := 'This XRPBlocks pack was made for a different version of XRPServe.';
    Exit;
  end;

  SetLength(Key, 32);
  for I := 0 to 31 do Key[I] := PACK_KEY[I];
  EncKey := Sha256Of(Suffixed(Key, 'enc'), nil);
  MacKey := Sha256Of(Suffixed(Key, 'mac'), nil);

  // Check the tag BEFORE decrypting or parsing anything.
  Signed := Copy(Blob, 0, Length(Blob) - PACK_TAG_LEN);
  Tag := Copy(Blob, Length(Blob) - PACK_TAG_LEN, PACK_TAG_LEN);
  if not SameTag(Tag, HmacSha256(MacKey, Signed)) then Exit;

  Nonce := Copy(Blob, PACK_NONCE_OFS, PACK_NONCE_LEN);
  Body := Copy(Blob, PACK_HEADER_LEN, Length(Blob) - PACK_HEADER_LEN - PACK_TAG_LEN);
  XorKeystream(Body, EncKey, Nonce);

  P := 0;
  if not Need(4) then Exit;
  Count := ReadU32;
  for I := 1 to Count do
  begin
    if not Need(2) then Exit;
    PathLen := ReadU16;
    if not Need(PathLen) then Exit;
    Path := TEncoding.UTF8.GetString(Body, P, PathLen);
    Inc(P, PathLen);
    if not Need(4) then Exit;
    DataLen := ReadU32;
    if not Need(DataLen) then Exit;
    Data := Copy(Body, P, DataLen);
    Inc(P, DataLen);
    Entries.AddOrSetValue(Path, Data);
  end;
  if P <> Length(Body) then Exit;

  Result := True;
  ErrMsg := '';
end;

{ --------------------------------------------------------------------------
  Licence banner (console)
  -------------------------------------------------------------------------- }

procedure ShowBanner;
begin
  WriteLn('==============================================================================');
  WriteLn(' XRP Blocks (local edition) - development preview');
  WriteLn(' Copyright (c) 2026 Edward Gentle');
  WriteLn;
  WriteLn(' Free of charge for use in schools and other educational settings.');
  WriteLn(' Please do not modify, sell or redistribute this preview without the');
  WriteLn(' written permission of the author. The source code will be released as');
  WriteLn(' open source once development is complete. Provided "as is", without');
  WriteLn(' warranty of any kind.');
  WriteLn;
  WriteLn(' Built with open-source software, each under its own licence:');
  WriteLn('   XRPBlocks            (c) 2026 Nigel Verhoek                   MIT');
  WriteLn('   Blockly 12.5.1       (c) Google LLC                           Apache-2.0');
  WriteLn('   Lucide icons 1.17.0  (c) Lucide Icons and Contributors        ISC');
  WriteLn('                        (Feather-derived icons (c) Cole Bemis)   MIT');
  WriteLn('   TCS34725 driver      portions (c) 2012 Adafruit Industries    BSD');
  WriteLn('   Indy                 (c) 1993-2018 Chad Z. Hower (Kudzu)');
  WriteLn('                        and the Indy Pit Crew           Indy Modified BSD');
  WriteLn('==============================================================================');
  WriteLn;
end;

{ Full licence texts: licences.txt inside the pack, or LICENCES.txt next to
  the exe in folder mode. }
procedure ShowLicences(Entries: TPackEntries; const DocRoot: string);
var
  Data: TBytes;
  FileName: string;
begin
  SetLength(Data, 0);
  if Entries <> nil then
    Entries.TryGetValue('licences.txt', Data)
  else
  begin
    FileName := TPath.Combine(DocRoot, 'LICENCES.txt');
    if TFile.Exists(FileName) then
      Data := TFile.ReadAllBytes(FileName);
  end;
  WriteLn;
  if Length(Data) = 0 then
    WriteLn('The licence file (LICENCES.txt) was not found.')
  else
    WriteLn(TEncoding.UTF8.GetString(Data));
  WriteLn;
end;

{ --------------------------------------------------------------------------
  Server
  -------------------------------------------------------------------------- }

type
  TXRPServeApp = class
  private
    FDocRoot: string;
    FPort: Integer;
    FEntries: TPackEntries; // nil = folder mode
    function MimeTypeFor(const FileName: string): string;
    function ResolvePath(const URLPath: string): string;
    function PackKeyFor(const URLPath: string): string;
    procedure BrowserOpenThreadProc;
  public
    constructor Create(const ADocRoot: string; APort: Integer;
      AEntries: TPackEntries);
    destructor Destroy; override;
    procedure HandleCommandGet(AContext: TIdContext;
      ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
    procedure OpenBrowserAsync;
  end;

constructor TXRPServeApp.Create(const ADocRoot: string; APort: Integer;
  AEntries: TPackEntries);
begin
  inherited Create;
  FDocRoot := ADocRoot;
  FPort := APort;
  FEntries := AEntries; // takes ownership
end;

destructor TXRPServeApp.Destroy;
begin
  FEntries.Free;
  inherited;
end;

function TXRPServeApp.MimeTypeFor(const FileName: string): string;
var
  Ext: string;
begin
  Ext := LowerCase(ExtractFileExt(FileName));
  if Ext = '.html' then Result := 'text/html; charset=utf-8'
  else if Ext = '.htm' then Result := 'text/html; charset=utf-8'
  else if Ext = '.js' then Result := 'text/javascript; charset=utf-8'
  else if Ext = '.mjs' then Result := 'text/javascript; charset=utf-8'
  else if Ext = '.css' then Result := 'text/css; charset=utf-8'
  else if Ext = '.json' then Result := 'application/json; charset=utf-8'
  else if Ext = '.svg' then Result := 'image/svg+xml'
  else if Ext = '.png' then Result := 'image/png'
  else if Ext = '.jpg' then Result := 'image/jpeg'
  else if Ext = '.jpeg' then Result := 'image/jpeg'
  else if Ext = '.gif' then Result := 'image/gif'
  else if Ext = '.ico' then Result := 'image/x-icon'
  else if Ext = '.mp3' then Result := 'audio/mpeg'
  else if Ext = '.cur' then Result := 'image/x-icon'
  else if Ext = '.woff' then Result := 'font/woff'
  else if Ext = '.woff2' then Result := 'font/woff2'
  else if Ext = '.pdf' then Result := 'application/pdf'
  else if Ext = '.py' then Result := 'text/x-python; charset=utf-8'
  else if Ext = '.md' then Result := 'text/markdown; charset=utf-8'
  else if Ext = '.txt' then Result := 'text/plain; charset=utf-8'
  else Result := 'application/octet-stream';
end;

function TXRPServeApp.ResolvePath(const URLPath: string): string;
var
  Relative, RootFull: string;
begin
  Relative := URLPath;
  if (Relative = '') or (Relative = '/') then
    Relative := '/index.html';
  if Pos('?', Relative) > 0 then
    Relative := Copy(Relative, 1, Pos('?', Relative) - 1);
  Relative := TNetEncoding.URL.Decode(Relative);
  Relative := StringReplace(Relative, '/', PathDelim, [rfReplaceAll]);
  if (Relative <> '') and (Relative[1] = PathDelim) then
    Delete(Relative, 1, 1);
  RootFull := TPath.GetFullPath(FDocRoot);
  Result := TPath.GetFullPath(TPath.Combine(RootFull, Relative));
  if not Result.StartsWith(RootFull, True) then
    Result := '';
end;

{ Pack entries are stored lower case with "/" separators, e.g. "js/app.js".
  A dictionary lookup can never reach outside the pack, so ".." needs no
  special handling here. }
function TXRPServeApp.PackKeyFor(const URLPath: string): string;
begin
  Result := URLPath;
  if Pos('?', Result) > 0 then
    Result := Copy(Result, 1, Pos('?', Result) - 1);
  Result := TNetEncoding.URL.Decode(Result);
  Result := StringReplace(Result, '\', '/', [rfReplaceAll]);
  while (Result <> '') and (Result[1] = '/') do
    Delete(Result, 1, 1);
  if Result = '' then
    Result := 'index.html';
  Result := LowerCase(Result);
end;

procedure TXRPServeApp.HandleCommandGet(AContext: TIdContext;
  ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
var
  FilePath, PackKey: string;
  Data: TBytes;
begin
  AResponseInfo.CustomHeaders.Values['Cache-Control'] :=
    'no-store, no-cache, must-revalidate, max-age=0';
  AResponseInfo.CustomHeaders.Values['Pragma'] := 'no-cache';
  AResponseInfo.CustomHeaders.Values['Expires'] := '0';

  if FEntries <> nil then
  begin
    // --- Pack mode: serve only what is inside xrpblocks.pak. ---
    PackKey := PackKeyFor(ARequestInfo.Document);
    if not FEntries.TryGetValue(PackKey, Data) then
    begin
      AResponseInfo.ResponseNo := 404;
      AResponseInfo.ContentText := '404 Not Found: ' + ARequestInfo.Document;
      Exit;
    end;
    AResponseInfo.ResponseNo := 200;
    AResponseInfo.ContentType := MimeTypeFor(PackKey);
    AResponseInfo.ContentStream := TBytesStream.Create(Data);
    AResponseInfo.FreeContentStream := True;
    Exit;
  end;

  // --- Folder mode (no pack present): same as XRPServe. ---
  FilePath := ResolvePath(ARequestInfo.Document);
  if (FilePath = '') or (not TFile.Exists(FilePath)) then
  begin
    AResponseInfo.ResponseNo := 404;
    AResponseInfo.ContentText := '404 Not Found: ' + ARequestInfo.Document;
    Exit;
  end;
  AResponseInfo.ResponseNo := 200;
  AResponseInfo.ContentType := MimeTypeFor(FilePath);
  AResponseInfo.ContentStream :=
    TFileStream.Create(FilePath, fmOpenRead or fmShareDenyWrite);
  AResponseInfo.FreeContentStream := True;
end;

procedure TXRPServeApp.BrowserOpenThreadProc;
var
  URL: string;
begin
  Sleep(1500);
  URL := Format('http://localhost:%d/', [FPort]);
  ShellExecute(0, 'open', PChar(URL), nil, nil, SW_SHOWNORMAL);
end;

procedure TXRPServeApp.OpenBrowserAsync;
begin
  TThread.CreateAnonymousThread(BrowserOpenThreadProc).Start;
end;

{ --------------------------------------------------------------------------- }
var
  App: TXRPServeApp;
  Server: TIdHTTPServer;
  Scheduler: TIdSchedulerOfThreadPool;
  DocRoot, PackPath, ErrMsg, InputLine: string;
  Entries: TPackEntries;
  Port: Integer;
  StopEvent: THandle;
  CreateEventErr: Cardinal;
begin
  try
    if (ParamCount >= 1) and SameText(ParamStr(1), 'stop') then
    begin
      Port := DEFAULT_PORT;
      if (ParamCount >= 2) and (not TryStrToInt(ParamStr(2), Port)) then
      begin
        ShowFatal('Port must be a number.');
        ExitCode := 1;
        Exit;
      end;
      StopEvent := OpenEvent(EVENT_MODIFY_STATE, False,
        PChar(Format(STOP_EVENT_NAME, [Port])));
      if StopEvent = 0 then
      begin
        ShowFatal(Format(
          'XRPServe does not appear to be running on port %d.', [Port]));
        ExitCode := 1;
        Exit;
      end;
      SetEvent(StopEvent);
      CloseHandle(StopEvent);
      Exit;
    end;

    DocRoot := ExtractFilePath(ParamStr(0));
    PackPath := TPath.Combine(DocRoot, PACK_FILE_NAME);
    Entries := nil;

    if TFile.Exists(PackPath) then
    begin
      Entries := TPackEntries.Create;
      if not LoadPack(PackPath, Entries, ErrMsg) then
      begin
        Entries.Free;
        ShowFatal(ErrMsg + sLineBreak + PackPath);
        ExitCode := 1;
        Exit;
      end;
      if not Entries.ContainsKey('index.html') then
      begin
        Entries.Free;
        ShowFatal('The XRPBlocks pack does not contain index.html.');
        ExitCode := 1;
        Exit;
      end;
    end
    else if not TFile.Exists(TPath.Combine(DocRoot, 'index.html')) then
    begin
      ShowFatal('Neither ' + PACK_FILE_NAME + ' nor index.html was found in this folder:' +
        sLineBreak + DocRoot);
      ExitCode := 1;
      Exit;
    end;

    Port := DEFAULT_PORT;
    if (ParamCount >= 1) and (not TryStrToInt(ParamStr(1), Port)) then
    begin
      Entries.Free;
      ShowFatal('Port must be a number.');
      ExitCode := 1;
      Exit;
    end;

    StopEvent := CreateEvent(nil, True, False,
      PChar(Format(STOP_EVENT_NAME, [Port])));
    CreateEventErr := GetLastError;
    if StopEvent = 0 then
    begin
      Entries.Free;
      ShowFatal(Format(
        'Could not create the internal stop event for port %d (error %d).',
        [Port, CreateEventErr]));
      ExitCode := 1;
      Exit;
    end;
    if CreateEventErr = ERROR_ALREADY_EXISTS then
    begin
      Entries.Free;
      ShowFatal(Format('XRPServe is already running on port %d.', [Port]));
      CloseHandle(StopEvent);
      ExitCode := 1;
      Exit;
    end;

    App := TXRPServeApp.Create(DocRoot, Port, Entries); // App now owns Entries
    try
      Server := TIdHTTPServer.Create(nil);
      try
        Scheduler := TIdSchedulerOfThreadPool.Create(Server);
        Scheduler.PoolSize := 20;
        Server.Scheduler := Scheduler;
        Server.DefaultPort := Port;
        Server.OnCommandGet := App.HandleCommandGet;

        try
          Server.Active := True;
        except
          on E: Exception do
          begin
            ShowFatal(Format(
              'Could not start the server on port %d: %s' + sLineBreak +
              'If the port is in use, try:  XRPServePack.exe %d',
              [Port, E.Message, Port + 1]));
            ExitCode := 1;
            Exit;
          end;
        end;

        ShowBanner;
        if Entries <> nil then
          WriteLn(Format(' Serving the encrypted pack (%d files).', [Entries.Count]))
        else
          WriteLn(' No pack found. Serving loose files from: ' + DocRoot);
        WriteLn(Format(' Address: http://localhost:%d/', [Port]));
        WriteLn;
        WriteLn(' Type L and press ENTER to show the full licence texts.');
        WriteLn(Format(' They are also at http://localhost:%d/licences.txt', [Port]));
        WriteLn(' Press ENTER on its own to stop the server.');
        WriteLn;

        App.OpenBrowserAsync;
        repeat
          ReadLn(InputLine);
          if SameText(Trim(InputLine), 'L') then
          begin
            ShowLicences(Entries, DocRoot);
            WriteLn(' Type L and press ENTER to show the licences again,');
            WriteLn(' or press ENTER on its own to stop the server.');
          end
          else
            Break;
        until False;
      finally
        Server.Active := False;
        Server.Free;
      end;
    finally
      App.Free;
      CloseHandle(StopEvent);
    end;
  except
    on E: Exception do
      ShowFatal(E.ClassName + ': ' + E.Message);
  end;
end.
