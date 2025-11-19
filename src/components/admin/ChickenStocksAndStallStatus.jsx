// src/components/admin/ChickenStocksAndStallStatus.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { fetchTodayStockStatus, saveTodayStockStatus } from '../../utils/staffReportsToday'
import { logActivity, auditActions, auditEntities } from '../../utils/auditLog'
import { useProfile } from '../../contexts/ProfileContext'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'under maintenance', label: 'Under Maintenance' }
]

// Map for badge colors
const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'active':
      return 'badge-success'
    case 'inactive':
      return 'badge-error'
    case 'under maintenance':
      return 'badge-warning'
    default:
      return 'badge-neutral'
  }
}

export default function ChickenStocksAndStallStatus() {
  const { profile: userProfile } = useProfile()
  const [stalls, setStalls] = useState([])
  const [stocks, setStocks] = useState({}) // { stallId: { stockUid, quantity } }
  const [stockInputs, setStockInputs] = useState({}) // { stallId: inputValue }
  const [locationInputs, setLocationInputs] = useState({}) // { stallId: inputValue }
  const [statusLoadingId, setStatusLoadingId] = useState(null)
  const [stockLoadingId, setStockLoadingId] = useState(null)
  const [locationLoadingId, setLocationLoadingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')


  // Load stalls
  useEffect(() => {
    let isMounted = true
    async function loadStalls() {
      setError('')
      try {
        const { data, error } = await supabase
          .from('stalls')
          .select('stall_id, stall_name, location, status')
          .order('stall_name', { ascending: true })
        if (error) throw error
        if (isMounted) {
          setStalls(data || [])
          // Initialize stock inputs with current values
          const initialInputs = {}
          const initialLocationInputs = {}
          data?.forEach((stall) => {
            initialInputs[stall.stall_id] = ''
            initialLocationInputs[stall.stall_id] = stall.location || ''
          })
          setStockInputs(initialInputs)
          setLocationInputs(initialLocationInputs)
        }
      } catch (e) {
        if (isMounted) setError(e?.message || 'Failed to load stalls')
      }
    }
    loadStalls()
    return () => { isMounted = false }
  }, [])

  // Load stocks for all stalls
  useEffect(() => {
    if (stalls.length === 0) return
    let isMounted = true
    async function loadStocks() {
      setError('')
      try {
        const stallIds = stalls.map((s) => s.stall_id)
        const { data, error } = await supabase
          .from('stall_stocks')
          .select('stallstock_id, stall_id, quantity')
          .in('stall_id', stallIds)
        if (error) throw error

        const stocksMap = {}
        const inputsMap = {}
        stalls.forEach((stall) => {
          const stock = data?.find((s) => s.stall_id === stall.stall_id)
          if (stock) {
            stocksMap[stall.stall_id] = {
              stockUid: stock.stallstock_id,
              quantity: stock.quantity || 0
            }
            inputsMap[stall.stall_id] = stock.quantity || 0
          } else {
            stocksMap[stall.stall_id] = {
              stockUid: null,
              quantity: 0
            }
            inputsMap[stall.stall_id] = 0
          }
        })
        if (isMounted) {
          setStocks(stocksMap)
          setStockInputs(inputsMap)
        }
      } catch (e) {
        if (isMounted) setError(e?.message || 'Failed to load stocks')
      }
    }
    loadStocks()
    return () => { isMounted = false }
  }, [stalls])

  async function handleStatusChange(stallId, newStatus) {
    setError('')
    setSuccess('')
    setStatusLoadingId(stallId)

    const prevStatus = stalls.find((s) => s.stall_id === stallId)?.status
    setStalls((prev) => prev.map((s) =>
      s.stall_id === stallId ? { ...s, status: newStatus } : s
    ))

    try {
      const { error } = await supabase
        .from('stalls')
        .update({ status: newStatus })
        .eq('stall_id', stallId)
      if (error) throw error

      // Best-effort logging of status change into stall_status_history
      try {
        const { error: historyError } = await supabase
          .from('stall_status_history')
          .insert({
            stall_id: stallId,
            status: newStatus,
            change_source: 'admin_inventory',
          })

        if (historyError) {
          // Log but do not surface to user; main update already succeeded
          console.error('Error logging stall status history:', historyError)
        }
      } catch (historyErr) {
        console.error('Unexpected error logging stall status history:', historyErr)
      }

      setSuccess('Stall status updated successfully.')
      
      // Log audit activity
      if (userProfile) {
        const stall = stalls.find(s => s.stall_id === stallId)
        await logActivity({
          action: auditActions.UPDATE_STATUS,
          entity: auditEntities.STALL,
          entityId: stallId,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated stall status: ${stall?.stall_name || stallId} from ${prevStatus} to ${newStatus}`,
          oldValue: { status: prevStatus },
          newValue: { status: newStatus },
          stallId
        })
      }
    } catch (e) {
      setStalls((prev) => prev.map((s) =>
        s.stall_id === stallId ? { ...s, status: prevStatus } : s
      ))
      setError(e?.message || 'Failed to update stall status.')
    } finally {
      setStatusLoadingId(null)
    }
  }

  async function handleStockChange(stallId, newQuantity) {
    setError('')
    setSuccess('')
    setStockLoadingId(stallId)

    const numericQuantity = Number(newQuantity)
    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      setError('Stock level must be a non-negative number.')
      setStockLoadingId(null)
      return
    }

    const prevQuantity = stocks[stallId]?.quantity || 0
    const prevStockUid = stocks[stallId]?.stockUid

    // Optimistically update UI
    setStocks((prev) => ({
      ...prev,
      [stallId]: {
        stockUid: prevStockUid,
        quantity: numericQuantity
      }
    }))

    try {
      if (prevStockUid) {
        const { error } = await supabase
          .from('stall_stocks')
          .update({ quantity: numericQuantity })
          .eq('stallstock_id', prevStockUid)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('stall_stocks')
          .insert([{ stall_id: stallId, quantity: numericQuantity }])
          .select('stallstock_id, quantity')
          .single()
        if (error) throw error
        setStocks((prev) => ({
          ...prev,
          [stallId]: {
            stockUid: data.stallstock_id,
            quantity: numericQuantity
          }
        }))
      }

      // Record today's stock level in stock_status_history without overwriting
      // any existing sold-out status set from the staff dashboard.
      const existingStatus = await fetchTodayStockStatus(stallId)
      await saveTodayStockStatus(
        stallId,
        numericQuantity,
        existingStatus?.stockStatus || 'not_sold_out'
      )

      setSuccess('Stock level updated successfully.')
      
      // Log audit activity
      if (userProfile) {
        const stall = stalls.find(s => s.stall_id === stallId)
        await logActivity({
          action: auditActions.UPDATE_STOCK,
          entity: auditEntities.STOCK,
          entityId: stallId,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated stock level for ${stall?.stall_name || stallId}: ${prevQuantity} kg → ${numericQuantity} kg`,
          oldValue: { quantity: prevQuantity },
          newValue: { quantity: numericQuantity },
          stallId
        })
      }
    } catch (e) {
      // Revert on error
      setStocks((prev) => ({
        ...prev,
        [stallId]: {
          stockUid: prevStockUid,
          quantity: prevQuantity
        }
      }))
      setStockInputs((prev) => ({
        ...prev,
        [stallId]: prevQuantity
      }))
      setError(e?.message || 'Failed to update stock level.')
    } finally {
      setStockLoadingId(null)
    }
  }

  function handleStockInputChange(stallId, value) {
    setStockInputs((prev) => ({
      ...prev,
      [stallId]: value
    }))
  }

  function handleStockInputBlur(stallId) {
    const inputValue = stockInputs[stallId]
    const numericValue = Number(inputValue)
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      handleStockChange(stallId, numericValue)
    } else {
      // Reset to current stock if invalid
      const currentStock = stocks[stallId]?.quantity || 0
      setStockInputs((prev) => ({
        ...prev,
        [stallId]: currentStock
      }))
    }
  }

  async function handleLocationChange(stallId, newLocation) {
    setError('')
    setSuccess('')
    setLocationLoadingId(stallId)

    const trimmedLocation = String(newLocation || '').trim()
    const prevLocation = stalls.find((s) => s.stall_id === stallId)?.location

    // Optimistically update UI
    setStalls((prev) => prev.map((s) =>
      s.stall_id === stallId ? { ...s, location: trimmedLocation } : s
    ))

    try {
      const { error } = await supabase
        .from('stalls')
        .update({ location: trimmedLocation || null })
        .eq('stall_id', stallId)
      if (error) throw error

      setSuccess('Stall location updated successfully.')
      
      // Log audit activity
      if (userProfile) {
        const stall = stalls.find(s => s.stall_id === stallId)
        await logActivity({
          action: auditActions.UPDATE_LOCATION,
          entity: auditEntities.STALL,
          entityId: stallId,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated location for ${stall?.stall_name || stallId}: ${prevLocation || 'N/A'} → ${trimmedLocation || 'N/A'}`,
          oldValue: { location: prevLocation },
          newValue: { location: trimmedLocation },
          stallId
        })
      }
    } catch (e) {
      // Revert on error
      setStalls((prev) => prev.map((s) =>
        s.stall_id === stallId ? { ...s, location: prevLocation } : s
      ))
      setLocationInputs((prev) => ({
        ...prev,
        [stallId]: prevLocation || ''
      }))
      setError(e?.message || 'Failed to update stall location.')
    } finally {
      setLocationLoadingId(null)
    }
  }

  function handleLocationInputChange(stallId, value) {
    setLocationInputs((prev) => ({
      ...prev,
      [stallId]: value
    }))
  }

  function handleLocationInputBlur(stallId) {
    const inputValue = locationInputs[stallId] || ''
    handleLocationChange(stallId, inputValue)
  }

  return (
    <div className="card bg-base-100 shadow-xl mb-6">
      <div className="card-body p-4 md:p-6">
        <h2 className="card-title text-error mb-4 text-lg md:text-xl">Chicken Stocks and Stall Status</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stalls.length === 0 ? (
            <div className="text-base-content/50 col-span-3 text-center py-4">
              No stalls available.
            </div>
          ) : (
            stalls.map((stall) => (
              <div key={stall.stall_id} className="card bg-base-200 shadow-md">
                <div className="card-body p-4">
                  {/* Display Section */}
                  <h3 className="font-bold text-lg flex items-center justify-between">
                    {stall.stall_name}
                    <span className={`badge ${getStatusBadgeColor(stall.status)}`}>
                      {stall.status || 'N/A'}
                    </span>
                  </h3>
                  <p className="text-sm text-base-content/70 mb-2">
                    Location: {stall.location || 'N/A'}
                  </p>
                  <p className="text-sm text-base-content/70 mb-4">
                    Current Stock: <span className="font-semibold">{stocks[stall.stall_id]?.quantity || 0} kg</span>
                  </p>

                  {/* Divider */}
                  <div className="divider my-2 italic">edit</div>

                  {/* Editing Section */}
                  <div className="form-control mb-4">
                    <label className="label">
                      <span className="label-text">Location</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input input-bordered w-full"
                        value={locationInputs[stall.stall_id] ?? ''}
                        onChange={(e) => handleLocationInputChange(stall.stall_id, e.target.value)}
                        onBlur={() => handleLocationInputBlur(stall.stall_id)}
                        disabled={locationLoadingId === stall.stall_id}
                        placeholder="Enter location"
                      />
                      {locationLoadingId === stall.stall_id && (
                        <div className="loading loading-spinner loading-sm"></div>
                      )}
                    </div>
                  </div>

                  <div className="form-control mb-4">
                    <label className="label">
                      <span className="label-text">Stock Level (kg)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="input input-bordered w-full"
                        value={stockInputs[stall.stall_id] ?? ''}
                        onChange={(e) => handleStockInputChange(stall.stall_id, e.target.value)}
                        onBlur={() => handleStockInputBlur(stall.stall_id)}
                        disabled={stockLoadingId === stall.stall_id}
                        min="0"
                        step="1"
                        placeholder="Enter stock level"
                      />
                      {stockLoadingId === stall.stall_id && (
                        <div className="loading loading-spinner loading-sm"></div>
                      )}
                    </div>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Change Status</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        className="select select-bordered w-full"
                        value={stall.status || ''}
                        onChange={(e) => handleStatusChange(stall.stall_id, e.target.value)}
                        disabled={statusLoadingId === stall.stall_id}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {statusLoadingId === stall.stall_id && (
                        <div className="loading loading-spinner loading-sm"></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {error && <div className="mt-4 text-error text-sm md:text-base">{error}</div>}
        {success && <div className="mt-4 text-success text-sm md:text-base">{success}</div>}
      </div>
    </div>
  )
}

