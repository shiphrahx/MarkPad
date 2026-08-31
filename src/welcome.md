# Welcome to MarkPad

This is an ordinary Markdown file. Edit it, save it somewhere, or close the tab
and never see it again. Nothing here is special to the app.

You are looking at **reader mode**: the document is rendered and you type
straight into it. Press `Ctrl+Shift+M` (`⌘⇧M` on macOS) to see the source
underneath. Press `Ctrl+K` for every command MarkPad has, or type `/` on an
empty line for blocks.

Markdown shorthand still works while you type. `## ` makes a heading, `- ` a
list, `> ` a quote, `**bold**` turns bold as you close it.

---

## Text

Text can be **bold**, *italic*, ***both at once***, ~~struck through~~ or
`inline code`. Code spans are literal: `**this stays as asterisks**`.

Links are [written like this](https://github.com/shiphrahx/MarkPad), and a bare
address such as https://commonmark.org is picked up on its own.

A soft line break lands here  
and carries on underneath, without starting a new paragraph.

## Headings

Six levels, and each one puts a tick on the outline rail down the left edge.

# Heading one
## Heading two
### Heading three
#### Heading four
##### Heading five
###### Heading six

## Lists

- A bullet
- Another one
  - Nested a level down
  - And a sibling
- Back out again

Ordered lists keep their starting number:

3. Starts at three
4. Because the source said so
5. And the file is written back the same way

Task lists are ticked in place. Clicking a box edits the file:

- [x] Open a Markdown file
- [x] Read this far
- [ ] Write something of your own

## Quotes

> A quote is a block like any other, so it holds whatever you put in it.
>
> - Including lists
> - And more than one paragraph
>
> > Quotes nest, if you need them to.

## Code

Fenced blocks are highlighted when the fence names a language:

```ts
export function greet(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? `Hello, ${trimmed}.` : 'Hello.'
}
```

```python
def word_count(text: str) -> int:
    return len(text.split())
```

A fence with no language stays plain, which is what you want for output:

```
$ markpad --version
0.1.2
```

## Tables

Columns align left, centre or right, set by the colons in the delimiter row.

| Feature      | Where it lives    | Cost |
| :----------- | :---------------: | ---: |
| Reader mode  | The main surface  |    0 |
| Source view  | `Ctrl+Shift+M`    |    0 |
| Preview pane | `Ctrl+Shift+V`    |    0 |
| Export       | HTML and PDF      |    0 |

## Maths

Inline maths sits in single dollars: $E = mc^2$, or $a^2 + b^2 = c^2$.

Display maths goes in a fence, and is drawn only when something on screen needs
it:

```math
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
```

## Diagrams

Mermaid blocks are drawn the same way, on demand:

```mermaid
flowchart LR
  open[Open a file] --> read[Reader mode]
  read --> edit[Edit in place]
  edit --> save[Save]
  read -->|Ctrl+Shift+M| source[Source view]
  source --> edit
```

## Images

Images render inline. This one is drawn from the file itself, so it works with
no network at all:

![A blue rectangle, 160 by 48](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAAwCAIAAAAZy+Y5AAAAZUlEQVR42u3RQQ0AAAjEsHOIM+zyxQYhTaZgTfXocbEAsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAut4C2ifbKwSmRsgAAAAASUVORK5CYII=)

A relative path works the way you would expect: `![Diagram](./diagram.png)`
finds a file sitting next to this one.

## Raw HTML

HTML you wrote by hand is kept exactly as written, rather than rewritten into
something tidier:

<details>
<summary>An HTML block, untouched on save</summary>
Anything in here comes back out byte for byte.
</details>

---

## Two honest notes

**Saving rewrites formatting, not content.** MarkPad generates the Markdown
source from what you edited, so emphasis markers, table padding and line
wrapping come back in its preferred form. That happens on lines you never
touched. The words are yours and stay yours, the punctuation of the markup is
not always.

**There is no vault.** No database, no account, no sync, no telemetry. Files
you make here are plain `.md` files in a folder you chose. Delete MarkPad and
every one of them still opens in anything else.
