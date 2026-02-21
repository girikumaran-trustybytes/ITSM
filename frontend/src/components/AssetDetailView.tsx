import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteAsset, getAsset } from '../services/asset.service'

export default function AssetDetailView() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const [asset, setAsset] = React.useState<any | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const numericId = Number(assetId)

  React.useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError('Invalid asset id')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getAsset(numericId)
        if (cancelled) return
        setAsset(data)
      } catch (err: any) {
        if (cancelled) return
        setError(err?.response?.data?.error || err?.message || 'Failed to load asset')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [numericId])

  const handleEdit = () => {
    if (!asset?.id) return
    navigate(`/assets?edit=${asset.id}`)
  }

  const handleDelete = async () => {
    if (!asset?.id) return
    if (!window.confirm(`Delete asset "${asset?.name || asset?.assetId || asset.id}"? This cannot be undone.`)) return
    try {
      setBusy(true)
      await deleteAsset(Number(asset.id))
      navigate('/assets')
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete asset')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="simple-detail-shell">
      <div className="simple-detail-header">
        <button className="simple-detail-back" onClick={() => navigate('/assets')}>Back</button>
        <div>
          <div className="simple-detail-title">Asset</div>
          <div className="simple-detail-subtitle">{asset?.assetId || assetId}</div>
        </div>
      </div>
      <div className="simple-detail-card">
        {loading ? <div className="simple-detail-value">Loading asset details...</div> : null}
        {error ? <div className="simple-detail-value" style={{ color: '#b42318' }}>{error}</div> : null}
        <div className="simple-detail-row">
          <div className="simple-detail-label">Asset ID</div>
          <div className="simple-detail-value">{asset?.assetId || assetId}</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Asset Name</div>
          <div className="simple-detail-value">{asset?.name || '-'}</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Status</div>
          <div className="simple-detail-value">{asset?.status || '-'}</div>
        </div>
        <div className="simple-detail-row">
          <div className="simple-detail-label">Assigned</div>
          <div className="simple-detail-value">
            {asset?.assignedTo ? (asset.assignedTo.name || asset.assignedTo.email) : (asset?.assignedToId ? `User #${asset.assignedToId}` : 'Unassigned')}
          </div>
        </div>
      </div>
      <div className="simple-detail-card">
        <div className="simple-detail-title" style={{ fontSize: 18, textAlign: 'center' }}>Actions</div>
        <div className="simple-detail-row" style={{ justifyContent: 'center', gap: 14 }}>
          <button className="assets-link-btn" onClick={handleEdit} disabled={busy || loading || !asset?.id}>Edit</button>
          <button className="assets-link-btn danger" onClick={handleDelete} disabled={busy || loading || !asset?.id}>Delete</button>
        </div>
      </div>
    </div>
  )
}
