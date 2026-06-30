import React from 'react'

type UseColumnResizeOptions = {
  initialWidths: number[]
  minWidth?: number
}

export function useColumnResize({ initialWidths, minWidth = 1 }: UseColumnResizeOptions) {
  const [widths, setWidths] = React.useState<number[]>(initialWidths)
  const [isResizing, setIsResizing] = React.useState(false)
  const dragRef = React.useRef<{ index: number; startX: number; startWidth: number } | null>(null)

  const startResize = React.useCallback((index: number, e: React.MouseEvent) => {
    if (index < 0 || index >= widths.length) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { index, startX: e.clientX, startWidth: widths[index] }
    setIsResizing(true)
    document.body.classList.add('is-column-resizing')
  }, [widths])

  React.useEffect(() => {
    if (!isResizing) return

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const delta = e.clientX - drag.startX
      const nextWidth = Math.max(minWidth, drag.startWidth + delta)
      setWidths((prev) => {
        if (prev[drag.index] === nextWidth) return prev
        const next = [...prev]
        next[drag.index] = nextWidth
        return next
      })
    }

    const onMouseUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setIsResizing(false)
      document.body.classList.remove('is-column-resizing')
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.classList.remove('is-column-resizing')
    }
  }, [isResizing, minWidth])

  const setColumnWidth = React.useCallback((index: number, width: number) => {
    setWidths((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const next = [...prev]
      next[index] = Math.max(minWidth, width)
      return next
    })
  }, [minWidth])

  return { widths, setWidths, startResize, setColumnWidth }
}
