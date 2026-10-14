# prompt-shaper

A Claude Code mod that catches short, casual prompts and asks a fast model (Claude Haiku by default) to rewrite them into five parts:

- **Context**
- **Objective**
- **Steps**
- **Output**
- **Constraints**

You review the rewrite before anything is sent, and you can always fall back to what you typed. It works in the terminal, in the VS Code extension and in the Claude desktop app.

## Install

In a Claude Code terminal session, type:

```
/plugin install prompt-shaper --marketplace anhtuan23004/claude-mod
```

Answer `y` to add the marketplace, then choose a scope with Enter (**user** is listed first and applies to every session). The mod starts working in that session right away, with no restart.

## How it works

1. You type a short prompt (30 words or fewer by default) and press Enter.
2. The mod holds the prompt and sends it, along with the last few messages of the conversation, to the rewrite model. The conversation lets it work out what "it" or "that bug" means.
3. A dialog shows the rewrite and your original prompt:

| Key | Button | What it does |
| --- | --- | --- |
| `1` | Send shaped | Sends the rewritten prompt |
| `2` | Send original | Sends your prompt as you typed it |
| `3` | Edit shaped | Puts the rewrite in the input box so you can edit it |
| `4` | Revert to original | Puts your prompt back in the input box |
| `Esc` | | Same as Revert: nothing is lost |

The rewrite uses the language of your prompt for its content and keeps the section headings in English. It is told not to invent file names, numbers or requirements.

## When prompts are sent unchanged

- The prompt is longer than the word limit, spans several lines, or has images attached.
- The prompt is typed while Claude is still working.
- Nothing can show the dialog, as in a plain `claude -p` run.
- The prompt starts with `/`, `!` or `#`, or contains an `@file` mention.
- The prompt starts with `\`: it is sent as typed, without the backslash.
- The rewrite fails, or comes back without all five sections. A toast explains what happened, and your prompt is sent as typed.

## Settings

Open `/config`, or run `/plugin configure prompt-shaper@claude-mod`:

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Turns shaping on or off |
| `maxWords` | `30` | Prompts with more words than this are sent unchanged |
| `model` | `haiku` | Model alias or full id used for the rewrite |

In a session, `/prompt-shaper off` or `/prompt-shaper on` toggles shaping for that session only. `/prompt-shaper` alone shows the current state.

## Notes

- Each shaped prompt waits for one extra model call, usually 1–3 seconds.
- Where there is no input box to put text back into, Edit, Revert and `Esc` copy the text to the clipboard instead, and a toast says so.
- A prompt sent from the dialog is recorded in the transcript as sent by the plugin. The model reads it as your own words.
- The rewrite call uses your Claude Code session's own model access, so it costs tokens on the same account.

## Development

```
claude plugin validate .
claude plugin test .
```

To run a working copy without installing it:

```
claude --plugin-dir <path to this folder>
```

Layout:

```
.claude-plugin/plugin.json        manifest and userConfig options
.claude-plugin/marketplace.json   makes this repository a marketplace
hooks/hooks.json                  points at the hooks module
hooks/register.tsx                the mod
types/index.d.ts                  the mod's $.state contract
tests/shaper.test.ts              tests run by `claude plugin test`
```
