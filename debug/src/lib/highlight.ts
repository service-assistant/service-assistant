import { createHighlightJsAdapter } from '@mantine/code-highlight'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', json)

export const highlightJsAdapter = createHighlightJsAdapter(hljs)
