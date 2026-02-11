import React, { useMemo } from 'react'

type SearchItem = {
  type: 'Tickets' | 'Assets' | 'Users' | 'Suppliers'
  title: string
  subtitle: string
}

const sampleItems: SearchItem[] = [
  { type: 'Tickets', title: '#1030094 - Internal Note', subtitle: 'ADL remote reboot done.' },
  { type: 'Tickets', title: '#1030093 - New request logged', subtitle: 'Beacon Portrait, London.' },
  { type: 'Assets', title: 'Beacon Portrait Eastbound', subtitle: 'Unit ID: 3759' },
  { type: 'Assets', title: 'Dell Latitude 7440', subtitle: 'Assigned to Girikumar' },
  { type: 'Users', title: 'Girikumaran', subtitle: 'giri.kumaran@astragroup.co.uk' },
  { type: 'Suppliers', title: 'BT Plc', subtitle: 'SLA: Gold support' },
]

export default function SearchPanel({ query }: { query: string }) {
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return sampleItems.filter((item) => {
      const hay = `${item.type} ${item.title} ${item.subtitle}`.toLowerCase()
      return hay.includes(q)
    })
  }, [query])

  const grouped = useMemo(() => {
    return results.reduce((acc, item) => {
      acc[item.type] = acc[item.type] || []
      acc[item.type].push(item)
      return acc
    }, {} as Record<string, SearchItem[]>)
  }, [results])

  if (!query.trim()) {
    return <div className="panel-muted">Start typing to search tickets, assets, users, and suppliers.</div>
  }

  if (results.length === 0) {
    return <div className="panel-empty">No results found</div>
  }

  return (
    <div className="panel-search-results">
      <div className="panel-search-meta">
        <span>{results.length} results</span>
        <span>Showing best matches</span>
      </div>
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="panel-search-group">
          <div className="panel-search-group-title">{group}</div>
          <div className="panel-search-group-list">
            {items.map((item) => (
              <div key={`${group}-${item.title}`} className="panel-search-item">
                <div className="panel-search-item-title">{item.title}</div>
                <div className="panel-search-item-sub">{item.subtitle}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
