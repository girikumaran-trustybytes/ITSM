import React from 'react'

type Asset = {
  id: number
  assetId?: string
  assetType?: string
  model?: string | null
  status?: string
  assignedUserEmail?: string | null
  assignedTo?: { name?: string | null; email?: string | null } | null
}

export default function AssetTable({ assets }: { assets: Asset[] }) {
  return (
    <div className="asset-table">
      <div className="asset-table-header-row">
        <div>Asset ID</div>
        <div>Asset Type</div>
        <div>Model</div>
        <div>Status</div>
        <div>Assigned User</div>
      </div>
      {assets.map((asset) => {
        const assignedUser = String(asset.assignedTo?.name || asset.assignedTo?.email || asset.assignedUserEmail || '-').trim() || '-'
        return (
          <div key={asset.id} className="asset-table-row">
            <div className="asset-table-cell">{asset.assetId || `AST-${asset.id}`}</div>
            <div className="asset-table-cell">{asset.assetType || '-'}</div>
            <div className="asset-table-cell">{asset.model || '-'}</div>
            <div className="asset-table-cell">{asset.status || 'Active'}</div>
            <div className="asset-table-cell">{assignedUser}</div>
          </div>
        )
      })}
    </div>
  )
}
