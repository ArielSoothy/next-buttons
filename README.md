# next-buttons

Turn Claude's suggested next prompts into buttons above the prompt box. After an answer, click a suggestion or type its number. Fully visible suggestions send immediately as your message. If a label is shortened with `…`, the full suggestion goes into the prompt box for you to read, edit, and press Enter to send.

```text
Next
╭─────────────────────────────────────╮  ╭─────────────────────────────────────╮
│ 1: show me the complete diff for t… │  │ 2: commit and push the changes aft… │
╰─────────────────────────────────────╯  ╰─────────────────────────────────────╯
╭─────────────────────────────────────╮  ╭─────────────────────────────────────╮
│ 3: run the full test suite and exp… │  │ 4: explain how the updated buttons… │
╰─────────────────────────────────────╯  ╰─────────────────────────────────────╯
```

## Use cases

- **Review a code change.** After Claude edits a file, choose “show me the diff”.
  Read the changes before choosing the next action.

- **Check a fix.** After Claude describes a fix, choose “run the tests”.
  Continue from the answer without retyping the follow-up.

- **Explore an explanation.** After a walkthrough, choose “show an example”.
  Follow a suggested next step or write your own prompt.

## Install

In Claude Code, run:

```text
/plugin install next-buttons --marketplace ArielSoothy/next-buttons
```

For manual use, download the plugin folder, replace the example path below with its absolute location, and launch a new Claude Code session:

```sh
CLAUDE_CODE_PLUGIN_DIRS=/absolute/path/to/next-buttons claude
```

## Requirements and use

Use Claude Code with mods support on an interactive terminal or Desktop surface. The plugin is checked against Claude Code 2.1.311; use that version or a compatible newer version. An exact minimum version has not been established. No extra provider CLI or private configuration file is required.

Start a conversation normally. The plugin asks Claude to include a short suggestions tag and hides that tag in the displayed answer. Two to four valid suggestions produce a button band; fewer produce none. Headless/print prompts receive no suggestion instruction. A successful selection clears the band. If the prompt box refuses a truncated suggestion, the band remains and nothing is sent.

Suggestions come from the model and may be imperfect. Read a suggestion before selecting it, especially when it requests an action. Fully visible suggestions send immediately; shortened suggestions replace any existing prompt draft and wait for Enter.

## What the hook does

The plugin has one hook module, `hooks/register.tsx`. It does three things:

- Adds one short instruction to the session's system prompt (interactive sessions only) asking Claude to end each answer with a hidden `<next-buttons>…</next-buttons>` tag holding 2–4 suggested next prompts.
- Hides that tag in the displayed answer.
- Keeps the current suggestion list in the session's plugin state and draws it as buttons above the prompt box. The list is cleared whenever you send a prompt.

What it changes: the system prompt (one extra section), the displayed answer text (the tag is removed), and the area above the prompt box (the buttons). Nothing else: no files, no settings, no network.

What the buttons send: clicking a fully visible button, or typing its number, submits one prompt as your message. That prompt is exactly the clicked suggestion's text, word for word: either a suggestion Claude wrote in its answer or Claude Code's own built-in prompt suggestion when one is shown. The plugin adds nothing to it. A shortened suggestion is only placed in the prompt box; you read it and send it yourself.

## Privacy

Reads only Claude's answer text to find the suggestion tag (and Claude Code's built-in prompt suggestion when one is shown); keeps the current suggestions in session plugin state only while the buttons are shown; writes nothing to disk; sends nothing anywhere.

Selected prompts use the normal Claude Code conversation and your configured model provider. Normal provider data handling applies.

## Developing

Type checking needs TypeScript 5.4 or newer and the engine-generated declarations in `.claude-plugin/types/`. Those declarations are local development files, excluded by the root `.gitignore`; runtime, plugin tests, and validation work without them.

Replace the example path with the plugin folder's absolute location and regenerate the declarations with this verified command:

```sh
CLAUDE_CODE_PLUGIN_DIR_WATCH=1 CLAUDE_CODE_PLUGIN_DIRS=/absolute/path/to/next-buttons claude --print /help --no-session-persistence
```

On Claude Code 2.1.311, this loads the plugin and writes `.claude-plugin/types/` before exiting without a model request. It prints `/help isn't available in this environment.`; that message is expected. `claude plugin init nbtmp --with hooks` scaffolds command hooks under `~/.claude/skills/nbtmp/`; it does not regenerate these declarations.

With Bun and TypeScript already available, run:

```sh
claude plugin test .
bunx --no-install tsc --noEmit -p .
claude plugin validate --profile directory --strict .
```

## Support

Support: [GitHub issues](https://github.com/ArielSoothy/next-buttons/issues).

## License

MIT — Copyright (c) 2026 Ariel Soothy. See [LICENSE](LICENSE).
