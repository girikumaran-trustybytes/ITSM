import React, { useState } from 'react'

const feedOptions = [
  'All Activity',
  'Followed Activity',
  'User Activity',
  'Staff Activity',
  'My activity only',
  'Activity for my Tickets only',
  'Activity where I am the Account Manager',
  'My Mentions',
  'My Tickets viewed',
]

const feedItems = [
  { id: '#1030094', title: 'Internal Note', detail: 'ADL remote reboot done.', time: 'Just now', author: 'BN' },
  { id: '#1030094', title: 'Internal Note', detail: 'ADL values are fine.', time: '1 minute ago', author: 'BN' },
  { id: '#1030094', title: 'Asset Assigned', detail: 'Asset assigned by: Bhuvanesh', time: '7 minutes ago', author: 'BN' },
  { id: '#1030094', title: 'Assign Asset', detail: '', time: '7 minutes ago', author: 'BN' },
  { id: '#1030094', title: 'Mark As Responded', detail: 'Marked as responded to by: Bhuvanesh', time: '7 minutes ago', author: 'BN' },
  { id: '#1030094', title: 'First Response', detail: 'Fault [ADX#1030094] is currently being investigated.', time: '8 minutes ago', author: 'BN' },
]

export default function FeedPanel() {
  const [filter, setFilter] = useState(feedOptions[0])

  return (
    <div className="panel-feed">
      <div className="panel-feed-header">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {feedOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <button className="panel-icon-btn" aria-label="Open in new window">Open</button>
      </div>
      <div className="panel-list">
        {feedItems.map((item) => (
          <div key={`${item.id}-${item.time}`} className="panel-feed-card">
            <div className="panel-feed-avatar">{item.author}</div>
            <div className="panel-feed-body">
              <div className="panel-feed-title">
                <span className="panel-feed-id">{item.id}</span> - {item.title}
              </div>
              {item.detail && <div className="panel-feed-detail">{item.detail}</div>}
              <div className="panel-feed-time">{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
