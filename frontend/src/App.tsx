import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import PrimarySidebar from './components/PrimarySidebar'
import SecondarySidebar from './components/SecondarySidebar'
import AssetTable from './components/AssetTable'
import TicketsView from './components/TicketsView'
import TicketTimeline from './components/TicketTimeline'
import Login from './app/Login'
import ProtectedRoute from './app/ProtectedRoute'
import Unauthorized from './app/Unauthorized'

export type Asset = {
  id: string
  type: string
  tag: string
  site: string
  status: string
  keyField: string
  keyField2: string
  businessOwner?: string
}

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [activeNav, setActiveNav] = useState('assets')
  const navigate = useNavigate()

  useEffect(() => {
    // Assets tab is now empty - no API fetch
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="app-root">
              <PrimarySidebar activeNav={activeNav} setActiveNav={setActiveNav} />
              <main className="main-area">
                {activeNav === 'tickets' && (
                  <>
                    <TicketsView />
                    <div style={{ marginTop: 24 }}>
                      <TicketTimeline />
                    </div>
                  </>
                )}
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
