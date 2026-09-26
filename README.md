# Env Veil

Env Veil stops `.env` files from showing their values on screen.

Open a `.env` file and you get a protected preview: keys, comments and structure stay readable, every value is replaced with `********`. Nothing is written to the file, so switching editors, copying the text and closing the tab can no longer leak a secret by accident.

## Requirements

VS Code 1.105 or newer. Nothing else — no account, no network access, no configuration to start.

## Install

1. Open the Extensions view in VS Code.
2. Install Env Veil and reload the window.
3. Open any `.env`, `.env.local` or `.env.production.local` file.

The file opens in Env Veil automatically. There is nothing to enable and no default editor to pick.

## Reading values

- **Reveal Values** shows every value at once and starts a countdown in the toolbar.
- **Hide Values** masks them again immediately.
- Values hide themselves when the countdown ends, when you switch to another tab, and when VS Code loses focus. A timer or a lost focus is not something you have to trust: every one of those paths masks the values again.

The countdown length is set by `envVeil.revealTimeoutSeconds` and defaults to 15 seconds. The accepted range is 1 to 3600.

Editing is not part of Env Veil. To change a value, open the file in a real editor — see below.

## Opening a file in a real editor

`Open in Editor` in the toolbar hands the file over to the editor you configured, and Env Veil masks its values before anything leaves the screen.

The toolbar always shows which editor is next to the `Editor:` label, so you can tell what a click will do.

By default it opens in the normal VS Code text editor. To use another editor, set the mode and the command in your user settings.

Open user settings with `Ctrl+Shift+P` and run **Preferences: Open User Settings (JSON)**:

```json
{
  "envVeil.openIn.mode": "external",
  "envVeil.externalEditor.command": "C:\\Program Files\\Sublime Text\\subl.exe",
  "envVeil.externalEditor.args": ["--new-window", "{file}"]
}
```

| Setting                          | What it does                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| `envVeil.openIn.mode`            | `vscode` for the built-in editor, `external` for your own.          |
| `envVeil.externalEditor.command` | The executable to run, such as an absolute path or `subl`.          |
| `envVeil.externalEditor.args`    | Arguments passed before the file path.                              |

Two rules catch people out:

- Put the command and the arguments in **user** settings. Both are machine scoped, so a project cannot choose what gets executed, and a value in a project's `.vscode/settings.json` is ignored.
- Arguments are a list. A single string like `"--new-window {file}"` is not split into two arguments.

The process starts without a shell, so `&&`, `|` and `;` are not interpreted. In `args`, `{file}` and `{workspaceFolder}` are replaced as single arguments; if you leave `{file}` out, the file path is appended for you. In a remote workspace external editors are unavailable, so Env Veil explains that and falls back to the built-in editor.

If the file has unsaved changes, Env Veil asks before handing it over, so a change you never saved cannot disappear.

## Editor selection and protection

Env Veil masks a file only while Env Veil is the editor showing it.

If you pick a different editor for `.env` files — with **Reopen Editor With… → Set Default**, or through `workbench.editorAssociations` in your settings — that file opens unmasked from then on. Env Veil cannot mask a file it is not displaying, so it tells you once per window:

> Env Veil is not masking this file. It is open in another editor.

`Open in Env Veil` in that notification brings the protected preview back. Env Veil never changes your editor associations by itself, and it never nags about a file you deliberately opened somewhere else.

### Restoring Env Veil

For one file:

1. Right-click the tab and choose **Reopen Editor With…**.
2. Pick **Env Veil**.

For every `.env` file:

1. Open any `.env` file.
2. **Reopen Editor With… → Env Veil**.
3. Choose **Set Default**.

If you set the default by hand instead, delete the matching entry from `workbench.editorAssociations` in your settings.

Reinstalling the extension does not bring Env Veil back. Editor choices are stored in your own settings, so they survive an uninstall, and so does the gap in protection.

## After an external edit

Save a file in another editor and Env Veil picks the change up on its own: the new content is masked, and if values happened to be revealed at that moment they are hidden again. If the file has unsaved changes inside VS Code, those win over the copy on disk, so nothing you typed gets lost.

## Privacy

Env Veil makes no network requests and contains no telemetry. Nothing is logged, and values are not written to webview state, so they cannot be recovered from a profile or a crash report. The extension can only mask a file on screen — it is not a defence against someone who already has access to your files or to VS Code itself.

## Commands

| Command                              | What it does                                  |
| ------------------------------------ | --------------------------------------------- |
| `Env Veil: Reveal Values`            | Reveals the values in the active preview.     |
| `Env Veil: Hide Values`              | Masks them again.                             |
| `Env Veil: Open in Configured Editor`| Hands the file to the configured editor.      |

## License

MIT. The full text is in the `LICENSE` file at the root of the project.
