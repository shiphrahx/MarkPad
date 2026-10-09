import type { Host } from '../host/types.js'
import type { Workspace } from './workspace.js'
import { loadSession, saveSession, signatureOf, withRecent, type Session } from './session.js'

/**
 * Keeps the session file in step with the tabs: reopens last time's files at
 * launch, writes the list back when it changes, and keeps the recent files.
 *
 * Pulled out of the app class, which only needs to say when. What gets kept
 * and how is all here.
 */
export class SessionKeeper {
  /** Last session written, so an unchanged one is not rewritten. */
  private signature = ''
  /** Files opened lately, newest first. */
  private recent: readonly string[] = []
  /** Paths that had tabs the last time the session was remembered. */
  private seen = new Set<string>()

  constructor(
    private readonly host: Host,
    private readonly workspace: Workspace,
  ) {}

  /**
   * Reopen last time's files.
   *
   * One at a time, because a file that has been deleted or renamed since must
   * not stop the rest from opening. A missing file is dropped quietly: you
   * already know you deleted it, and a dialog at every launch until you
   * happen to open something else would be its own kind of rude.
   */
  async restore(): Promise<void> {
    const session = await loadSession(this.host)
    this.recent = session.recent
    if (session.paths.length === 0) return

    const opened: string[] = []
    for (const path of session.paths) {
      try {
        await this.workspace.open([path])
        opened.push(path)
      } catch {
        // Gone since last time. Skip it and open the rest.
      }
    }

    const wanted = session.paths[session.active]
    const target = this.workspace.tabs.find((buffer) => buffer.path === wanted)
    if (target) this.workspace.focus(target.id)
    else if (opened.length > 0) this.workspace.focus(this.workspace.tabs[0]!.id)
  }

  /** Remember the open files, if which files are open has actually changed. */
  remember(): void {
    const paths = this.workspace.tabs
      .map((buffer) => buffer.path)
      .filter((path): path is string => path !== null)

    // Anything with a tab now that had none before was just opened, by
    // whatever route: the dialog, a drop, Save as, a second launch.
    const opened = paths.filter((path) => !this.seen.has(path))
    if (opened.length > 0) this.recent = withRecent(this.recent, opened)
    this.seen = new Set(paths)

    const activePath = this.workspace.active?.path ?? null
    const session: Session = {
      paths,
      active: activePath === null ? 0 : Math.max(0, paths.indexOf(activePath)),
      recent: this.recent,
    }

    const signature = signatureOf(session)
    if (signature === this.signature) return

    this.signature = signature
    saveSession(this.host, session)
  }

  /** Recent files that are not open right now, newest first. */
  recentClosed(): string[] {
    const open = new Set(this.workspace.tabs.map((buffer) => buffer.path))
    return this.recent.filter((path) => !open.has(path))
  }
}
