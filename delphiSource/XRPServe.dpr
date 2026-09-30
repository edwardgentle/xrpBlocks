program XRPServe;
{$APPTYPE CONSOLE}
{$R *.res}

{
  XRPServe - standalone static file server for XRPBlocks.

  Replaces serve.py. Serves the folder this .exe lives in over
  http://localhost:<port>/, sends no-cache headers on every response
  (Chrome caches JS modules aggressively; a stale module against a new
  toolbox raises "Invalid block definition for type: ..."), and opens the
  default browser after a short delay, exactly like serve.py does.

  Runs with a visible console window. The console shows the server address
  and remains open while the server is running. Press ENTER to stop it
  cleanly. The "stop" command remains available as an alternative.

  Deployment: drop XRPServe.exe in the same folder as index.html
  (next to serve.py / start-xrpblocks.bat, which it replaces). No Python,
  no install step, no other files required - it is a single native exe.

  Usage:  XRPServe.exe [port]        Start serving (default port 8765)
          XRPServe.exe stop [port]   Stop an already-running instance

  Built with Indy (TIdHTTPServer + TIdCustomHTTPServer), which ships with
  Delphi. No third-party packages needed.
}

uses
  System.SysUtils,
  System.Classes,
  System.IOUtils,
  System.StrUtils,
  System.NetEncoding,
  Winapi.Windows,
  Winapi.ShellAPI,
  IdContext,
  IdCustomHTTPServer,
  IdHTTPServer,
  IdGlobal,
  IdSchedulerOfThreadPool;

const
  DEFAULT_PORT = 8765;
  // Named per port, so two instances on different ports don't collide and
  // "XRPServe.exe stop <port>" only ever stops the one it names.
  STOP_EVENT_NAME = 'Global\XRPServe_StopEvent_%d';

{ Only way left to surface a fatal error with no console attached. }
procedure ShowFatal(const Msg: string);
begin
  Winapi.Windows.MessageBox(0, PChar(Msg), 'XRPServe', MB_ICONERROR or MB_OK);
end;

type
  { OnCommandGet must be a method of an object (Indy's TIdHTTPCommandEvent is
    declared "of object"), so the handler and the doc-root/port state around
    it live on this one instance rather than as loose globals + a bare
    procedure - that mismatch is what E2009 was flagging. }
  TXRPServeApp = class
  private
    FDocRoot: string;
    FPort: Integer;
    function MimeTypeFor(const FileName: string): string;
    function ResolvePath(const URLPath: string): string;
    procedure BrowserOpenThreadProc;
  public
    constructor Create(const ADocRoot: string; APort: Integer);
    procedure HandleCommandGet(AContext: TIdContext;
      ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
    procedure OpenBrowserAsync;
    property DocRoot: string read FDocRoot;
    property Port: Integer read FPort;
  end;

{ TXRPServeApp }

constructor TXRPServeApp.Create(const ADocRoot: string; APort: Integer);
begin
  inherited Create;
  FDocRoot := ADocRoot;
  FPort := APort;
end;

{ Only the extensions this repo actually uses; extend as needed. Unknown
  extensions fall back to octet-stream, which browsers still handle fine. }
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
  else Result := 'application/octet-stream';
end;

{ Resolve the requested URL path to a file under DocRoot, refusing any path
  that tries to climb out of it with "..". "/" maps to "/index.html". }
function TXRPServeApp.ResolvePath(const URLPath: string): string;
var
  Relative: string;
  RootFull: string;
begin
  Relative := URLPath;
  if (Relative = '') or (Relative = '/') then
    Relative := '/index.html';

  // Strip any query string (Indy's Document already excludes it, but be safe).
  if Pos('?', Relative) > 0 then
    Relative := Copy(Relative, 1, Pos('?', Relative) - 1);

  // Decode %xx escapes (spaces, etc.) the same way a browser sends them.
  Relative := TNetEncoding.URL.Decode(Relative);

  // Switch to native path separators, then strip a leading separator.
  Relative := StringReplace(Relative, '/', PathDelim, [rfReplaceAll]);
  if (Relative <> '') and (Relative[1] = PathDelim) then
    Delete(Relative, 1, 1);

  RootFull := TPath.GetFullPath(FDocRoot);
  Result := TPath.GetFullPath(TPath.Combine(RootFull, Relative));

  // Refuse anything that escaped DocRoot via "..".
  if not Result.StartsWith(RootFull, True) then
    Result := '';
end;

{ The one request handler. Equivalent to serve.py's NoCacheHandler: serve the
  file if it exists, 404 otherwise, and always send the three no-cache
  headers regardless of outcome.

  No console to log 200/404 lines to any more (see the file header comment)
  - if per-request logging is ever needed again for debugging, write to a
  log file here rather than WriteLn, which would raise an I/O error with no
  console attached. }
procedure TXRPServeApp.HandleCommandGet(AContext: TIdContext;
  ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
var
  FilePath: string;
  Stream: TFileStream;
begin
  // No-store / no-cache on every response - this is the whole reason the
  // original server exists.
  AResponseInfo.CustomHeaders.Values['Cache-Control'] :=
    'no-store, no-cache, must-revalidate, max-age=0';
  AResponseInfo.CustomHeaders.Values['Pragma'] := 'no-cache';
  AResponseInfo.CustomHeaders.Values['Expires'] := '0';

  FilePath := ResolvePath(ARequestInfo.Document);

  if (FilePath = '') or (not TFile.Exists(FilePath)) then
  begin
    AResponseInfo.ResponseNo := 404;
    AResponseInfo.ContentText := '404 Not Found: ' + ARequestInfo.Document;
    Exit;
  end;

  AResponseInfo.ResponseNo := 200;
  AResponseInfo.ContentType := MimeTypeFor(FilePath);

  Stream := TFileStream.Create(FilePath, fmOpenRead or fmShareDenyWrite);
  AResponseInfo.ContentStream := Stream; // Indy frees this after sending.
  AResponseInfo.FreeContentStream := True;
end;

{ Runs on a background thread: give the server a moment to start listening
  (as serve.py's 1.5s Timer does), then open the default browser. }
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
  DocRoot: string;
  Port: Integer;
  StopEvent: THandle;
  PortArgIndex: Integer;
  CreateEventErr: Cardinal;
begin
  try
    // --- "XRPServe.exe stop [port]": signal an already-running instance to
    // exit, then exit ourselves immediately. Everything below this belongs
    // only to the normal start-serving path. ---
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

    if not TFile.Exists(TPath.Combine(DocRoot, 'index.html')) then
    begin
      ShowFatal('index.html was not found in this folder:' + sLineBreak +
        DocRoot);
      ExitCode := 1;
      Exit;
    end;

    Port := DEFAULT_PORT;
    // ParamStr(1) is the port here, not "stop" - that case already returned
    // above - so PortArgIndex is always 1 on this path.
    PortArgIndex := 1;
    if (ParamCount >= PortArgIndex) and
      (not TryStrToInt(ParamStr(PortArgIndex), Port)) then
    begin
      ShowFatal('Port must be a number.');
      ExitCode := 1;
      Exit;
    end;

    // Manual-reset, unsignaled: "XRPServe.exe stop" (or another attempt to
    // start on the same port) SetEvent()s this; we're the only one that
    // ever waits on it, so it never needs resetting.
    StopEvent := CreateEvent(nil, True, False,
      PChar(Format(STOP_EVENT_NAME, [Port])));
    CreateEventErr := GetLastError; // capture immediately, before anything else can change it
    if StopEvent = 0 then
    begin
      ShowFatal(Format(
        'Could not create the internal stop event for port %d (error %d).',
        [Port, CreateEventErr]));
      ExitCode := 1;
      Exit;
    end;
    if CreateEventErr = ERROR_ALREADY_EXISTS then
    begin
      ShowFatal(Format(
        'XRPServe is already running on port %d.', [Port]));
      CloseHandle(StopEvent);
      ExitCode := 1;
      Exit;
    end;

    App := TXRPServeApp.Create(DocRoot, Port);
    try
      Server := TIdHTTPServer.Create(nil);
      try
        // Thread pool scheduler, same spirit as serve.py's ThreadingTCPServer:
        // each request handled without blocking the others.
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
              'If the port is in use, try:  XRPServe.exe %d',
              [Port, E.Message, Port + 1]));
            ExitCode := 1;
            Exit;
          end;
        end;

        WriteLn('Serving folder:');
        WriteLn('   ' + DocRoot);
        WriteLn;
        WriteLn(Format('   Address: http://localhost:%d/', [Port]));
        WriteLn;
        WriteLn('Nothing is cached, so refresh always loads the latest edit.');
        WriteLn('Press ENTER to stop the server.');
        WriteLn;

        App.OpenBrowserAsync;
        ReadLn;
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
