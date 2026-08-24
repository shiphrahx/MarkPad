import './app.css'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('MarkPad could not find its root element.')

root.textContent = 'MarkPad'
