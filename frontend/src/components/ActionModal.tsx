import React, { useState } from 'react'
import '../styles-ticket.css'

type Props = {
  mode: 'email' | 'log' | 'resolve'
  onClose: () => void
}

export default function ActionModal({ mode, onClose }: Props) {
  const title = mode === 'email' ? 'Email User' : mode === 'log' ? 'Log to Supplier' : 'Resolved'
  const [to, setTo] = useState('girikumaran@trustybytes.in')
  const [message, setMessage] = useState(mode === 'resolve' ? 'Resolved.' : 'Hi Team,\n\nCould you please have a look?\n\nThank you.')

  const handleSend = () => {
    // dispatch a custom event so TicketsView can react to the action
    const ev = new CustomEvent('ticket-action', { detail: { action: mode, to, message } })
    window.dispatchEvent(ev)
    onClose()
  }

  return (
    <div className="modal-overlay demo-modal" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>To</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="field">
            <label>Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn btn-send" onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  )
}
