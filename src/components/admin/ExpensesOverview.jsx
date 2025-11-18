import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { getPHDateString } from '../../utils/dateUtils'
import { useAuth } from '../../hooks/useAuth'
import { logActivity, auditActions, auditEntities } from '../../utils/auditLog'

export default function ExpensesOverview() {
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState(null)
  const [expenseName, setExpenseName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState('')
  const [date, setDate] = useState('')
  const [supplier, setSupplier] = useState('')
  const [stallId, setStallId] = useState('')
  const [stalls, setStalls] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expenses, setExpenses] = useState([])

  // Load user profile for audit logging
  useEffect(() => {
    if (!user) return
    let isMounted = true
    async function loadProfile() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', user.id)
          .single()
        if (!error && isMounted) setUserProfile(data)
      } catch (e) {
        console.error('Failed to load profile:', e)
      }
    }
    loadProfile()
    return () => { isMounted = false }
  }, [user])

  useEffect(() => {
    let isMounted = true
    async function loadStalls() {
      try {
        const { data, error } = await supabase
          .from('stalls')
          .select('stall_id, stall_name')
          .order('stall_name', { ascending: true })
        if (error) throw error
        if (isMounted) setStalls(data || [])
      } catch (e) {
        console.error('Failed to load stalls:', e)
      }
    }
    loadStalls()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    let isMounted = true
    async function loadExpenses() {
      setError('')
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('expense_id, expense_name, quantity, cost, date, supplier_name, stall_id, created_at, stalls(stall_name)')
          .order('date', { ascending: false })
        if (error) throw error
        if (isMounted) setExpenses(data || [])
      } catch (e) {
        if (isMounted) setError(e.message || 'Failed to load expenses')
      }
    }
    loadExpenses()
    return () => { isMounted = false }
  }, [])

  async function addExpense() {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      if (!expenseName) { setError('Expense name required'); return }
      if (!cost || Number(cost) < 0) { setError('Cost must be a non-negative number'); return }

      const payload = {
        expense_name: expenseName,
        quantity: quantity || null,
        cost: Number(cost),
        date: date || (() => {
          // Get current date in Philippines timezone
          return getPHDateString();
        })(),
        supplier_name: supplier || null,
        stall_id: stallId || null
      }

      const { data, error } = await supabase
        .from('expenses')
        .insert([payload])
        .select('expense_id, expense_name, quantity, cost, date, supplier_name, stall_id, created_at, stalls(stall_name)')
        .single()
      if (error) throw error

      // Log audit activity
      if (userProfile) {
        await logActivity({
          action: auditActions.ADD_EXPENSE,
          entity: auditEntities.EXPENSE,
          entityId: data.expense_id,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Added expense: ${expenseName}, Cost: ₱${Number(cost).toFixed(2)}${quantity ? `, Quantity: ${quantity}` : ''}${supplier ? `, Supplier: ${supplier}` : ''}`,
          newValue: {
            expense_name: expenseName,
            quantity: quantity || null,
            cost: Number(cost),
            date: payload.date,
            supplier_name: supplier || null,
            stall_id: stallId || null
          },
          stallId: stallId || null
        })
      }

      setExpenses((prev) => [data, ...prev])
      setExpenseName('')
      setQuantity('')
      setCost('')
      setDate('')
      setSupplier('')
      setStallId('')
      setSuccess('Expense added.')
    } catch (e) {
      setError(e?.message || 'Failed to add expense.')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="card bg-base-100 shadow-xl mb-6">
      <div className="card-body">
        <h2 className="card-title text-error mb-4">Expenses Overview</h2>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          <div className="form-control">
            <label className="label"><span className="label-text">Expense name</span></label>
            <input className="input input-bordered w-full" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">Quantity</span></label>
            <input className="input input-bordered w-full" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 20 kilos" />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">Cost (PHP)</span></label>
            <input type="number" className="input input-bordered w-full" value={cost} onChange={(e) => setCost(e.target.value)} min="0" step="0.01" />
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">Stall</span></label>
            <select className="select select-bordered w-full" value={stallId} onChange={(e) => setStallId(e.target.value)}>
              <option value="">None</option>
              {stalls.map((stall) => (
                <option key={stall.stall_id} value={stall.stall_id}>
                  {stall.stall_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text">Supplier</span></label>
            <input className="input input-bordered w-full" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>

          <div className="card-actions mt-5 mx-auto">
            <button className="btn btn-primary" onClick={addExpense} disabled={loading}>Add Expense</button>
          </div>
        </div>

        {error && <div className="mt-4 text-error">{error}</div>}
        {success && <div className="mt-4 text-success">{success}</div>}

        <div className="divider">Recent Expenses</div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Date</th>
                <th>Stall</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((ex) => (
                <tr key={ex.expense_id}>
                  <td>{ex.expense_name}</td>
                  <td>{ex.quantity}</td>
                  <td>PHP {Number(ex.cost).toFixed(2)}</td>
                  <td>{ex.date}</td>
                  <td>{ex.stalls?.stall_name || 'N/A'}</td>
                  <td>{ex.supplier_name}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center text-base-content/50 py-4">
                    No expenses recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {expenses.length === 0 ? (
            <div className="text-center text-base-content/50 py-4">
              No expenses recorded.
            </div>
          ) : (
            expenses.map((ex) => (
              <div key={ex.expense_id} className="card bg-base-200 shadow-sm">
                <div className="card-body p-3">
                  {/* Name Header Section */}
                  <div className="mb-3">
                    <p className="font-semibold text-sm mb-1">{ex.expense_name}</p>
                    <p className="text-xs text-base-content/70">{ex.date}</p>
                  </div>
                  
                  {/* Price Section with Divider */}
                  <div className="mb-3 pb-2 border-b border-base-300">
                    <p className="text-error font-bold text-xl">₱{Number(ex.cost).toFixed(2)}</p>
                  </div>
                  
                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-base-content/70">Stall: </span>
                      <span className="font-medium">{ex.stalls?.stall_name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-end items-center">
                      <span className="text-base-content/70">Qty: </span>
                      <span className="font-medium">{ex.quantity || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-base-content/70">Supplier: </span>
                      <span className="font-medium">{ex.supplier_name || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
