import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function AssetDetailView() {
  const { assetId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="simple-detail-shell">
      <div className="simple-detail-header">
        <button className="simple-detail-back" onClick={() => navigate('/assets')}>Back</button>
        <div>
          <div className="simple-detail-title">Asset</div>
          <div className="simple-detail-subtitle">{assetId}</div>
        </div>
      </div>
      <div className="simple-detail-card">
        <div className="simple-detail-row">
          <div className="simple-detail-label">Asset ID</div>
          <div className="simple-detail-value">{assetId}</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Status</div>
          <div className="simple-detail-value">Active</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Assigned</div>
          <div className="simple-detail-value">Unassigned</div>
        </div>
      </div>
    </div>
  )
}
