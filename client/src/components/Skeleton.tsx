import React from 'react'

type PageSkeletonProps = {
  title?: string
  cardCount?: number
  rowCount?: number
}

type TableSkeletonProps = {
  rows?: number
}

export function TableSkeleton({ rows = 6 }: TableSkeletonProps) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-table-row">
          <span className="skeleton-block skeleton-sm" />
          <span className="skeleton-block" />
          <span className="skeleton-block skeleton-md" />
          <span className="skeleton-block skeleton-sm" />
          <span className="skeleton-block skeleton-md" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton({
  title = 'Loading',
  cardCount = 3,
  rowCount = 6,
}: PageSkeletonProps) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-label={`${title} loading`}>
      <div className="page-skeleton-header">
        <span className="skeleton-block skeleton-title" />
        <span className="skeleton-block skeleton-subtitle" />
      </div>
      <div className="page-skeleton-cards">
        {Array.from({ length: cardCount }, (_, index) => (
          <div key={index} className="page-skeleton-card">
            <span className="skeleton-block skeleton-md" />
            <span className="skeleton-block skeleton-lg" />
            <span className="skeleton-block skeleton-sm" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={rowCount} />
    </div>
  )
}

