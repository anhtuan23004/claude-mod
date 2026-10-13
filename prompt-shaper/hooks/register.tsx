import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Shaping } from '../types'

const PANE = 'prompt-shaper'
const SECTIONS = ['Context', 'Objective', 'Steps', 'Output', 'Constraints']

const pending = atom({ plugin: 'prompt-shaper', key: 'pending' } as const, null)
const skipNext = atom({ plugin: 'prompt-shaper', key: 'skipNext' } as const, false)
const isOff = atom({ plugin: 'prompt-shaper', key: 'isOff' } as const, false)

const SYSTEM = `You rewrite a developer's short, casual request to a coding agent into a structured prompt.

Answer with exactly these five Markdown sections, in this order, and nothing else:
## Context
## Objective
## Steps
## Output
## Constraints

Rules:
- Write the section bodies in the same language as the request; keep the headings in English.
- Stay faithful: never invent file names, numbers, technologies or requirements the request and the recent conversation do not support. Where something is unknown, state a sensible assumption briefly or ask the agent to find out.
- Use the recent conversation only to resolve what words like "it", "that" or "the bug" refer to.
- Steps is a short numbered list. Every other section is one to three lines.
- Keep it under 180 words. No preamble, no closing remarks, no code fences around the answer.`

export const register: Register = (on, options) => {
  const isEnabled = options.enabled !== false
  const maxWords = typeof options.maxWords === 'number' ? options.maxWords : 30
  const model = typeof options.model === 'string' && options.model ? options.model : 'haiku'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-shaper',
      description: 'Turn prompt shaping on or off for this session',
      argumentHint: 'on | off',
    })

    return next(e)
  })

  on('command.run', { command: 'prompt-shaper' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await update($, isOff, () => arg === 'off')
    const off = await read($, isOff)

    return {
      text: !isEnabled
        ? 'prompt-shaper is disabled in its settings (/config).'
        : `prompt-shaper is ${off ? 'off' : 'on'} for this session (prompts up to ${maxWords} words, model ${model}).`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isEnabled || (await read($, isOff))) return next(e)
    if (e.origin.kind !== 'composer' || e.turnId !== undefined || e.attachments?.length) {
      return next(e)
    }

    if (await read($, skipNext)) {
      await update($, skipNext, () => false)
      return next(e)
    }

    const text = e.text.trim()

    // A leading backslash sends the rest exactly as typed.
    if (text.startsWith('\\')) return next({ ...e, text: text.slice(1).trimStart() })

    const words = text.split(/\s+/).filter(Boolean).length
    const isShort = words > 0 && words <= maxWords
    // @file mentions are expanded only for the person's own submit, so leave those alone.
    const hasMention = /(^|\s)@\S/.test(text)
    if (!isShort || hasMention || /^[/!#]/.test(text) || text.includes('\n')) return next(e)

    await update($, pending, () => null)
    $.ui.status('prompt-shaper: shaping with ' + model + '…')
    const recent = await recentConversation($)
    const answer = await $.model.complete(
      {
        model,
        system: SYSTEM,
        prompt:
          (recent ? `Recent conversation (for reference only):\n${recent}\n\n` : '') +
          `Request to rewrite:\n${text}`,
        maxTokens: 700,
        effort: 'low',
        timeoutMs: 20_000,
      },
      { signal: next.signal },
    )
    $.ui.status(undefined)

    const shaped = answer.isAnswered ? answer.text.trim() : ''
    if (!SECTIONS.every(name => new RegExp(`^#+\\s*${name}\\b`, 'mi').test(shaped))) {
      $.ui.toast(
        answer.isAnswered
          ? 'prompt-shaper: the rewrite was malformed, sent your prompt as typed'
          : `prompt-shaper: ${answer.reason}, sent your prompt as typed`,
      )
      return next(e)
    }

    const shaping: Shaping = { original: text, shaped }
    await update($, pending, () => shaping)

    // Open once the composer has cleared, so the dialog can take the keys.
    $.clock.after(50, () => {
      void (async () => {
        const opened = await $.ui.open({
          id: PANE,
          title: 'Shaped prompt',
          focus: true,
          closeOnEscape: true,
          holdToasts: true,
          rows: Math.min(30, shaped.split('\n').length + 4),
        })
        if (!opened.isPlaced) {
          // No room for the dialog: hand the shaped text to the composer instead.
          await edit($, shaped)
          $.ui.toast('prompt-shaper: shaped prompt placed in the input; Enter sends it')
        }
      })()
    })

    return { drop: 'prompt-shaper: review the shaped prompt (Esc puts yours back)' }
  }).catch(($, e, next) => next(e))

  // Esc or the close mark: nothing is lost, the original goes back into the composer.
  on('ui.close', async ($, e, next) => {
    if (e.id !== PANE || e.origin.kind !== 'person') return next(e)
    const shaping = await read($, pending)
    if (shaping) {
      await update($, pending, () => null)
      await update($, skipNext, () => true)
      await $.prompt.fill({ text: shaping.original })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const shaping = await read($, pending)
    if (!shaping) return next(e)

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Markdown text={shaping.shaped} />
        <Text dimColor>Original: {shaping.original}</Text>
        <Box flexDirection="row" gap={1}>
          <Button
            key="send-shaped"
            label="Send shaped"
            hotkey="1"
            variant="primary"
            autoFocus
            onPress={() => send($, shaping.shaped)}
          />
          <Button
            key="send-original"
            label="Send original"
            hotkey="2"
            onPress={() => send($, shaping.original)}
          />
          <Button
            key="edit-shaped"
            label="Edit shaped"
            hotkey="3"
            onPress={() => edit($, shaping.shaped)}
          />
          <Button
            key="edit-original"
            label="Revert to original"
            hotkey="4"
            role="dismiss"
            onPress={() => edit($, shaping.original)}
          />
        </Box>
      </Box>
    )
  })
}

async function finish($: EngineInterface) {
  await update($, pending, () => null)
  await $.ui.close({ id: PANE })
}

async function send($: EngineInterface, text: string) {
  await finish($)
  await $.prompt.submit({ text, asUser: true })
}

async function edit($: EngineInterface, text: string) {
  await update($, skipNext, () => true)
  await finish($)
  await $.prompt.fill({ text })
}

async function recentConversation($: EngineInterface): Promise<string> {
  try {
    const rows = await $.session.messages()
    return rows
      .filter(row => row.text.trim())
      .slice(-4)
      .map(row => `${row.role}: ${row.text.trim().slice(0, 600)}`)
      .join('\n')
  } catch {
    return ''
  }
}
