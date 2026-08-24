/**
 * The layout APIs jsdom does not implement.
 *
 * ProseMirror measures the document to decide where a cursor goes, so focusing
 * the editor calls `getClientRects` on a range. jsdom has no layout engine and
 * throws instead. None of this affects what the tests are checking, which is
 * what the document contains and what Markdown comes out of it.
 *
 * Stubs, not fakes: every rectangle is zero. A test that depended on a real
 * measurement would be lying to itself in this environment, so it is better
 * that such a test looks obviously wrong than plausibly right.
 */

const EMPTY_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
}

function emptyRectList(): DOMRectList {
  const list = {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  }
  return list as unknown as DOMRectList
}

if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= emptyRectList
  Range.prototype.getBoundingClientRect ??= () => EMPTY_RECT
}

if (typeof Element !== 'undefined') {
  Element.prototype.getClientRects ??= emptyRectList
  Element.prototype.scrollIntoView ??= () => {}
}
