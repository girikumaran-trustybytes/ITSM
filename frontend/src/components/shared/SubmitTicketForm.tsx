import { type ChangeEvent, useMemo, useRef, useState } from 'react'
import { createTicket, uploadAttachments } from '../../services/ticket.service'

type SubmitTicketFormProps = {
  requesterId?: number | string
  requesterEmail?: string
  createdFrom: string
  submitLabel?: string
  onSubmitted?: (ticket: any) => void | Promise<void>
  onDiscard?: () => void
  className?: string
}

type PriorityOption = {
  value: string
  label: string
  level: 'Low' | 'Medium' | 'High'
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: '', label: '-None-', level: 'Low' },
  { value: 'high_emergency', label: 'High / Emergency', level: 'High' },
  { value: 'medium_urgent', label: 'Medium / Urgent', level: 'Medium' },
  { value: 'low_non_emergency', label: 'Low / Non Emergency', level: 'Low' },
]

const CLASSIFICATION_OPTIONS = [
  '-None-',
  'Content Support',
  'Fault - Hardware',
  'Fault - Software',
  'Software Support',
  'Other Problem',
  'Question',
  'Others',
]
const MAX_FILE_SIZE_BYTES = 40 * 1024 * 1024

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error || new Error('Unable to read attachment'))
    reader.readAsDataURL(file)
  })
}

export default function SubmitTicketForm({
  requesterId,
  requesterEmail,
  createdFrom,
  submitLabel = 'Submit',
  onSubmitted,
  onDiscard,
  className = '',
}: SubmitTicketFormProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [secondaryContacts, setSecondaryContacts] = useState('')
  const [subject, setSubject] = useState('')
  const [productName, setProductName] = useState('')
  const [priority, setPriority] = useState('')
  const [classification, setClassification] = useState('-None-')
  const [fontSize, setFontSize] = useState('12')
  const [attachments, setAttachments] = useState<File[]>([])
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const priorityLevel = useMemo(() => {
    const found = PRIORITY_OPTIONS.find((opt) => opt.value === priority)
    return found?.level || 'Low'
  }, [priority])

  const runCommand = (command: string, value?: string) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
  }

  const applyPlainText = () => {
    if (!editorRef.current) return
    const text = editorRef.current.innerText || ''
    editorRef.current.textContent = text
  }

  const resetForm = () => {
    setSecondaryContacts('')
    setSubject('')
    setProductName('')
    setPriority('')
    setClassification('-None-')
    setAttachments([])
    setShowInsertMenu(false)
    if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }
  }

  const onAttachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const oversize = files.find((file) => file.size > MAX_FILE_SIZE_BYTES)
    if (oversize) {
      setErrorMsg(`"${oversize.name}" exceeds 40 MB.`)
      event.target.value = ''
      return
    }
    setErrorMsg('')
    setAttachments((prev) => [...prev, ...files])
    event.target.value = ''
  }

  const handleDiscard = () => {
    resetForm()
    setStatusMsg('')
    setErrorMsg('')
    onDiscard?.()
  }

  const handleSubmit = async () => {
    const cleanSubject = subject.trim()
    const cleanDescription = String(editorRef.current?.innerText || '').trim()

    if (!cleanSubject) {
      setErrorMsg('Subject is required.')
      setStatusMsg('')
      return
    }
    if (!cleanDescription) {
      setErrorMsg('Description is required.')
      setStatusMsg('')
      return
    }
    if (!priority) {
      setErrorMsg('Priority is required.')
      setStatusMsg('')
      return
    }

    try {
      setSaving(true)
      setErrorMsg('')
      setStatusMsg('')

      const compiledDescription = [
        `Secondary Contacts (CCs): ${secondaryContacts.trim() || '-'}`,
        `Product Name: ${productName.trim() || '-'}`,
        `Classification: ${classification === '-None-' ? '-' : classification}`,
        '',
        cleanDescription,
        '',
        attachments.length ? `Attachments: ${attachments.map((file) => file.name).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      const created = await createTicket({
        subject: cleanSubject,
        summary: cleanSubject,
        description: compiledDescription,
        type: 'Incident',
        category: classification === '-None-' ? 'General' : classification,
        subcategory: productName.trim() || undefined,
        status: 'New',
        createdFrom,
        requesterId: requesterId ? Number(requesterId) : undefined,
        requesterEmail: requesterEmail || undefined,
        priority: priorityLevel,
      })

      const ticketRef = String(created?.ticketId || created?.id || '').trim()
      if (ticketRef && attachments.length > 0) {
        const files = await Promise.all(
          attachments.map(async (file) => ({
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            contentBase64: await fileToBase64(file),
          }))
        )
        await uploadAttachments(ticketRef, { files, note: 'Ticket attachments', internal: false })
      }

      setStatusMsg('Ticket submitted successfully.')
      resetForm()
      await onSubmitted?.(created)
    } catch (error: any) {
      setErrorMsg(error?.response?.data?.error || error?.message || 'Failed to submit ticket.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`submit-ticket-form ${className}`.trim()}>
      <h1>Submit a ticket</h1>

      <div className="submit-ticket-field">
        <label>Secondary Contacts (CCs) <span className="submit-ticket-info">i</span></label>
        <input
          value={secondaryContacts}
          onChange={(event) => setSecondaryContacts(event.target.value)}
          placeholder="Enter name or email address"
        />
      </div>

      <div className="submit-ticket-divider" />
      <h2>Ticket Information</h2>

      <div className="submit-ticket-field">
        <label>Subject <span className="required">*</span></label>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder=""
        />
      </div>

      <div className="submit-ticket-field">
        <label>Description <span className="required">*</span></label>
        <div className="submit-ticket-editor-shell">
          <div className="submit-ticket-toolbar">
            <button type="button" onClick={() => runCommand('bold')} aria-label="Bold"><strong>B</strong></button>
            <button type="button" onClick={() => runCommand('italic')} aria-label="Italic"><em>I</em></button>
            <button type="button" onClick={() => runCommand('underline')} aria-label="Underline"><u>U</u></button>
            <button type="button" onClick={() => runCommand('removeFormat')} aria-label="Clear formatting">A</button>
            <select value={fontSize} onChange={(event) => setFontSize(event.target.value)} aria-label="Font size">
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16">16</option>
            </select>
            <button type="button" onClick={() => runCommand('justifyLeft')} aria-label="Align left">L</button>
            <button type="button" onClick={() => runCommand('insertUnorderedList')} aria-label="Bullet list">UL</button>
            <button type="button" onClick={() => runCommand('insertOrderedList')} aria-label="Number list">1.</button>
            <button type="button" onClick={() => runCommand('insertHorizontalRule')} aria-label="Insert divider">-</button>
            <button type="button" onClick={() => runCommand('insertText', '[img]')} aria-label="Insert image placeholder">img</button>
            <button
              type="button"
              className="submit-ticket-insert-btn"
              onClick={() => setShowInsertMenu((prev) => !prev)}
              aria-label="Insert menu"
            >
              Insert
            </button>
            <button type="button" onClick={applyPlainText} className="submit-ticket-plain-btn">Plain text</button>
          </div>
          {showInsertMenu && (
            <div className="submit-ticket-insert-menu">
              <button type="button" onClick={() => { const url = window.prompt('Enter URL'); if (url) runCommand('createLink', url); setShowInsertMenu(false) }}>Link</button>
              <button type="button" onClick={() => { runCommand('formatBlock', 'blockquote'); setShowInsertMenu(false) }}>Quote</button>
              <button type="button" onClick={() => { runCommand('insertText', new Date().toLocaleString()); setShowInsertMenu(false) }}>Timestamp</button>
            </div>
          )}
          <div
            ref={editorRef}
            className="submit-ticket-editor"
            contentEditable
            role="textbox"
            aria-label="Description editor"
            style={{ fontSize: `${fontSize}px` }}
            suppressContentEditableWarning
          />
        </div>
      </div>

      <div className="submit-ticket-field">
        <label>Product Name</label>
        <div className="submit-ticket-search-input">
          <input value={productName} onChange={(event) => setProductName(event.target.value)} />
          <span>Go</span>
        </div>
      </div>

      <h2>Additional Information</h2>
      <div className="submit-ticket-field">
        <label>Priority <span className="required">*</span></label>
        <select value={priority} onChange={(event) => setPriority(event.target.value)}>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value || 'none'} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="submit-ticket-field">
        <label>Classifications</label>
        <select value={classification} onChange={(event) => setClassification(event.target.value)}>
          {CLASSIFICATION_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="submit-ticket-upload">
        <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach files">
          Up
        </button>
        <div>
          <div className="submit-ticket-upload-title">Attach a file</div>
          <div className="submit-ticket-upload-sub">(Up to 40 MB)</div>
          {attachments.length > 0 && (
            <div className="submit-ticket-attachment-list">
              {attachments.map((file, idx) => (
                <span key={`${file.name}-${idx}`}>
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== idx))}
                    aria-label={`Remove ${file.name}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onAttachFiles}
          hidden
        />
      </div>

      <div className="submit-ticket-actions">
        <button type="button" className="submit-ticket-btn-primary" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Submitting...' : submitLabel}
        </button>
        <button type="button" className="submit-ticket-btn-ghost" disabled={saving} onClick={handleDiscard}>
          Discard
        </button>
      </div>

      {errorMsg ? <div className="submit-ticket-error">{errorMsg}</div> : null}
      {!errorMsg && statusMsg ? <div className="submit-ticket-success">{statusMsg}</div> : null}
    </div>
  )
}
