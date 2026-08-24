import { describe, expect, it } from 'vitest'
import {
  countCharacters,
  countWords,
  formatEncoding,
  formatFileSize,
  formatLineEnding,
} from '../../src/app/stats.js'

describe('countWords', () => {
  it('counts plain prose', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('counts nothing in an empty document', () => {
    expect(countWords('')).toBe(0)
  })

  it('ignores the heading marker', () => {
    expect(countWords('## Heading')).toBe(1)
  })

  it('ignores list markers', () => {
    expect(countWords('- one\n- two\n')).toBe(2)
  })

  it('keeps a hyphenated word together', () => {
    expect(countWords('well-meaning')).toBe(1)
  })

  it('keeps an apostrophe inside a word', () => {
    expect(countWords("don't")).toBe(1)
    expect(countWords('don’t')).toBe(1)
  })

  it('splits on an em dash', () => {
    expect(countWords('one—two')).toBe(2)
  })

  it('counts numbers as words', () => {
    expect(countWords('MarkPad 0.1 ships')).toBe(4)
  })

  it('counts accented and non-latin words', () => {
    expect(countWords('café naïve 你好')).toBe(3)
  })

  it('is not fooled by runs of whitespace', () => {
    expect(countWords('  one \n\n   two  \t three ')).toBe(3)
  })
})

describe('countCharacters', () => {
  it('counts an emoji once', () => {
    expect(countCharacters('a\u{1f600}b')).toBe(3)
  })
})

describe('formatFileSize', () => {
  it('shows bytes below a kilobyte', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('switches to kilobytes at 1024', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(formatFileSize(150 * 1024)).toBe('150 KB')
  })

  it('goes up to megabytes and gigabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3 GB')
  })
})

describe('labels', () => {
  it('names line endings the way the rest of the world does', () => {
    expect(formatLineEnding('lf')).toBe('LF')
    expect(formatLineEnding('crlf')).toBe('CRLF')
  })

  it('says when a byte order mark is present', () => {
    expect(formatEncoding('utf-8')).toBe('UTF-8')
    expect(formatEncoding('utf-8-bom')).toBe('UTF-8 with BOM')
  })
})
