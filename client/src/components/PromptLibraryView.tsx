import React from 'react'
import { PROMPT_TEMPLATES, QUICK_REQUESTS, type PromptCategory, type PromptTheme } from '../data/promptLibrary'

const categoryLabels: Record<PromptCategory, string> = {
  'ui-design': 'UI Design',
  'full-system': 'Full System',
  'image-set': 'Image Set',
  'advanced-ux': 'Advanced UX',
  'react-code': 'React Code',
  'figma-kit': 'Figma Kit',
}

function filterTemplates(theme: PromptTheme | 'all', category: PromptCategory | 'all') {
  return PROMPT_TEMPLATES.filter((item) => {
    if (theme !== 'all' && item.theme !== theme) return false
    if (category !== 'all' && item.category !== category) return false
    return true
  })
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  throw new Error('Clipboard API not available')
}

export default function PromptLibraryView() {
  const [theme, setTheme] = React.useState<PromptTheme | 'all'>('all')
  const [category, setCategory] = React.useState<PromptCategory | 'all'>('all')
  const [copiedId, setCopiedId] = React.useState<string>('')
  const [copyError, setCopyError] = React.useState<string>('')

  const filtered = React.useMemo(() => filterTemplates(theme, category), [theme, category])

  const onCopy = async (id: string, prompt: string) => {
    try {
      await copyToClipboard(prompt)
      setCopiedId(id)
      setCopyError('')
      window.setTimeout(() => setCopiedId(''), 1400)
    } catch {
      setCopyError('Copy failed. Please copy manually.')
      window.setTimeout(() => setCopyError(''), 2000)
    }
  }

  return (
    <div className="work-main prompt-library-page">
      <div className="prompt-library-header">
        <h2>AI Prompt Library</h2>
        <p>Reusable prompts for UI design, full-stack scaffolding, image generation, and advanced UX exploration.</p>
      </div>

      <div className="prompt-library-toolbar">
        <div className="prompt-library-filter">
          <label htmlFor="prompt-theme">Theme</label>
          <select id="prompt-theme" value={theme} onChange={(e) => setTheme(e.target.value as PromptTheme | 'all')}>
            <option value="all">All</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="prompt-library-filter">
          <label htmlFor="prompt-category">Category</label>
          <select id="prompt-category" value={category} onChange={(e) => setCategory(e.target.value as PromptCategory | 'all')}>
            <option value="all">All</option>
            <option value="ui-design">UI Design</option>
            <option value="full-system">Full System</option>
            <option value="image-set">Image Set</option>
            <option value="advanced-ux">Advanced UX</option>
            <option value="react-code">React Code</option>
            <option value="figma-kit">Figma Kit</option>
          </select>
        </div>
      </div>

      <div className="prompt-library-quick">
        <h3>Quick Requests</h3>
        <div className="prompt-quick-row">
          {QUICK_REQUESTS.map((request) => (
            <button key={request} type="button" onClick={() => onCopy(request, request)}>
              {request}
            </button>
          ))}
        </div>
      </div>

      {copyError ? <div className="prompt-copy-error">{copyError}</div> : null}

      <div className="prompt-grid">
        {filtered.map((item) => (
          <article key={item.id} className="prompt-card">
            <div className="prompt-card-head">
              <div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </div>
              <div className="prompt-badges">
                <span>{categoryLabels[item.category]}</span>
                <span>{item.theme}</span>
              </div>
            </div>
            <pre>{item.prompt}</pre>
            <div className="prompt-card-tags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="prompt-card-actions">
              <button type="button" onClick={() => onCopy(item.id, item.prompt)}>
                {copiedId === item.id ? 'Copied' : 'Copy Prompt'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
