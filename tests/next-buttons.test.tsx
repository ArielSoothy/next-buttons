import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { parse, strip } from '../hooks/register'

const ANSWER = [
  'Built it. Tests pass.',
  'TLDR: done → nothing needed',
  '<next-buttons>commit and push | show me the diff | show me the diff | run it live</next-buttons>',
].join('\n')

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

/** Stands in for the engine's own drawing, which a test lacks. */
const engineDraws = (on: On) =>
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

test('parse keeps the last tag, trims, drops repeats, caps at four', () => {
  expect(parse(ANSWER)).toEqual(['commit and push', 'show me the diff', 'run it live'])
  expect(parse('no tag here')).toEqual([])
  expect(parse('<next-buttons>a | b | c | d | e</next-buttons>')).toEqual(['a', 'b', 'c', 'd'])
  expect(parse('<next-buttons>half streamed')).toEqual([])
})

test('strip hides the tag, a half-streamed one too', () => {
  expect(strip(ANSWER)).toBe('Built it. Tests pass.\nTLDR: done → nothing needed')
  expect(strip('Done.\n<next-buttons>commit and')).toBe('Done.')
  expect(strip('Done.\n<next-bu')).toBe('Done.')
  expect(strip('plain text')).toBe('plain text')
})

test('the answer becomes buttons; a press sends it and clears the band', async ($, on) => {
  const sent: string[] = []
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)

    return { text: e.text }
  })

  await $.turn.complete({
    answer: ANSWER,
    reason: 'answer',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'next-buttons', surface, ...BAND })
    expect(await ui.find({ key: 'next-1' })).toBeDefined()
    expect(await ui.find({ key: 'next-3' })).toBeDefined()
    expect(await ui.find({ key: 'next-4' })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
  await ui.press({ key: 'next-2' })
  expect(sent).toEqual(['show me the diff'])
  expect(await ui.find({ key: 'next-1' })).toBeUndefined()
  await ui.unmount()
})

test('no band while a turn runs or after an answer without suggestions', async ($, on) => {
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({ answer: ANSWER, reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1' })
  const working = await $.ui.mount({
    plugin: 'next-buttons',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, isWorking: true },
  })
  expect(await working.find({ key: 'next-1' })).toBeUndefined()
  await working.unmount()

  await $.turn.complete({ answer: 'Just text.', reason: 'answer', durationMs: 1, isAborted: false, turnId: 't2' })
  const idle = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
  expect(await idle.find({ key: 'next-1' })).toBeUndefined()
  await idle.unmount()
})

test('a lone button is not worth a band', async ($, on) => {
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({
    answer: 'Done.\n<next-buttons>only one</next-buttons>',
    reason: 'answer',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
  })
  const ui = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'next-1' })).toBeUndefined()
  await ui.unmount()
})

test('two, three and four options keep two buttons per row', async ($, on) => {
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  for (const items of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
    await $.turn.complete({
      answer: `Done.\n<next-buttons>${items.join(' | ')}</next-buttons>`,
      reason: 'answer',
      durationMs: 1,
      isAborted: false,
      turnId: `t${items.length}`,
    })
    const ui = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'row-1' }))?.children).toHaveLength(2)
    const second = await ui.find({ key: 'row-2' })
    if (items.length === 2) {
      expect(second).toBeUndefined()
    } else {
      expect(second?.children).toHaveLength(items.length - 2)
    }
    expect(await ui.find({ key: 'row-3' })).toBeUndefined()
    for (let n = 1; n <= items.length; n += 1) {
      expect((await ui.find({ key: `next-${n}` }))?.props.hotkey).toBe(String(n))
    }
    await ui.unmount()
  }
})

test('four outlined options fit 80 columns; a truncated label fills the draft without sending', async ($, on) => {
  const sent: string[] = []
  const filled: { text: string; mode: string }[] = []
  const items = ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60), 'd'.repeat(60)]
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })

  on('prompt.fill', (_, e) => {
    filled.push({ text: e.text, mode: e.mode })
    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.turn.complete({
      answer: `Done.\n<next-buttons>${items.join(' | ')}</next-buttons>`,
      reason: 'answer', durationMs: 1, isAborted: false, turnId: surface,
    })
    const ui = await $.ui.mount({ plugin: 'next-buttons', surface, ...BAND })
    const rows = await ui.findAll({ type: 'Box', key: 'row-1' })
    rows.push(...await ui.findAll({ type: 'Box', key: 'row-2' }))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      let columns = Number(row.props.columnGap)
      expect(row.children).toHaveLength(2)
      for (const pill of row.children as RenderElement[]) {
        expect(pill.type).toBe('Box')
        if (pill.type !== 'Box') throw new Error('Expected an outlined button')
        expect(pill.props).toMatchObject({ borderStyle: 'round', paddingX: 1 })
        const button = pill.children?.[0]
        if (typeof button !== 'object' || button.type !== 'Button') throw new Error('Expected a pressable label')
        expect(button.props.label).toHaveLength(32)
        expect(button.props.label.endsWith('…')).toBe(true)
        // Two border cells, horizontal padding, and the engine's `N: ` prefix.
        columns += 2 + 2 * Number(pill.props?.paddingX) + 3 + button.props.label.length
      }
      expect(columns).toBe(80)
    }
    await ui.press({ key: 'next-3' })
    expect(filled[filled.length - 1]).toEqual({ text: items[2], mode: 'replace' })
    expect(sent).toEqual([])
    expect(await ui.find({ key: 'next-1' })).toBeUndefined()
    await ui.unmount()
  }
  expect(filled).toHaveLength(2)
})

test('80-column labels budget wide glyphs without splitting combining marks or joined emoji', async ($, on) => {
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const items = ['界'.repeat(32), '👩🏽‍💻'.repeat(20), 'e\u0301'.repeat(33), '👍'.repeat(16)]

  await $.turn.complete({
    answer: `Done.\n<next-buttons>${items.join(' | ')}</next-buttons>`,
    reason: 'answer',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
  })
  const ui = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
  // Literal expectations: 15 two-cell glyphs + ellipsis, 31 accented letters +
  // ellipsis, and 16 two-cell glyphs that fit exactly without an ellipsis.
  const labels = ['界'.repeat(15) + '…', '👩🏽‍💻'.repeat(15) + '…', 'e\u0301'.repeat(31) + '…', '👍'.repeat(16)]
  for (let n = 1; n <= 4; n += 1) {
    expect((await ui.find({ key: `next-${n}` }))?.props.label).toBe(labels[n - 1])
  }
  await ui.unmount()
})

test('number badges are muted while normal labels preserve engine focus styling', async ($, on) => {
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({
    answer: 'Done.\n<next-buttons>a | b | c | d</next-buttons>',
    reason: 'answer',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
  })
  const ui = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons).toHaveLength(4)
  for (const button of buttons) {
    expect(button.props).toMatchObject({ plain: true, dimColor: true })
    expect(button.children).toHaveLength(1)
    expect(button.children[0]).toMatchObject({ type: 'Text', props: { color: 'text', dimColor: false } })
  }
  for (const node of await ui.findAll({})) {
    expect(node.props?.backgroundColor).toBeUndefined()
    expect(node.props?.inverse).toBeUndefined()
    expect(node.props?.bold).toBeUndefined()
  }
  const outline = await ui.find({ key: 'pill-1' })
  expect(outline?.props).toMatchObject({ borderColor: 'cyan', borderDimColor: true })
  expect((await ui.find({ type: 'Text', text: /^Next$/ }))?.props.dimColor).toBe(true)
  await ui.unmount()
})


test('untruncated labels send immediately as the user, including exact fits and literal ellipses', async ($, on) => {
  const sent: { text: string; asUser: boolean | undefined }[] = []
  const filled: string[] = []
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    sent.push({ text: e.text, asUser: e.origin.kind == 'plugin' ? e.origin.asUser : undefined })
    return { text: e.text }
  })
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const text of ['show the diff', 'a'.repeat(32), 'continue…', '👍'.repeat(16)]) {
      await $.turn.complete({
        answer: `Done.\n<next-buttons>${text} | another option</next-buttons>`,
        reason: 'answer', durationMs: 1, isAborted: false, turnId: `${surface}-${text}`,
      })
      const ui = await $.ui.mount({ plugin: 'next-buttons', surface, ...BAND })
      expect((await ui.find({ key: 'next-1' }))?.props.label).toBe(text)
      expect((await ui.find({ key: 'next-1' }))?.props.hotkey).toBe('1')
      await ui.press({ key: 'next-1' })
      expect(sent[sent.length - 1]).toEqual({ text, asUser: true })
      expect(filled).toEqual([])
      expect(await ui.find({ key: 'next-1' })).toBeUndefined()
      await ui.unmount()
    }
  }
  expect(sent).toHaveLength(8)
})

test('a refused draft fill never sends a truncated suggestion and keeps it available', async ($, on) => {
  const sent: string[] = []
  const filled: string[] = []
  const text = 'a'.repeat(33)
  engineDraws(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: false }
  })
  await $.turn.complete({
    answer: `Done.\n<next-buttons>${text} | another option</next-buttons>`,
    reason: 'answer', durationMs: 1, isAborted: false, turnId: 'refused',
  })
  const ui = await $.ui.mount({ plugin: 'next-buttons', surface: 'terminal', ...BAND })
  await ui.press({ key: 'next-1' })
  expect(filled).toEqual([text])
  expect(sent).toEqual([])
  expect(await ui.find({ key: 'next-1' })).toBeDefined()
  await ui.unmount()
})
