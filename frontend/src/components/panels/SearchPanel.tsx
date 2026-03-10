import React, { useEffect, useMemo, useState } from 'react'
import { listTickets } from '../../services/ticket.service'
import { listAssets } from '../../services/asset.service'
import { listUsers } from '../../services/user.service'
import { listSuppliers } from '../../services/supplier.service'

type SearchItem = {
  type: 'Tickets' | 'Assets' | 'Users' | 'Suppliers'
  title: string
  subtitle: string
}

const LIMIT_PER_GROUP = 5

function toItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export default function SearchPanel({ query }: { query: string }) {
  const [results, setResults] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const settled = await Promise.allSettled([
        listTickets({ q, pageSize: LIMIT_PER_GROUP }),
        listAssets({ q, pageSize: LIMIT_PER_GROUP }),
        listUsers({ q, limit: LIMIT_PER_GROUP }),
        listSuppliers({ q }),
      ])

      if (cancelled) return

      const ticketRows = settled[0].status === 'fulfilled' ? toItems(settled[0].value) : []
      const assetRows = settled[1].status === 'fulfilled' ? toItems(settled[1].value) : []
      const userRows = settled[2].status === 'fulfilled' ? toItems(settled[2].value) : []
      const supplierRows = settled[3].status === 'fulfilled' ? toItems(settled[3].value) : []

      const ticketItems: SearchItem[] = ticketRows.slice(0, LIMIT_PER_GROUP).map((row: any) => {
        const ticketId = String(row?.ticketId || row?.id || 'Ticket').trim()
        const subject = String(row?.subject || row?.summary || row?.description || '').trim()
        const status = String(row?.status || '').trim()
        return {
          type: 'Tickets',
          title: subject ? `${ticketId} - ${subject}` : ticketId,
          subtitle: status || 'Ticket',
        }
      })

      const assetItems: SearchItem[] = assetRows.slice(0, LIMIT_PER_GROUP).map((row: any) => {
        const assetId = String(row?.assetId || '').trim()
        const name = String(row?.name || row?.model || '').trim()
        const assignedName =
          String(row?.assignedTo?.name || row?.assignedToName || row?.assignedUserName || '').trim() ||
          String(row?.assignedTo?.email || row?.assignedUserEmail || '').trim()
        return {
          type: 'Assets',
          title: name || assetId || `Asset #${row?.id ?? '-'}`,
          subtitle: assignedName ? `Assigned to ${assignedName}` : (assetId || 'Asset'),
        }
      })

      const userItems: SearchItem[] = userRows.slice(0, LIMIT_PER_GROUP).map((row: any) => {
        const name = String(row?.name || row?.username || '').trim()
        const email = String(row?.email || '').trim()
        return {
          type: 'Users',
          title: name || email || `User #${row?.id ?? '-'}`,
          subtitle: email || String(row?.role || 'User'),
        }
      })

      const supplierItems: SearchItem[] = supplierRows.slice(0, LIMIT_PER_GROUP).map((row: any) => {
        const companyName = String(row?.companyName || '').trim()
        const contact = String(row?.contactPerson || row?.contactName || row?.contactEmail || '').trim()
        return {
          type: 'Suppliers',
          title: companyName || `Supplier #${row?.id ?? '-'}`,
          subtitle: contact || String(row?.slaTerms || 'Supplier'),
        }
      })

      setResults([...ticketItems, ...assetItems, ...userItems, ...supplierItems])
      setLoading(false)
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
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

  if (loading && results.length === 0) {
    return <div className="panel-empty">Searching...</div>
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
