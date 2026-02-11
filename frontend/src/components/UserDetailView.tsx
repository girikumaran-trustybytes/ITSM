import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function UserDetailView() {
  const { userId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="simple-detail-shell">
      <div className="simple-detail-header">
        <button className="simple-detail-back" onClick={() => navigate('/users')}>Back</button>
        <div>
          <div className="simple-detail-title">User</div>
          <div className="simple-detail-subtitle">{userId}</div>
        </div>
      </div>
      <div className="simple-detail-card">
        <div className="simple-detail-row">
          <div className="simple-detail-label">User ID</div>
          <div className="simple-detail-value">{userId}</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Role</div>
          <div className="simple-detail-value">User</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Status</div>
          <div className="simple-detail-value">Active</div>
        </div>
      </div>
    </div>
  )
}
