# Encrypted pack test (XRPServePack)

[Documentation](../docs/README.md) · [Testing status](../docs/testing-status.md)

A test build of XRPServe that serves the IDE from one encrypted file,
`xrpblocks.pak`, so schools get no loose HTML/JS/CSS to edit. The current
`XRPServe.dpr` and `XRP Robotics.exe` are untouched.

## Files

- `tools/build_pack.py` - builds and checks the pack (dev machine only).
- `delphiSource/PackKey.inc` - the secret key. Compiled into the exe and read
  by build_pack.py. **Never give this file to schools.** Back it up: without
  it you cannot build a pack that an existing exe will open.
- `delphiSource/XRPServePack.dpr` - the test server (copy of XRPServe plus pack
  loading). `XRPServePack.res` is a copy of XRPServe.res for the icon.
- `packtest/xrpblocks.pak` - the built pack.

## Create a local key

The private key and packed executable are intentionally excluded from this repository. For a new local build, run `python tools/build_pack.py --genkey` once from the repository root, then compile the server and build its matching pack. Keep the key private. A newly generated key cannot open packs encrypted with a different key.

## Test steps

1. Open `delphiSource/XRPServePack.dpr` in Delphi, Release, Win32 or Win64,
   and build. `PackKey.inc` must be in the same folder as the .dpr.
2. Copy `XRPServePack.exe` into `packtest/` (next to `xrpblocks.pak` and
   nothing else) and double-click it. The console should say
   "Serving the encrypted pack (103 files)" under the licence banner, and the
   IDE should open. Type L and ENTER to see the full licence texts.
3. Connect the XRP, Run a program, open Library and Lesson.
4. Tamper test: copy the pack, change one byte (or just append a character
   in Notepad), and start again. Expect "The XRPBlocks pack is damaged or has
   been modified" and no server.
5. Delete `xrpblocks.pak` from `packtest/`: expect the "Neither xrpblocks.pak
   nor index.html was found" message.

## After changing the IDE

    python tools\build_pack.py            (rebuild packtest\xrpblocks.pak)
    python tools\build_pack.py --verify   (decrypt and compare with disk)

No Delphi rebuild is needed unless PackKey.inc changes.

## What goes in the pack

`index.html`, `LICENCES.txt` plus `css`, `js`, `devices`, `images`, `lessons`, `examples`,
excluding `.py`, `.pyc`, `.md`, `.pdf` and `.bak` files. `tools/oled-designer.html`
is not included. Edit INCLUDE_DIRS in build_pack.py to change this.

## Limits

This stops casual editing of the files on disk. While the IDE is running, the
browser still receives the normal JavaScript, so a technical user can still
read it with the browser's developer tools.
