import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const options = atom({ plugin: 'next-buttons', key: 'options' } as const, [])
const guess = atom({ plugin: 'next-buttons', key: 'guess' } as const, null)

const OPEN = '<next-buttons>'
const CLOSE = '</next-buttons>'
const MAX = 4

const INSTRUCTION = [
  '# Suggested next prompts',
  `End every reply that finishes your turn with one extra line, after everything else (after any TLDR line too), exactly in this form:`,
  `${OPEN}first option | second option | third option${CLOSE}`,
  'Put 2-3 (at most 4) prompts in it that the user is most likely to send next, each under about 60 characters, written in their own voice as they would type them ("yes, build it", "show me the diff", "commit and push"). Make them specific to this conversation. When you just asked the user a question or proposed something, the first option answers it ("yes, go ahead").',
  'The line is hidden from the transcript and drawn as clickable buttons above the prompt box, so never mention it or refer to it. Leave it out only when no next step makes sense.',
].join('\n')

/** The suggestions in the last complete tag of an answer; [] when none. */
export const parse = (answer: string): string[] => {
  const end = answer.lastIndexOf(CLOSE)
  const start = end < 0 ? -1 : answer.lastIndexOf(OPEN, end)

  if (start < 0) {
    return []
  }

  const seen = new Set<string>()

  return answer
    .slice(start + OPEN.length, end)
    .split('|')
    .map(one => one.trim())
    .filter(one => one.length > 0 && !seen.has(one) && seen.add(one))
    .slice(0, MAX)
}

/** The text with the tag cut off, a half-streamed one included. */
export const strip = (text: string): string => {
  const at = text.indexOf(OPEN)

  if (at >= 0) {
    return text.slice(0, at).trimEnd()
  }

  for (let n = OPEN.length - 1; n >= 2; n -= 1) {
    if (text.endsWith(OPEN.slice(0, n))) {
      return text.slice(0, -n).trimEnd()
    }
  }

  return text
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Terminal cells for one complete grapheme, including joined emoji. */
const cellWidth = (glyph: string): number => {
  if (/^[\p{Mark}\p{Cf}]+$/u.test(glyph)) return 0
  if (/\p{Emoji_Presentation}|\p{Regional_Indicator}|\uFE0F|\u20E3/u.test(glyph)) return 2
  const cp = glyph.codePointAt(0)!
  return cp >= 0x1100 && (
    cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xa960 && cp <= 0xa97c) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff01 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x16fe0 && cp <= 0x18dff) || (cp >= 0x1b000 && cp <= 0x1b2ff) ||
    (cp >= 0x1f200 && cp <= 0x1f251) || (cp >= 0x20000 && cp <= 0x3fffd)
  ) ? 2 : 1
}

const fit = (text: string, room: number): string => {
  const glyphs = Array.from(graphemes.segment(text), ({ segment }) => ({ text: segment, width: cellWidth(segment) }))
  if (glyphs.reduce((sum, glyph) => sum + glyph.width, 0) <= room) return text
  let result = ''
  let used = 0
  for (const glyph of glyphs) {
    if (used + glyph.width > room - 1) break
    result += glyph.text
    used += glyph.width
  }
  return `${result}…`
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const isHeadless = e.surfaces.length === 0 || e.traits.includes('print')

    if (isHeadless) {
      return composed
    }

    return {
      ...composed,
      sections: [
        ...composed.sections,
        { id: 'next-buttons:instruction', text: INSTRUCTION, scope: 'session' },
      ],
    }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, options, () => [])
    await update($, guess, () => null)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const found = e.reason === 'answer' ? parse(e.answer) : []
      await update($, options, () => found)
    }

    return next(e)
  })

  on('prompt.suggest', async ($, e, next) => {
    if (e.origin.kind === 'suggestion') {
      await update($, guess, () => e.text.trim() || null)
    }

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const text = strip(e.props.text)

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking) {
      return next(e)
    }

    const suggested = await read($, options)
    const engine = await read($, guess)
    const isNew = engine !== null && !suggested.includes(engine)
    const items = (isNew ? [...suggested, engine] : suggested).slice(0, MAX)

    if (items.length < 2) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    // Per button: `N: ` (3 cells), two borders and two padding cells; 2 cells between.
    const room = Math.max(1, Math.floor((e.props.bodyColumns - 2) / 2) - 7)
    const rows = [items.slice(0, 2), items.slice(2, 4)].filter(row => row.length > 0)
    const choose = async (text: string, truncated: boolean) => {
      if (truncated) {
        const filled = await $.prompt.fill({ text, mode: 'replace' })
        if (!filled.isFilled) return
      }
      await update($, options, () => [])
      await update($, guess, () => null)
      if (!truncated) await $.prompt.submit({ text, asUser: true })
    }
    // Keep what the plugins beneath draw (e.g. crew-board) above the buttons instead of hiding it.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {below}
        <Text dimColor>Next</Text>
        {rows.map((row, r) => (
          <Box key={`row-${r + 1}`} flexDirection="row" columnGap={2}>
            {row.map((text, c) => {
              const n = r * 2 + c + 1
              const label = fit(text, room)

              return (
                <Box
                  key={`pill-${n}`}
                  borderStyle="round"
                  borderColor="cyan"
                  borderDimColor
                  paddingX={1}
                  flexShrink={0}
                >
                  <Button
                    key={`next-${n}`}
                    hotkey={String(n)}
                    plain
                    dimColor
                    label={label}
                    onPress={() => choose(text, label !== text)}
                  >
                    <Text color="text" dimColor={false}>{label}</Text>
                  </Button>
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  })
}
