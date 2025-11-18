// src/ManageInventory.jsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import { useNotifications } from './contexts/NotificationContext'
import { useProfile } from './contexts/ProfileContext'

import ChickenStocksAndStallStatus from './components/admin/ChickenStocksAndStallStatus'
import EditMenuPrices from './components/admin/EditMenuPrices'
import ExpensesOverview from './components/admin/ExpensesOverview'

export default function ManageInventory() {
  const navigate = useNavigate()
  const { showError } = useNotifications()
  const { profile, loading: profileLoading } = useProfile()

  useEffect(() => {
    if (!profileLoading && profile && profile.role !== 'admin') {
      showError('Access denied. Only admins can manage inventory.')
      navigate('/dashboard')
    }
  }, [profile, profileLoading, navigate, showError])

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="loading loading-spinner loading-lg text-primary"></div>
      </div>
    )
  }

  if (profile && profile.role !== 'admin') {
    return null
  }

  return (
    <Layout userProfile={profile}>
      <div className="container mx-auto p-6 space-y-6">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-primary mb-1">Manage Inventory</h1>
          <p className="text-base-content/70">
            Monitor chicken stocks, adjust menu prices, and review inventory expenses.
          </p>
        </div>
        <ChickenStocksAndStallStatus />
        <EditMenuPrices />
        <ExpensesOverview />
      </div>
    </Layout>
  )
}
