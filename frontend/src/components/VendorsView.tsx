import React, { useEffect, useState } from 'react'
import * as supplierService from '../services/supplier.service'
import { useAuth } from '../contexts/AuthContext'

type Supplier = {
  id: number
  companyName: string
  contactName?: string | null
  contactEmail?: string | null
  slaTerms?: string | null
}

export default function VendorsView() {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')

  const loadSuppliers = async () => {
    try {
      const data = await supplierService.listSuppliers({ q: search })
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch suppliers', e)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [search])

  return (
    <div className="admin-view">
      <div className="admin-header">
        <div>
          <h2>Suppliers</h2>
          <p>Vendor directory</p>
        </div>
        <div className="admin-actions">
          <input
            className="admin-search"
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {user?.role === 'ADMIN' && (
            <button className="admin-primary-btn" onClick={() => window.alert('Use Admin > Suppliers to add/edit.')}>+ New</button>
          )}
        </div>
      </div>

      <div className="admin-table">
        <div className="admin-row admin-head">
          <div className="admin-col name">Company</div>
          <div className="admin-col email">Contact</div>
          <div className="admin-col role">Email</div>
          <div className="admin-col actions">SLA</div>
        </div>
        {suppliers.map((s) => (
          <div key={s.id} className="admin-row">
            <div className="admin-col name">{s.companyName}</div>
            <div className="admin-col email">{s.contactName || '-'}</div>
            <div className="admin-col role">{s.contactEmail || '-'}</div>
            <div className="admin-col actions">{s.slaTerms || '-'}</div>
          </div>
        ))}
        {suppliers.length === 0 && <div className="admin-empty">No suppliers found.</div>}
      </div>
    </div>
  )
}
