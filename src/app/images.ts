/**
 * Working out where an image in a Markdown file actually lives.
 *
 * `![](diagram.png)` means the file next to this one, which the app can only
 * work out if it knows where this one is. Paths here are whatever the operating
 * system handed us, so both separators turn up and both have to work.
 *
 * No Tauri in this file. Turning a resolved path into something the webview can
 * load is the host's job; deciding what the path is, is this one's.
 */

/** The folder a file lives in, or null for a buffer never saved anywhere. */
export function directoryOf(path: string | null): string | null {
  if (path === null) return null

  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (cut < 0) return null

  // Keep the slash on a root, or C:/ becomes C: and /notes.md becomes nothing.
  return cut === 0 || path[cut - 1] === ':' ? path.slice(0, cut + 1) : path.slice(0, cut)
}

/**
 * Whether this is a picture on the web rather than one on disk.
 *
 * MarkPad makes one network request, and it is the update check. A remote
 * image is a second one, and it also tells whoever is hosting it that you
 * opened the file, which is not a thing this app does. So they are recognised
 * and then left alone rather than fetched.
 */
export function isRemote(src: string): boolean {
  const trimmed = src.trim()

  // Before anything else: a Windows drive letter is indistinguishable from a
  // one-character scheme, and reading C:/pictures/a.png as a URL would mean no
  // image on Windows ever loads.
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) return false

  // file: is a URL for something on this machine, so it is ours to resolve.
  if (/^file:/i.test(trimmed)) return false

  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}

/**
 * A `src` from a Markdown file, resolved against the folder its document is in.
 *
 * Null when there is nothing to resolve against, when the src is remote, or
 * when it is a data URI, which already carries the picture with it.
 */
export function resolveImage(src: string, directory: string | null): string | null {
  const wanted = decodeSource(src)
  if (wanted === null || isRemote(wanted)) return null
  if (isAbsolute(wanted)) return wanted
  if (directory === null) return null

  const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/'
  const base = directory.endsWith('/') || directory.endsWith('\\')
    ? directory.slice(0, -1)
    : directory

  return `${base}${separator}${strip(wanted)}`
}

/**
 * Markdown holds a URL, so a space is `%20`. The filesystem holds a name, so a
 * space is a space. A file called `my notes.png` needs the second one.
 */
function decodeSource(src: string): string | null {
  const trimmed = src.trim()
  if (trimmed === '') return null

  try {
    return decodeURI(trimmed)
  } catch {
    // A stray percent sign that is not an escape. Take it literally, which is
    // more likely to be a real file name than an error is to be useful.
    return trimmed
  }
}

function isAbsolute(path: string): boolean {
  // A leading slash on Unix, a drive letter or a UNC share on Windows.
  return /^([/\\]|[a-zA-Z]:[/\\])/.test(path)
}

/** Drop a leading `./`, which means the same folder and confuses a join. */
function strip(path: string): string {
  return path.replace(/^\.[/\\]/, '')
}

/**
 * Point every image in a rendered fragment at something the window can load.
 *
 * The original `src` is kept on the element, so a picture that did not appear
 * still says what it was looking for.
 */
export function resolveImagesIn(
  root: ParentNode,
  toUrl: (src: string) => string | null,
): void {
  for (const image of root.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? ''
    const resolved = toUrl(src)

    image.setAttribute('data-src', src)

    if (resolved === null) {
      image.removeAttribute('src')
      image.setAttribute('data-unresolved', 'true')
    } else {
      image.setAttribute('src', resolved)
      image.removeAttribute('data-unresolved')
    }
  }
}
