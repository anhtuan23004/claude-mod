# claude-mod

Mods for [Claude Code](https://claude.com/claude-code). This repository is a Claude Code plugin marketplace, so each mod installs with one command.

## Mods

| Mod | What it does |
| --- | --- |
| [prompt-shaper](prompt-shaper/) | Catches short, casual prompts and has a fast model (Claude Haiku by default) rewrite them into Context, Objective, Steps, Output and Constraints. You then send the rewrite, edit it, or go back to what you typed. |

## Install

In a Claude Code terminal session, type:

```
/plugin install prompt-shaper --marketplace anhtuan23004/claude-mod
```

Answer `y` to add the marketplace, then choose a scope with Enter (**user** is listed first and applies to every session). The mod starts working right away, with no restart.

To update later:

```
claude plugin update prompt-shaper@claude-mod
```

Then run `/reload-plugins` in any open session.

## Layout

```
.claude-plugin/marketplace.json   lists every mod in this repository
prompt-shaper/                    one folder per mod, each with its own README
```

## Adding a mod

1. Put the mod in its own folder at the root, with `.claude-plugin/plugin.json` and `hooks/` inside it.
2. Add an entry for it to `.claude-plugin/marketplace.json`:
   ```json
   { "name": "<mod>", "source": "./<mod>", "description": "<one line>" }
   ```
3. Check it before you push:
   ```
   claude plugin validate .
   claude plugin validate ./<mod>
   claude plugin test ./<mod>
   ```
