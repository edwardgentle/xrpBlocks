# Keyboard shortcuts

XRPBlocks has keyboard shortcuts for the actions learners and teachers use most.
Open the full list at any time with the keyboard button on the toolbar, with
**Ctrl + /**, or by pressing **?** while the workspace has focus.

On a Mac, use **Cmd** wherever this page says **Ctrl**, and **Option** for
**Alt**. The one exception is the panel toggle, which is **Ctrl + `** on every
computer, because Cmd + ` switches windows in macOS.

## Program and robot

| Shortcut | Action |
|---|---|
| Ctrl + Enter | Run the program on the robot |
| Ctrl + . (full stop) | Stop the running program |
| Ctrl + Shift + Enter | Deploy (save as `main.py` on the robot) |
| Ctrl + S | Save the project to a file |

Stop works everywhere, even while typing in a field or with a dialog open,
because it is the safety key. Deploy still asks for confirmation before it
overwrites `main.py`. Run and Deploy show "Connect the robot first." when no
robot is connected.

If a block value is still being edited when you press Run, Deploy or Save, the
new value is saved first, so the program uses what you typed.

## Workspace and panels

| Shortcut | Action |
|---|---|
| Home | Show all blocks (fit to screen) |
| Ctrl + ` | Show or hide the Python/Console panel |
| Shift + F10 | Open the context menu of the selected block |
| Esc | Close menus, flyouts and the shortcut list |
| Ctrl + / or ? | Show the shortcut list |

The panel opens on the Console tab while a program is running, and on the
Python tab otherwise.

## Blocks

| Shortcut | Action |
|---|---|
| Ctrl + click | Collapse or expand a block |
| Alt + click | Disable or enable a block |
| D | Duplicate the selected block |
| W | Watch or stop watching the selected variable or list |
| Ctrl + [ | Collapse all blocks |
| Ctrl + ] | Expand all blocks |
| Ctrl + C / X / V | Copy, cut, paste |
| Delete | Delete the selected block |
| Ctrl + Z | Undo |
| Ctrl + Y or Ctrl + Shift + Z | Redo |

Ctrl + click and Alt + click only act on a click, not a drag, so holding Ctrl
while moving a block does nothing unusual. Both follow the same rules as the
right-click menu: blocks that are not attached to "when program starts" are
already greyed out by XRPBlocks, so Alt + click cannot disable them and shows
"That is not possible for this block."

Single-key shortcuts (D, W, Home, ?) only work while you are not typing in a
field, so typing a "d" into a text block never duplicates anything.

## Notes for teachers

- Copy, cut, paste, Delete, Undo, Redo and Esc are built into Blockly. The
  others are added by `js/ui/keyboard-shortcuts.js`.
- Blockly 12 normally opens the context menu with Ctrl + Enter. XRPBlocks uses
  Ctrl + Enter for Run instead and moves the context menu to Shift + F10, the
  standard Windows key for it.
- Ctrl + Alt combinations are avoided on purpose. On many European keyboard
  layouts Ctrl + Alt is AltGr, which types characters.
- A browser extension or school management software can take over a shortcut
  before XRPBlocks sees it. If one does nothing, use the toolbar button instead.
