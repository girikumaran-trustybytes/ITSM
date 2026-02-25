import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import { useRef, useState } from 'react'
import { createTicket } from '../../services/ticket.service'

export default function PortalNewTicket() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [summary, setSummary] = useState('')
  const [impact, setImpact] = useState('')
  const [urgency, setUrgency] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState('')
  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/')
  }

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    if (value !== undefined) document.execCommand(command, false, value)
    else document.execCommand(command, false)
  }

  const handleSubmit = async () => {
    const details = editorRef.current?.innerText?.trim() || ''
    if (!summary.trim() || !details || !impact || !urgency) {
      setResult('Please fill all required fields.')
      return
    }
    try {
      setSubmitting(true)
      setResult('')
      await createTicket({
        subject: summary.trim(),
        summary: summary.trim(),
        description: details,
        impact,
        urgency,
        type: 'Incident',
        createdFrom: 'User portal',
        requesterId: user?.id,
        requesterEmail: user?.email,
      })
      setResult('Ticket created successfully.')
      navigate('/portal/tickets')
    } catch (e: any) {
      setResult(e?.response?.data?.error || 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-root">
      <header className="portal-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/new-ticket')}>Report an issue</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>My Tickets</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/assets')}>My Devices</button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen(true)}>
            <div className="portal-profile-name">{user?.name || 'User'}</div>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      <section className="portal-page">
        <div className="portal-page-header">
          <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">←</button>
          <div>
            <h1>New Ticket</h1>
            <p className="portal-page-sub">Please complete the following form to submit a new Ticket.</p>
          </div>
          <div className="portal-required-hint">* denotes a mandatory field</div>
        </div>

        <div className="portal-form">
          <label className="portal-field">
            <span>Contact *</span>
            <div className="portal-contact">
              <div className="portal-contact-avatar">{initials}</div>
              <div>
                <div className="portal-contact-name">{user?.name || 'User'}</div>
                <div className="portal-contact-sub">{user?.email || 'user@example.com'}</div>
              </div>
            </div>
          </label>

          <label className="portal-field">
            <span>Summary *</span>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>

          <label className="portal-field">
            <span>Details *</span>
            <div className="portal-editor">
              <div className="portal-editor-toolbar">
                <button type="button" onClick={() => applyCommand('bold')}><strong>B</strong></button>
                <button type="button" onClick={() => applyCommand('italic')}><em>I</em></button>
                <button type="button" onClick={() => applyCommand('underline')}><span style={{ textDecoration: 'underline' }}>U</span></button>
                <span className="compose-toolbar-divider" />
                <button type="button" onClick={() => applyCommand('insertOrderedList')}>1.</button>
                <button type="button" onClick={() => applyCommand('insertUnorderedList')}>•</button>
                <button type="button" onClick={() => applyCommand('formatBlock', 'blockquote')}>""</button>
                <span className="compose-toolbar-divider" />
                <button type="button" onClick={() => applyCommand('insertHorizontalRule')}>-</button>
                <button type="button" onClick={() => applyCommand('removeFormat')}>Tx</button>
              </div>
              <div
                ref={editorRef}
                className="portal-editor-body"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Please provide a detailed description and include screenshots where possible."
              />
            </div>
          </label>

          <div className="portal-grid">
            <label className="portal-field">
              <span>Impact *</span>
              <select value={impact} onChange={(e) => setImpact(e.target.value)}>
                <option value="">Select...</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
            <label className="portal-field">
              <span>Urgency *</span>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="">Select...</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
          </div>
          {result ? <div className="portal-form-result">{result}</div> : null}
          <div className="portal-submit-row">
            <button className="portal-submit-btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </section>

      {profileOpen && (
        <div className="portal-profile-overlay" onClick={() => setProfileOpen(false)}>
          <aside className="portal-profile-panel" onClick={(e) => e.stopPropagation()}>
            <button className="portal-profile-close" onClick={() => setProfileOpen(false)} aria-label="Close">x</button>
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
              <button onClick={() => { setProfileOpen(false); switchToAgentApp() }}>Switch to Agent Application</button>
              <button onClick={() => { logout(); navigate('/login') }}>Log out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
