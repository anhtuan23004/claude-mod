import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SHAPED = `## Context
Đang làm service document-intelligence.
## Objective
Sửa lỗi test bị fail.
## Steps
1. Chạy test
2. Tìm nguyên nhân
## Output
Bản sửa và giải thích ngắn.
## Constraints
Không đổi API công khai.`

const USAGE = {
  input_tokens: 10,
  output_tokens: 10,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

const PANE_PROPS = {
  title: 'Shaped prompt',
  isFocused: true,
  bodyColumns: 100,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

type World = {
  submitted: { text: string; origin: string }[]
  filled: string[]
  opened: string[]
  models: string[]
}

function world(on: On, reply: string | null): World {
  const w: World = { submitted: [], filled: [], opened: [], models: [] }
  on('model.complete', (_$, e) => {
    w.models.push(e.model)
    return {
      value:
        reply === null
          ? ({ isAnswered: false, reason: 'empty-reply', usage: USAGE } as const)
          : ({ isAnswered: true, text: reply, usage: USAGE } as const),
    }
  })
  on('session.messages', () => ({ value: [] }))
  on('prompt.submit', (_$, e) => {
    w.submitted.push({ text: e.text, origin: e.origin.kind })
    return { text: e.text }
  })
  on('prompt.fill', (_$, e) => {
    w.filled.push(e.text)
    return { isFilled: true }
  })
  on('ui.open', (_$, e) => {
    w.opened.push(e.id)
    return { value: { isPlaced: true } as const }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  return w
}

const typed = ($: Engine, text: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

test('a short prompt is held and shaped by haiku', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, SHAPED)

  const result = await typed($, 'fix cái test fail')
  expect(result.drop).toBeDefined()
  expect(w.submitted).toEqual([])
  expect(w.models).toEqual(['haiku'])

  await clock.advance(100)
  expect(w.opened).toEqual(['prompt-shaper'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`send shaped / send original on ${surface}`, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, SHAPED)
    const mountPane = () =>
      $.ui.mount({
        plugin: 'prompt-shaper',
        surface,
        component: 'Pane',
        requestId: 'prompt-shaper',
        props: PANE_PROPS,
      })

    await typed($, 'fix cái test fail')
    await clock.advance(100)
    const ui = await mountPane()
    expect(await ui.find({ type: 'Markdown', text: /## Objective/ })).toBeDefined()
    await ui.press({ key: 'send-shaped' })
    expect(w.submitted).toEqual([{ text: SHAPED, origin: 'plugin' }])
    await ui.unmount()

    await typed($, 'fix cái test fail')
    await clock.advance(100)
    const again = await mountPane()
    await again.press({ key: 'send-original' })
    expect(w.submitted.at(-1)).toEqual({ text: 'fix cái test fail', origin: 'plugin' })
    await again.unmount()
  })
}

test('revert puts the original back and the next Enter sends it as typed', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, SHAPED)

  await typed($, 'refactor this')
  await clock.advance(100)
  const ui = await $.ui.mount({
    plugin: 'prompt-shaper',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'prompt-shaper',
    props: PANE_PROPS,
  })
  await ui.press({ key: 'edit-original' })
  await ui.unmount()
  expect(w.filled).toEqual(['refactor this'])

  await typed($, 'refactor this')
  expect(w.submitted).toEqual([{ text: 'refactor this', origin: 'composer' }])
  expect(w.models).toEqual(['haiku'])
})

test('long, @mention and backslash prompts pass through', async ($, on) => {
  const w = world(on, SHAPED)
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')

  await typed($, long)
  await typed($, 'look at @src/app.ts')
  await typed($, '\\just send this')
  expect(w.submitted.map(s => s.text)).toEqual([long, 'look at @src/app.ts', 'just send this'])
  expect(w.models).toEqual([])
})

test('a failed rewrite sends the prompt as typed', async ($, on) => {
  const w = world(on, null)

  await typed($, 'fix it')
  expect(w.submitted).toEqual([{ text: 'fix it', origin: 'composer' }])
})

test('a reply missing sections sends the prompt as typed', async ($, on) => {
  const w = world(on, 'Sure! Here is a better prompt: fix the bug.')

  await typed($, 'fix it')
  expect(w.submitted).toEqual([{ text: 'fix it', origin: 'composer' }])
})

test('maxWords from settings is honoured', { options: { maxWords: 2 } }, async ($, on) => {
  const w = world(on, SHAPED)

  await typed($, 'please fix the failing test')
  expect(w.models).toEqual([])
  expect(w.submitted).toHaveLength(1)
})
