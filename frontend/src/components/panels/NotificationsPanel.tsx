import React from 'react'

const notifications = [
  { time: '5 minutes ago', title: 'New request logged for BT plc.', id: 'ID:1030097' },
  { time: '11 minutes ago', title: 'New request logged for Unknown.', id: 'ID:1030095' },
  { time: '13 minutes ago', title: 'New request logged for Unknown.', id: 'ID:1030093' },
  { time: '46 minutes ago', title: 'New request logged for Unknown.', id: 'ID:1030085' },
  { time: '53 minutes ago', title: 'New request logged for Unknown.', id: 'ID:1030081' },
  { time: '1 hour ago', title: 'New request logged for Unknown.', id: 'ID:1030077' },
  { time: '1 hour ago', title: 'New request logged for Unknown.', id: 'ID:1030070' },
  { time: '1 hour ago', title: 'New request logged for Peel Advertising.', id: 'ID:1030063' },
]

export default function NotificationsPanel() {
  return (
    <div className="panel-notifications">
      <div className="panel-actions">
        <button className="panel-icon-btn" aria-label="Mark all read">Mail</button>
        <button className="panel-icon-btn" aria-label="Clear">Clear</button>
      </div>
      <div className="panel-list">
        {notifications.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="panel-card">
            <div className="panel-card-time">{item.time}</div>
            <div className="panel-card-title">{item.title}</div>
            <div className="panel-card-sub">{item.id}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
