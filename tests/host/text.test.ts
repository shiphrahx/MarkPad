import { describe, expect, it } from 'vitest'
import {
  detectEncoding,
  detectLineEnding,
  toEditorText,
  toFileText,
} from '../../src/host/text.js'

describe('detectLineEnding', () => {
  it('reads a Unix file as lf', () => {
    expect(detectLineEnding('one\ntwo\n')).toBe('lf')
  })

  it('reads a Windows file as crlf', () => {
    expect(detectLineEnding('one\r\ntwo\r\n')).toBe('crlf')
  })

  it('treats a mixed file as crlf so the Windows lines survive', () => {
    expect(detectLineEnding('one\r\ntwo\nthree\n')).toBe('crlf')
  })

  it('reads a file with no line breaks at all as lf', () => {
    expect(detectLineEnding('one line, no ending')).toBe('lf')
  })
})

describe('detectEncoding', () => {
  it('spots a byte order mark', () => {
    expect(detectEncoding('\uFEFF# Title')).toBe('utf-8-bom')
  })

  it('reports plain utf-8 when there is none', () => {
    expect(detectEncoding('# Title')).toBe('utf-8')
  })
})

describe('toEditorText', () => {
  it('collapses crlf to lf', () => {
    expect(toEditorText('one\r\ntwo')).toBe('one\ntwo')
  })

  it('folds a lone cr into lf', () => {
    expect(toEditorText('one\rtwo')).toBe('one\ntwo')
  })

  it('drops the byte order mark', () => {
    expect(toEditorText('\uFEFF# Title')).toBe('# Title')
  })
})

describe('round trip', () => {
  const cases: ReadonlyArray<[string, string]> = [
    ['unix', 'one\ntwo\nthree\n'],
    ['windows', 'one\r\ntwo\r\nthree\r\n'],
    ['unix with bom', '\uFEFFone\ntwo\n'],
    ['windows with bom', '\uFEFFone\r\ntwo\r\n'],
    ['no trailing newline', 'one\r\ntwo'],
    ['empty file', ''],
  ]

  it.each(cases)('gives back the same bytes for a %s file', (_name, raw) => {
    const text = toEditorText(raw)
    const encoding = detectEncoding(raw)
    const lineEnding = detectLineEnding(raw)
    expect(toFileText(text, lineEnding, encoding)).toBe(raw)
  })
})
