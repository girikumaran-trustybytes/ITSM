import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import { useEffect, useMemo, useState } from 'react'
import { createTicket } from '../../services/ticket.service'
import { listMyAssets } from '../../services/asset.service'

type TicketForm = {
  openedFor: string
  requestedFor: string
  employeeId: string
  department: string
  location: string
  contactNumber: string
  assetType: string
  assetTag: string
  serialNumber: string
  makeModel: string
  operatingSystem: string
  assignedUser: string
  warrantyStatus: string
  damageTypePhysical: boolean
  damageTypeLiquid: boolean
  damageTypePower: boolean
  damageTypeFunctional: boolean
  detailedDescription: string
  damageSeverity: string
  poweringOn: string
  damageDateTime: string
  incidentLocation: string
  causeOfDamage: string
  workRelated: string
  repeatedDamage: string
  userImpact: string
  businessCriticality: string
  temporaryDeviceRequired: string
  justification: string
  previousTicketRef: string
  requestedAction: string
  replacementType: string
  estimatedCost: string
  managerApproval: string
  itAssetApproval: string
  financeApproval: string
  rootCause: string
  resolutionNotes: string
  replacedAssetTag: string
  closureCode: string
}

const initialForm: TicketForm = {
  openedFor: '',
  requestedFor: '',
  employeeId: '',
  department: '',
  location: '',
  contactNumber: '',
  assetType: '',
  assetTag: '',
  serialNumber: '',
  makeModel: '',
  operatingSystem: '',
  assignedUser: '',
  warrantyStatus: '',
  damageTypePhysical: false,
  damageTypeLiquid: false,
  damageTypePower: false,
  damageTypeFunctional: false,
  detailedDescription: '',
  damageSeverity: '',
  poweringOn: '',
  damageDateTime: '',
  incidentLocation: '',
  causeOfDamage: '',
  workRelated: '',
  repeatedDamage: '',
  userImpact: '',
  businessCriticality: '',
  temporaryDeviceRequired: '',
  justification: '',
  previousTicketRef: '',
  requestedAction: '',
  replacementType: '',
  estimatedCost: '',
  managerApproval: '',
  itAssetApproval: '',
  financeApproval: '',
  rootCause: '',
  resolutionNotes: '',
  replacedAssetTag: '',
  closureCode: '',
}

function joinSelected(values: Array<[boolean, string]>) {
  return values.filter(([enabled]) => enabled).map(([, label]) => label).join(', ') || '-'
}

function calculatePriority(userImpact: string, businessCriticality: string) {
  const impact = userImpact === 'Unable to work' ? 4 : userImpact === 'Limited functionality' ? 3 : 1
  const criticality = businessCriticality === 'Critical' ? 4 : businessCriticality === 'High' ? 3 : businessCriticality === 'Medium' ? 2 : 1
  const score = impact + criticality
  if (score >= 7) return 'Critical'
  if (score >= 6) return 'High'
  if (score >= 4) return 'Medium'
  return 'Low'
}

const NEW_TICKET_DRAFT_KEY = 'portal_new_ticket_draft_v1'

export default function PortalNewTicket() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)

  const [profileOpen, setProfileOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState('')
  const [form, setForm] = useState<TicketForm>(initialForm)
  const [attachments, setAttachments] = useState<File[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const priority = useMemo(() => calculatePriority(form.userImpact, form.businessCriticality), [form.userImpact, form.businessCriticality])
  const justificationRequired = priority === 'Critical' || form.requestedAction === 'Replacement'

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      openedFor: prev.openedFor || String(user?.name || ''),
      requestedFor: prev.requestedFor || String(user?.name || ''),
      assignedUser: prev.assignedUser || String(user?.name || ''),
    }))
  }, [user?.name])

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NEW_TICKET_DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<TicketForm>
      setForm((prev) => ({ ...prev, ...parsed }))
    } catch {
      // Ignore invalid draft payload
    }
  }, [])

  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/')
  }

  const summary = useMemo(() => {
    const core = (form.assetTag || form.assetType || 'Asset Damage').trim()
    return `${core} - ${form.makeModel || 'Damage Reported'}`
  }, [form.assetTag, form.assetType, form.makeModel])

  const compiledDescription = useMemo(() => {
    return [
      'Asset Information',
      `Asset Type: ${form.assetType || '-'}`,
      `Asset Tag Number: ${form.assetTag || '-'}`,
      `Serial Number: ${form.serialNumber || '-'}`,
      `Make & Model: ${form.makeModel || '-'}`,
      `Operating System: ${form.operatingSystem || '-'}`,
      `Assigned User: ${form.assignedUser || user?.name || '-'}`,
      `Warranty Status: ${form.warrantyStatus || '-'}`,
      '',
      'Damage Description',
      `Type of Damage: ${joinSelected([
        [form.damageTypePhysical, 'Physical'],
        [form.damageTypeLiquid, 'Liquid Spill'],
        [form.damageTypePower, 'Power/Charging Issue'],
        [form.damageTypeFunctional, 'Functional Failure'],
      ])}`,
      `Detailed Description: ${form.detailedDescription || '-'}`,
      `Damage Severity: ${form.damageSeverity || '-'}`,
      `Is the device powering on: ${form.poweringOn || '-'}`,
      '',
      'Incident Details',
      `Date & Time of Damage: ${form.damageDateTime || '-'}`,
      `Location of Incident: ${form.incidentLocation || '-'}`,
      `Cause of Damage: ${form.causeOfDamage || '-'}`,
      `Work-related incident: ${form.workRelated || '-'}`,
      `Repeated Damage: ${form.repeatedDamage || '-'}`,
      '',
      'Impact Assessment',
      `User Impact: ${form.userImpact || '-'}`,
      `Business Criticality: ${form.businessCriticality || '-'}`,
      `Temporary device required: ${form.temporaryDeviceRequired || '-'}`,
      `Justification: ${form.justification || '-'}`,
      '',
      'Attachments',
      `Files: ${attachments.map((f) => f.name).join(', ') || '-'}`,
      `Previous ticket reference: ${form.previousTicketRef || '-'}`,
      '',
      'Action Requested',
      `${form.requestedAction || '-'}`,
      `Replacement Type: ${form.replacementType || '-'}`,
      `Estimated Cost: ${form.estimatedCost || '-'}`,
      '',
      'Approvals',
      `Reporting Manager Approval: ${form.managerApproval || '-'}`,
      `IT Asset Team Approval: ${form.itAssetApproval || '-'}`,
      `Finance Approval: ${form.financeApproval || '-'}`,
      '',
      'Resolution (IT Use Only)',
      `Root Cause: ${form.rootCause || '-'}`,
      `Resolution Notes: ${form.resolutionNotes || '-'}`,
      `Replaced Asset Tag: ${form.replacedAssetTag || '-'}`,
      `Closure Code: ${form.closureCode || '-'}`,
    ].join('\n')
  }, [attachments, form, user?.name])

  const setField = <K extends keyof TicketForm>(key: K, value: TicketForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const selectAsset = (tag: string) => {
    const asset = assets.find((a) => String(a.assetId || a.assetTag || a.id) === tag)
    if (!asset) {
      setField('assetTag', tag)
      return
    }
    const warrantyStatus = asset.warrantyUntil
      ? (new Date(asset.warrantyUntil).getTime() >= Date.now() ? 'In Warranty' : 'Out of Warranty')
      : 'Unknown'
    setForm((prev) => ({
      ...prev,
      assetTag: tag,
      assetType: prev.assetType || String(asset.assetType || asset.category || ''),
      serialNumber: String(asset.serial || ''),
      makeModel: String(asset.model || asset.name || ''),
      operatingSystem: [asset.os, asset.osVersion].filter(Boolean).join(' ') || '',
      assignedUser: String(asset.assignedTo?.name || asset.assignedUserEmail || prev.assignedUser || user?.name || ''),
      location: String(asset.location || asset.site || prev.location || ''),
      warrantyStatus,
    }))
  }

  const onSubmit = async () => {
    if (!form.assetType || !form.assetTag || !form.detailedDescription || !form.damageSeverity || !form.poweringOn) {
      setResult('Please fill mandatory asset and damage fields.')
      return
    }
    if (!form.damageDateTime || !form.causeOfDamage || !form.workRelated || !form.userImpact || !form.businessCriticality || !form.requestedAction) {
      setResult('Please fill mandatory incident, impact, and action fields.')
      return
    }
    if (justificationRequired && !form.justification.trim()) {
      setResult('Justification is required for critical priority or replacement action.')
      return
    }
    if (!attachments.length) {
      setResult('At least one attachment is required.')
      return
    }
    if (form.damageSeverity === 'High' && !attachments.length) {
      setResult('Attachment is required for high damage severity.')
      return
    }
    try {
      setSubmitting(true)
      setResult('')
      await createTicket({
        subject: summary,
        summary,
        description: compiledDescription,
        type: 'Asset Damage',
        category: 'IT Asset',
        subcategory: 'Asset Damage',
        status: 'New',
        createdFrom: 'User portal',
        requesterId: user?.id,
        requesterEmail: user?.email,
        priority,
      })
      setResult('IT Asset Damage ticket created successfully.')
      navigate('/portal/tickets')
    } catch (e: any) {
      setResult(e?.response?.data?.error || 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const onSaveDraft = () => {
    try {
      localStorage.setItem(NEW_TICKET_DRAFT_KEY, JSON.stringify(form))
      setResult('Draft saved locally.')
    } catch {
      setResult('Unable to save draft in browser storage.')
    }
  }

  const onCancel = () => {
    localStorage.removeItem(NEW_TICKET_DRAFT_KEY)
    setForm({ ...initialForm, openedFor: String(user?.name || ''), requestedFor: String(user?.name || ''), assignedUser: String(user?.name || '') })
    setAttachments([])
    setResult('')
  }

  return (
    <div className="portal-root portal-new-ticket">
      <header className="portal-topbar portal-home-topbar portal-unified-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/new-ticket')}>New Ticket</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>My Tickets</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/assets')}>My Devices</button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen(true)}>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      <section className="portal-page portal-damage-page">
        <div className="portal-damage-card">
          <div className="portal-sn-section">
            <div className="portal-sn-title">Asset Information</div>
            <div className="portal-sn-body portal-damage-grid three">
              <label>Asset Type *
                <select value={form.assetType} onChange={(e) => setField('assetType', e.target.value)}>
                  <option value="">Select</option>
                  <option>Laptop</option>
                  <option>Desktop</option>
                  <option>Monitor</option>
                  <option>Mobile</option>
                  <option>Peripheral</option>
                </select>
              </label>
              <label>Asset Tag *
                <select value={form.assetTag} onChange={(e) => selectAsset(e.target.value)}>
                  <option value="">Select assigned asset</option>
                  {assets.map((asset: any) => {
                    const tag = String(asset.assetId || asset.assetTag || asset.id)
                    return <option key={tag} value={tag}>{tag}</option>
                  })}
                </select>
              </label>
              <label>Serial Number<input value={form.serialNumber} readOnly /></label>
              <label>Make &amp; Model<input value={form.makeModel} readOnly /></label>
              <label>Operating System<input value={form.operatingSystem} readOnly /></label>
              <label>Assigned To<input value={form.assignedUser} readOnly /></label>
              <label>Warranty Status<input value={form.warrantyStatus} readOnly /></label>
            </div>
          </div>

          <div className="portal-sn-section">
            <div className="portal-sn-title">Damage Details</div>
            <div className="portal-sn-body">
              <div className="portal-damage-checks">
                <label><input type="checkbox" checked={form.damageTypePhysical} onChange={(e) => setField('damageTypePhysical', e.target.checked)} /> Physical</label>
                <label><input type="checkbox" checked={form.damageTypeLiquid} onChange={(e) => setField('damageTypeLiquid', e.target.checked)} /> Liquid Spill</label>
                <label><input type="checkbox" checked={form.damageTypePower} onChange={(e) => setField('damageTypePower', e.target.checked)} /> Power / Charging Issue</label>
                <label><input type="checkbox" checked={form.damageTypeFunctional} onChange={(e) => setField('damageTypeFunctional', e.target.checked)} /> Functional Failure</label>
              </div>
              <div className="portal-damage-grid two">
                <label>Detailed Description *<textarea value={form.detailedDescription} onChange={(e) => setField('detailedDescription', e.target.value)} /></label>
                <label>Damage Severity *
                  <select value={form.damageSeverity} onChange={(e) => setField('damageSeverity', e.target.value)}>
                    <option value="">Select</option>
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>
                <label>Device Powering On? *
                  <select value={form.poweringOn} onChange={(e) => setField('poweringOn', e.target.value)}>
                    <option value="">Select</option>
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="portal-sn-section">
            <div className="portal-sn-title">Incident Information</div>
            <div className="portal-sn-body portal-damage-grid three">
              <label>Incident Date &amp; Time *<input type="datetime-local" value={form.damageDateTime} onChange={(e) => setField('damageDateTime', e.target.value)} /></label>
              <label>Incident Location<input value={form.incidentLocation} onChange={(e) => setField('incidentLocation', e.target.value)} /></label>
              <label>Cause of Damage *
                <select value={form.causeOfDamage} onChange={(e) => setField('causeOfDamage', e.target.value)}>
                  <option value="">Select</option>
                  <option>Accidental drop</option>
                  <option>Liquid spill</option>
                  <option>Power surge</option>
                  <option>Wear & tear</option>
                  <option>Mishandling</option>
                </select>
              </label>
              <label>Work-related Incident *
                <select value={form.workRelated} onChange={(e) => setField('workRelated', e.target.value)}>
                  <option value="">Select</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
              <label>Repeated Damage?
                <select value={form.repeatedDamage} onChange={(e) => setField('repeatedDamage', e.target.value)}>
                  <option value="">Select</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
            </div>
          </div>

          <div className="portal-sn-section">
            <div className="portal-sn-title">Business Impact &amp; Urgency</div>
            <div className="portal-sn-body portal-damage-grid three">
              <label>User Impact *
                <select value={form.userImpact} onChange={(e) => setField('userImpact', e.target.value)}>
                  <option value="">Select</option>
                  <option>Unable to work</option>
                  <option>Limited functionality</option>
                  <option>No immediate impact</option>
                </select>
              </label>
              <label>Business Criticality *
                <select value={form.businessCriticality} onChange={(e) => setField('businessCriticality', e.target.value)}>
                  <option value="">Select</option>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </label>
              <label>Temporary Device Required
                <select value={form.temporaryDeviceRequired} onChange={(e) => setField('temporaryDeviceRequired', e.target.value)}>
                  <option value="">Select</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
            </div>
          </div>

          <div className="portal-sn-section">
            <div className="portal-sn-title">Attachments</div>
            <div className="portal-sn-body portal-damage-grid one">
              <label>Upload Photos / Incident Report *
                <input
                  type="file"
                  multiple
                  onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                />
              </label>
              {attachments.length > 0 ? (
                <div className="portal-sn-attachments-list">
                  {attachments.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="portal-sn-attachment-row">
                      <span>{file.name}</span>
                      <button type="button" onClick={() => window.open(URL.createObjectURL(file), '_blank')}>View</button>
                    </div>
                  ))}
                </div>
              ) : null}
              <label>Previous Ticket Reference<input value={form.previousTicketRef} onChange={(e) => setField('previousTicketRef', e.target.value)} /></label>
            </div>
          </div>

          <div className="portal-sn-section">
            <div className="portal-sn-title">Action Requested</div>
            <div className="portal-sn-body portal-damage-grid two">
              <label>Requested Action *
                <select value={form.requestedAction} onChange={(e) => setField('requestedAction', e.target.value)}>
                  <option value="">Select</option>
                  <option>Repair</option>
                  <option>Replacement</option>
                  <option>Inspect</option>
                  <option>Warranty</option>
                </select>
              </label>
              {form.requestedAction === 'Replacement' && (
                <label>Replacement Type *
                  <select value={form.replacementType} onChange={(e) => setField('replacementType', e.target.value)}>
                    <option value="">Select</option>
                    <option>Like-for-like</option>
                    <option>Upgrade</option>
                    <option>Temporary</option>
                  </select>
                </label>
              )}
              <label>Justification {justificationRequired ? '*' : ''}
                <input value={form.justification} onChange={(e) => setField('justification', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="portal-damage-actions">
            <button className="portal-submit-btn" onClick={onSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            <button className="portal-secondary-btn" onClick={onSaveDraft}>Save</button>
            <button className="portal-secondary-btn" onClick={onCancel}>Cancel</button>
          </div>
          {result ? <div className="portal-form-result">{result}</div> : null}
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
