import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createTicket, uploadAttachments } from '../../services/ticket.service'
import { listMyAssets } from '../../services/asset.service'
import { canShowPortalSwitchToItsm } from '../../security/policy'

const MAX_ATTACHMENT_SIZE_BYTES = 32 * 1024 * 1024
const PORTAL_TICKET_TYPE = 'Incident'
const PORTAL_TEAM_ID = 'helpdesk'

const priorityOptions = ['', 'Low', 'Medium', 'High', 'Critical']
const classificationOptions = ['', 'Hardware', 'Software', 'Access', 'Network', 'General']

function toBase64Content(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const parts = raw.split(',')
      resolve(parts.length > 1 ? parts[1] : raw)
    }
    reader.onerror = () => reject(new Error('Failed to read attachment'))
    reader.readAsDataURL(file)
  })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function PortalNewTicket() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const canSwitchToItsm = canShowPortalSwitchToItsm(user)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const insertMenuRef = useRef<HTMLDivElement | null>(null)
  const alignMenuRef = useRef<HTMLDivElement | null>(null)
  const orderedMenuRef = useRef<HTMLDivElement | null>(null)
  const unorderedMenuRef = useRef<HTMLDivElement | null>(null)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)
  const [showOrderedMenu, setShowOrderedMenu] = useState(false)
  const [showUnorderedMenu, setShowUnorderedMenu] = useState(false)

  const [profileOpen, setProfileOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState('')
  const [secondaryContacts, setSecondaryContacts] = useState('')
  const [subject, setSubject] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [assetField, setAssetField] = useState('')
  const [priority, setPriority] = useState('')
  const [classification, setClassification] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentInputKey, setAttachmentInputKey] = useState(0)
  const [assets, setAssets] = useState<any[]>([])

  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/')
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await listMyAssets({ pageSize: 200 })
        if (!active) return
        const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []
        setAssets(items)
      } catch {
        if (!active) return
        setAssets([])
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const assetOptions = useMemo(() => {
    const out = new Set<string>()
    for (const asset of assets) {
      const assetId = String(asset?.assetId || asset?.assetTag || asset?.id || '').trim()
      const assetName = String(asset?.name || asset?.model || asset?.assetType || asset?.category || '').trim()
      if (!assetId && !assetName) continue
      out.add(assetId && assetName ? `${assetId} - ${assetName}` : assetId || assetName)
    }
    return Array.from(out)
  }, [assets])

  const attachmentTotalBytes = useMemo(
    () => attachments.reduce((sum, file) => sum + Number(file?.size || 0), 0),
    [attachments]
  )

  const syncDescription = () => {
    setDescriptionText((editorRef.current?.innerText || '').trim())
  }

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    if (value !== undefined) document.execCommand(command, false, value)
    else document.execCommand(command, false)
    syncDescription()
  }

  const getSelectedList = (tag: 'UL' | 'OL') => {
    const selection = window.getSelection()
    let node: Node | null = selection?.anchorNode || null
    while (node) {
      if ((node as HTMLElement).nodeType === 1 && (node as HTMLElement).tagName === tag) return node as HTMLElement
      node = (node as HTMLElement).parentNode
    }
    return null
  }

  const applyAlign = (mode: 'left' | 'center' | 'right' | 'justify') => {
    if (mode === 'left') applyCommand('justifyLeft')
    else if (mode === 'center') applyCommand('justifyCenter')
    else if (mode === 'right') applyCommand('justifyRight')
    else applyCommand('justifyFull')
    setShowAlignMenu(false)
  }

  const applyOrderedListStyle = (style: string) => {
    applyCommand('insertOrderedList')
    const list = getSelectedList('OL')
    if (list) {
      if (!style) list.style.removeProperty('list-style-type')
      else list.style.listStyleType = style
    }
    setShowOrderedMenu(false)
  }

  const applyUnorderedListStyle = (style: string) => {
    applyCommand('insertUnorderedList')
    const list = getSelectedList('UL')
    if (list) {
      if (!style) list.style.removeProperty('list-style-type')
      else list.style.listStyleType = style
    }
    setShowUnorderedMenu(false)
  }

  const insertLink = () => {
    const url = String(window.prompt('Enter URL', 'https://') || '').trim()
    if (!url) return
    applyCommand('createLink', url)
    setShowInsertMenu(false)
  }

  const removeLink = () => {
    applyCommand('unlink')
    setShowInsertMenu(false)
  }

  const insertHtml = () => {
    const html = window.prompt('Insert HTML', '')
    if (html === null) return
    applyCommand('insertHTML', html)
    setShowInsertMenu(false)
  }

  const editHtml = () => {
    if (!editorRef.current) return
    const html = window.prompt('Edit HTML', editorRef.current.innerHTML)
    if (html === null) return
    editorRef.current.innerHTML = html
    syncDescription()
    setShowInsertMenu(false)
  }

  const insertTable = () => {
    const rowsRaw = window.prompt('Rows', '2')
    if (rowsRaw === null) return
    const colsRaw = window.prompt('Columns', '2')
    if (colsRaw === null) return
    const rows = Math.max(1, Math.min(8, Number(rowsRaw) || 2))
    const cols = Math.max(1, Math.min(8, Number(colsRaw) || 2))
    let html = '<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0">'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) html += '<td style="padding:6px">&nbsp;</td>'
      html += '</tr>'
    }
    html += '</table>'
    applyCommand('insertHTML', html)
    setShowInsertMenu(false)
  }

  const insertHorizontalRule = () => {
    applyCommand('insertHorizontalRule')
    setShowInsertMenu(false)
  }

  const insertCode = () => {
    const code = window.prompt('Insert code', '')
    if (code === null) return
    const html = `<pre style="background:#f8fafc;border:1px solid #dbe3ef;border-radius:4px;padding:8px;"><code>${escapeHtml(code)}</code></pre>`
    applyCommand('insertHTML', html)
    setShowInsertMenu(false)
  }

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!showInsertMenu && !showAlignMenu && !showOrderedMenu && !showUnorderedMenu) return
      const target = event.target as Node
      if (insertMenuRef.current && !insertMenuRef.current.contains(target)) setShowInsertMenu(false)
      if (alignMenuRef.current && !alignMenuRef.current.contains(target)) setShowAlignMenu(false)
      if (orderedMenuRef.current && !orderedMenuRef.current.contains(target)) setShowOrderedMenu(false)
      if (unorderedMenuRef.current && !unorderedMenuRef.current.contains(target)) setShowUnorderedMenu(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [showInsertMenu, showAlignMenu, showOrderedMenu, showUnorderedMenu])

  const resetForm = () => {
    setSecondaryContacts('')
    setSubject('')
    setDescriptionText('')
    setAssetField('')
    setPriority('')
    setClassification('')
    setAttachments([])
    setAttachmentInputKey((v) => v + 1)
    if (editorRef.current) editorRef.current.innerHTML = ''
  }

  const onDiscard = () => {
    resetForm()
    setResult('')
  }

  const onSubmit = async () => {
    const cleanSubject = subject.trim()
    const cleanDescription = descriptionText.trim()
    if (!cleanSubject) {
      setResult('Subject is required.')
      return
    }
    if (!cleanDescription) {
      setResult('Description is required.')
      return
    }
    if (!priority) {
      setResult('Priority is required.')
      return
    }
    for (const file of attachments) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setResult(`Attachment "${file.name}" exceeds 32 MB.`)
        return
      }
    }
    if (attachmentTotalBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      setResult('Total attachment size must be 32 MB or less.')
      return
    }

    const metaLines: string[] = []
    if (assetField.trim()) metaLines.push(`Asset: ${assetField.trim()}`)
    if (secondaryContacts.trim()) metaLines.push(`Secondary Contacts (CCs): ${secondaryContacts.trim()}`)
    if (classification.trim()) metaLines.push(`Classification: ${classification.trim()}`)
    const finalDescription = metaLines.length > 0 ? `${cleanDescription}\n\n${metaLines.join('\n')}` : cleanDescription

    try {
      setSubmitting(true)
      setResult('')
      const created = await createTicket({
        subject: cleanSubject,
        summary: cleanSubject,
        description: finalDescription,
        type: PORTAL_TICKET_TYPE,
        priority,
        category: classification || undefined,
        status: 'New',
        createdFrom: 'User portal',
        teamId: PORTAL_TEAM_ID,
        requesterId: user?.id,
        requesterEmail: user?.email,
      })

      if (attachments.length > 0) {
        const ticketRef = String(created?.ticketId || created?.id || '').trim()
        if (ticketRef) {
          const filesPayload = await Promise.all(
            attachments.map(async (file) => ({
              name: file.name,
              type: file.type || undefined,
              size: file.size,
              contentBase64: await toBase64Content(file),
            }))
          )
          await uploadAttachments(ticketRef, {
            files: filesPayload,
            note: 'Submitted from user portal',
            internal: false,
          })
        }
      }

      setResult('Ticket submitted successfully.')
      navigate('/portal/tickets')
    } catch (e: any) {
      setResult(e?.response?.data?.error || 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-root portal-new-ticket">
      <header className="portal-topbar portal-home-topbar portal-unified-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>
              Home
            </button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/new-ticket')}>
              New Ticket
            </button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>
              My Tickets
            </button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/assets')}>
              My Devices
            </button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen(true)}>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      <section className="portal-page portal-submit-ticket-page">
        <div className="portal-submit-ticket-card">
          <h1>Raise a ticket</h1>

          <label className="portal-submit-ticket-field">
            <span>
              Secondary Contacts (CCs) <small>i</small>
            </span>
            <input
              value={secondaryContacts}
              onChange={(e) => setSecondaryContacts(e.target.value)}
              placeholder="Enter name or email address"
            />
          </label>

          <label className="portal-submit-ticket-field">
            <span>
              Subject <em>*</em>
            </span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>

          <label className="portal-submit-ticket-field">
            <span>
              Description <em>*</em>
            </span>
            <div className="portal-submit-editor">
              <div className="portal-submit-editor-toolbar">
                <button type="button" className="portal-editor-icon-btn" onClick={() => applyCommand('bold')} title="Bold" aria-label="Bold">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 5h6a4 4 0 0 1 0 8H7z" />
                    <path d="M7 13h7a4 4 0 0 1 0 8H7z" />
                  </svg>
                </button>
                <button type="button" className="portal-editor-icon-btn" onClick={() => applyCommand('italic')} title="Italic" aria-label="Italic">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 5h6" />
                    <path d="M4 19h6" />
                    <path d="M14 5 10 19" />
                  </svg>
                </button>
                <button type="button" className="portal-editor-icon-btn" onClick={() => applyCommand('underline')} title="Underline" aria-label="Underline">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 5v6a5 5 0 0 0 10 0V5" />
                    <path d="M5 19h14" />
                  </svg>
                </button>
                <button type="button" className="portal-editor-icon-btn" onClick={() => applyCommand('foreColor', '#0ea5e9')} title="Text color" aria-label="Text color">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m6 15 6-10 6 10" />
                    <path d="M9.5 11h5" />
                    <path d="M4 20h16" />
                  </svg>
                </button>
                <button type="button" className="portal-editor-icon-btn" onClick={() => applyCommand('hiliteColor', '#fef3c7')} title="Highlight" aria-label="Highlight">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m5 16 7-7 5 5-7 7H5z" />
                    <path d="M14 7 16 5l3 3-2 2" />
                    <path d="M4 20h16" />
                  </svg>
                </button>
                <select
                  className="portal-editor-size-select"
                  defaultValue="12"
                  onChange={(e) => {
                    const map: Record<string, string> = { '12': '2', '14': '3', '16': '4' }
                    applyCommand('fontSize', map[e.target.value] || '3')
                  }}
                  aria-label="Font size"
                >
                  <option value="12">12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                </select>
                <div className="portal-editor-split-wrap" ref={alignMenuRef}>
                  <button type="button" className="portal-editor-icon-btn" onClick={() => applyAlign('left')} title="Align left" aria-label="Align left">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="portal-editor-split-toggle"
                    aria-label="Alignment options"
                    onClick={() => {
                      setShowAlignMenu((v) => !v)
                      setShowInsertMenu(false)
                      setShowOrderedMenu(false)
                      setShowUnorderedMenu(false)
                    }}
                  >
                    <span aria-hidden="true">v</span>
                  </button>
                  {showAlignMenu ? (
                    <div className="portal-editor-flyout-menu" role="menu" aria-label="Alignment options">
                      <button type="button" onClick={() => applyAlign('left')}>Align left</button>
                      <button type="button" onClick={() => applyAlign('center')}>Align center</button>
                      <button type="button" onClick={() => applyAlign('right')}>Align right</button>
                      <button type="button" onClick={() => applyAlign('justify')}>Justify</button>
                    </div>
                  ) : null}
                </div>

                <div className="portal-editor-split-wrap" ref={orderedMenuRef}>
                  <button type="button" className="portal-editor-icon-btn" onClick={() => applyOrderedListStyle('')} title="Numbered list" aria-label="Numbered list">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h2v2H4zM4 12h2v2H4zM4 17h2v2H4z" />
                      <path d="M9 8h11M9 13h11M9 18h11" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="portal-editor-split-toggle"
                    aria-label="Number style options"
                    onClick={() => {
                      setShowOrderedMenu((v) => !v)
                      setShowInsertMenu(false)
                      setShowAlignMenu(false)
                      setShowUnorderedMenu(false)
                    }}
                  >
                    <span aria-hidden="true">v</span>
                  </button>
                  {showOrderedMenu ? (
                    <div className="portal-editor-flyout-menu" role="menu" aria-label="Number style options">
                      <button type="button" onClick={() => applyOrderedListStyle('')}>Default</button>
                      <button type="button" onClick={() => applyOrderedListStyle('lower-alpha')}>Lower Alpha</button>
                      <button type="button" onClick={() => applyOrderedListStyle('lower-greek')}>Lower Greek</button>
                      <button type="button" onClick={() => applyOrderedListStyle('lower-roman')}>Lower Roman</button>
                      <button type="button" onClick={() => applyOrderedListStyle('upper-alpha')}>Upper Alpha</button>
                      <button type="button" onClick={() => applyOrderedListStyle('upper-roman')}>Upper Roman</button>
                    </div>
                  ) : null}
                </div>

                <div className="portal-editor-split-wrap" ref={unorderedMenuRef}>
                  <button type="button" className="portal-editor-icon-btn" onClick={() => applyUnorderedListStyle('')} title="Bullet list" aria-label="Bullet list">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" />
                      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
                      <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
                      <path d="M9 7h11M9 12h11M9 17h11" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="portal-editor-split-toggle"
                    aria-label="Bullet style options"
                    onClick={() => {
                      setShowUnorderedMenu((v) => !v)
                      setShowInsertMenu(false)
                      setShowAlignMenu(false)
                      setShowOrderedMenu(false)
                    }}
                  >
                    <span aria-hidden="true">v</span>
                  </button>
                  {showUnorderedMenu ? (
                    <div className="portal-editor-flyout-menu" role="menu" aria-label="Bullet style options">
                      <button type="button" onClick={() => applyUnorderedListStyle('')}>Default</button>
                      <button type="button" onClick={() => applyUnorderedListStyle('circle')}>Circle</button>
                      <button type="button" onClick={() => applyUnorderedListStyle('disc')}>Disc</button>
                      <button type="button" onClick={() => applyUnorderedListStyle('square')}>Square</button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="portal-editor-icon-btn"
                  onClick={() => {
                    const url = String(window.prompt('Image URL', 'https://') || '').trim()
                    if (!url) return
                    applyCommand('insertImage', url)
                  }}
                  title="Insert image"
                  aria-label="Insert image"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="5" width="16" height="14" rx="1.5" />
                    <circle cx="10" cy="10" r="1.5" />
                    <path d="m6 17 4-4 3 3 3-4 2 2" />
                  </svg>
                </button>
                <button type="button" className="portal-editor-icon-btn" onClick={() => applyCommand('removeFormat')} title="Clear formatting" aria-label="Clear formatting">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 20h10" />
                    <path d="m7 4 10 10" />
                    <path d="m14 4-7 7" />
                    <path d="m17 14 3 3" />
                  </svg>
                </button>
                <div className="portal-editor-insert-wrap" ref={insertMenuRef}>
                  <button
                    type="button"
                    className="portal-editor-insert-btn"
                    onClick={() => {
                      setShowInsertMenu((v) => !v)
                      setShowAlignMenu(false)
                      setShowOrderedMenu(false)
                      setShowUnorderedMenu(false)
                    }}
                  >
                    Insert <span aria-hidden="true">v</span>
                  </button>
                  {showInsertMenu ? (
                    <div className="portal-editor-insert-menu" role="menu" aria-label="Insert options">
                      <button type="button" onClick={insertLink}>Insert link</button>
                      <button type="button" onClick={removeLink}>Remove link</button>
                      <button type="button" onClick={insertHtml}>Insert HTML</button>
                      <button type="button" onClick={editHtml}>Edit HTML</button>
                      <button type="button" onClick={insertTable}>Insert table</button>
                      <button type="button" onClick={insertHorizontalRule}>Insert horizontal rule</button>
                      <button type="button" onClick={insertCode}>Insert code</button>
                    </div>
                  ) : null}
                </div>
                <span className="portal-editor-toolbar-spacer" />
                <button type="button" className="portal-editor-plain-btn" onClick={() => applyCommand('removeFormat')}>
                  Plain text
                </button>
              </div>
              <div
                ref={editorRef}
                className="portal-submit-editor-body"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Describe your issue"
                onInput={() => setDescriptionText((editorRef.current?.innerText || '').trim())}
              />
            </div>
          </label>

          <label className="portal-submit-ticket-field">
            <span>Assets</span>
            <div className="portal-submit-ticket-asset-wrap">
              <input
                list="portal-assets-list"
                value={assetField}
                onChange={(e) => setAssetField(e.target.value)}
                placeholder=""
              />
              <span className="portal-submit-ticket-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </span>
            </div>
            <datalist id="portal-assets-list">
              {assetOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>

          <label className="portal-submit-ticket-field">
            <span>
              Priority <em>*</em>
            </span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">-None-</option>
              {priorityOptions
                .filter(Boolean)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </label>

          <label className="portal-submit-ticket-field">
            <span>Classifications</span>
            <select value={classification} onChange={(e) => setClassification(e.target.value)}>
              <option value="">-None-</option>
              {classificationOptions
                .filter(Boolean)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </label>

          <div className="portal-submit-ticket-attachment">
            <label className="portal-submit-ticket-upload">
              <input
                key={attachmentInputKey}
                type="file"
                multiple
                onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              />
              <span className="portal-submit-ticket-upload-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3v11" />
                  <path d="M8 7l4-4 4 4" />
                  <path d="M5 14v4h14v-4" />
                </svg>
              </span>
              <span>Attach a file</span>
              <small>(Up to 32 MB)</small>
            </label>
            {attachments.length > 0 ? (
              <div className="portal-submit-ticket-files">
                {attachments.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="portal-submit-ticket-file">
                    <span>{file.name}</span>
                    <small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="portal-submit-ticket-actions">
            <button className="portal-submit-btn" onClick={onSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            <button className="portal-discard-btn" onClick={onDiscard} disabled={submitting}>
              Discard
            </button>
          </div>
          {result ? <div className={`portal-form-result${result.toLowerCase().includes('success') ? ' ok' : ''}`}>{result}</div> : null}
        </div>
      </section>

      {profileOpen && (
        <div className="portal-profile-overlay" onClick={() => setProfileOpen(false)}>
          <aside className="portal-profile-panel" onClick={(e) => e.stopPropagation()}>
            <button className="portal-profile-close" onClick={() => setProfileOpen(false)} aria-label="Close">
              x
            </button>
            <div className="portal-profile-header">
              <div className="portal-profile-avatar">{initials}</div>
              <div>
                <div className="portal-profile-title">{user?.name || 'User'}</div>
                <div className="portal-profile-email">{user?.email || 'user@example.com'}</div>
                <div className="portal-profile-status">
                  <span className="portal-status-dot" />
                  Available
                </div>
              </div>
            </div>
            <div className="portal-profile-links">
              <button onClick={() => { setProfileOpen(false); navigate('/security') }}>Account &amp; Password</button>
              {canSwitchToItsm ? <button onClick={() => { setProfileOpen(false); switchToAgentApp() }}>Switch to Agent Application</button> : null}
              <button onClick={() => { logout(); navigate('/login') }}>Log out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
