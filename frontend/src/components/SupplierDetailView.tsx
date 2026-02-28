import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function SupplierDetailView() {
  const { supplierId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="simple-detail-shell">
      <div className="simple-detail-header">
        <button className="simple-detail-back" onClick={() => navigate('/suppliers')}>Back</button>
        <div>
          <div className="simple-detail-title">Supplier</div>
          <div className="simple-detail-subtitle">{supplierId}</div>
        </div>
      </div>
      <div className="simple-detail-card">
        <div className="simple-detail-row">
          <div className="simple-detail-label">Supplier ID</div>
          <div className="simple-detail-value">{supplierId}</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">SLA</div>
          <div className="simple-detail-value">Gold Support</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Status</div>
          <div className="simple-detail-value">Active</div>
        </div>
      </div>
    </div>
  )
}
