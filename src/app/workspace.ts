import type { Encoding, Host, LineEnding } from '../host/types.js'
import {
  bufferFromDocument,
  fileName,
  isDirty,
  newBuffer,
  type Buffer,
  type Contents,
} from './buffer.js'

export type WorkspaceListener = (workspace: Workspace) => void

/**
 * Every open tab, and the operations that change them.
 *
 * Knows about the host interface but not about Tauri, and nothing about the
 * DOM, so the whole of the app's behaviour is testable in Node against
 * `MemoryHost`. The UI subscribes and redraws.
 */
export class Workspace {
  private buffers: Buffer[] = []
  private activeId: string | null = null
  private readonly listeners = new Set<WorkspaceListener>()

  constructor(private readonly host: Host) {}

  subscribe(listener: WorkspaceListener): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  get tabs(): readonly Buffer[] {
    return this.buffers
  }

  get active(): Buffer | null {
    return this.buffers.find((buffer) => buffer.id === this.activeId) ?? null
  }

  get hasUnsavedChanges(): boolean {
    return this.buffers.some(isDirty)
  }

  /** Open a buffer and focus it. Blank, unless it is given something to hold. */
  create(contents?: Contents): Buffer {
    const buffer = newBuffer(this.host.platform, contents)
    this.buffers = [...this.buffers, buffer]
    this.activeId = buffer.id
    this.emit()
    return buffer
  }

  /**
   * Open files by path.
   *
   * A file that is already open is focused rather than opened twice, which is
   * what you want when the same path arrives from a drop, the dialog and the
   * recent list in quick succession.
   */
  async open(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      const existing = this.buffers.find((buffer) => buffer.path === path)
      if (existing) {
        this.activeId = existing.id
        continue
      }

      const document = await this.host.readFile(path)
      const buffer = bufferFromDocument(document)
      this.buffers = [...this.buffers, buffer]
      this.activeId = buffer.id
    }
    this.emit()
  }

  /** Show the open dialog, then open whatever came back. */
  async openWithDialog(): Promise<void> {
    const paths = await this.host.pickFilesToOpen()
    if (paths.length > 0) await this.open(paths)
  }

  focus(id: string): void {
    if (!this.buffers.some((buffer) => buffer.id === id)) return
    this.activeId = id
    this.emit()
  }

  focusRelative(offset: number): void {
    if (this.buffers.length === 0) return
    const index = this.buffers.findIndex((buffer) => buffer.id === this.activeId)
    const next = (index + offset + this.buffers.length) % this.buffers.length
    this.activeId = this.buffers[next]?.id ?? null
    this.emit()
  }

  /** Record an edit. Called on every keystroke, so it does no work beyond this. */
  setText(id: string, text: string): void {
    this.update(id, (buffer) => ({ ...buffer, text }))
  }

  setLineEnding(id: string, lineEnding: LineEnding): void {
    this.update(id, (buffer) => ({ ...buffer, lineEnding }))
  }

  setEncoding(id: string, encoding: Encoding): void {
    this.update(id, (buffer) => ({ ...buffer, encoding }))
  }

  /**
   * Save a buffer, asking for a path first if it has never had one.
   *
   * Returns false when the user cancelled the dialog, so a caller closing the
   * tab afterwards knows not to.
   */
  async save(id: string): Promise<boolean> {
    const buffer = this.buffers.find((candidate) => candidate.id === id)
    if (!buffer) return false

    const path = buffer.path ?? (await this.host.pickPathToSave(suggestedName(buffer)))
    if (path === null) return false

    const { byteLength } = await this.host.writeFile({
      path,
      text: buffer.text,
      lineEnding: buffer.lineEnding,
      encoding: buffer.encoding,
    })

    this.update(id, (current) => ({
      ...current,
      path,
      savedText: current.text,
      byteLength,
    }))
    return true
  }

  /** Save under a new name, leaving the original file as it was. */
  async saveAs(id: string): Promise<boolean> {
    const buffer = this.buffers.find((candidate) => candidate.id === id)
    if (!buffer) return false

    const path = await this.host.pickPathToSave(suggestedName(buffer))
    if (path === null) return false

    this.update(id, (current) => ({ ...current, path }))
    return this.save(id)
  }

  /**
   * Close a tab.
   *
   * A dirty buffer is refused unless `force` is set. Deciding what to ask the
   * user is the UI's job; losing their work quietly is not an option either
   * way.
   */
  close(id: string, force = false): boolean {
    const buffer = this.buffers.find((candidate) => candidate.id === id)
    if (!buffer) return false
    if (isDirty(buffer) && !force) return false

    const index = this.buffers.indexOf(buffer)
    this.buffers = this.buffers.filter((candidate) => candidate.id !== id)

    if (this.activeId === id) {
      const next = this.buffers[index] ?? this.buffers[index - 1] ?? null
      this.activeId = next?.id ?? null
    }

    this.emit()
    return true
  }

  private update(id: string, change: (buffer: Buffer) => Buffer): void {
    let changed = false
    this.buffers = this.buffers.map((buffer) => {
      if (buffer.id !== id) return buffer
      changed = true
      return change(buffer)
    })
    if (changed) this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this)
  }
}

function suggestedName(buffer: Buffer): string {
  if (buffer.path !== null) return fileName(buffer.path)
  return buffer.name === null ? 'Untitled.md' : buffer.name + '.md'
}
