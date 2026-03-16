import React from 'react'
import { Link } from 'react-router-dom'

export default function KnowledgeBaseView() {
  return (
    <div className="kb-view">
      <div className="kb-header">
        <h2>Knowledge Base</h2>
        <div className="kb-actions">
          <button className="kb-button">+ Add</button>
        </div>
      </div>
      <div className="kb-search">
        <input placeholder="What are you looking for?" />
        <button className="kb-search-btn" aria-label="Search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </button>
      </div>
      <div className="kb-grid">
        <div className="kb-card">
          <h3>All FAQ Lists</h3>
          <span>0 articles</span>
        </div>
        <div className="kb-card">
          <h3>Archive</h3>
          <span>0 articles</span>
        </div>
        <div className="kb-card">
          <h3>Asset Management</h3>
          <span>0 articles</span>
        </div>
        <Link className="kb-card kb-card-link" to="/knowledge-base/user-manual">
          <h3>User Manual</h3>
          <span>1 article</span>
        </Link>
      </div>
      <div className="kb-empty">No articles yet.</div>
    </div>
  )
}
