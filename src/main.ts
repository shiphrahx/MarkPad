import './app.css'
import { createEditor } from './editor/index.js'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('MarkPad could not find its root element.')

createEditor(root, {
  doc: '# MarkPad\n\nPlain text in, plain text out.\n',
})
