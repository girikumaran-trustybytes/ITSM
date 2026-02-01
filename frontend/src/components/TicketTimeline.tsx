import React, { useState } from 'react'
import ActionModal from './ActionModal'
import '../styles-ticket.css'

const TimelineStep = ({ title, subtitle, active }: { title: string; subtitle?: string; active?: boolean }) => (
  <div className={`timeline-step ${active ? 'active' : ''}`}>
    <div className="step-content">
      <div className="step-title">{title}</div>
      {subtitle && <div className="step-sub">{subtitle}</div>}
    </div>
  </div>
)

export default function TicketTimeline() {
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'email' | 'log' | 'resolve'>('email')

  return null
}
