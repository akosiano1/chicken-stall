// src/components/admin/EditMenuPrices.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { logActivity, auditActions, auditEntities } from '../../utils/auditLog'
import { useProfile } from '../../contexts/ProfileContext'

export default function EditMenuPrices() {
  const { profile: userProfile } = useProfile()
  const [menuItems, setMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')


  useEffect(() => {
    let isMounted = true
    async function loadMenuItems() {
      setMenuLoading(true); setError('')
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('item_id, item_name, price')
          .order('item_name', { ascending: true })
        if (error) throw error
        if (isMounted) setMenuItems(data || [])
      } catch (e) {
        if (isMounted) setError(e?.message || 'Failed to load menu items.')
      } finally {
        if (isMounted) setMenuLoading(false)
      }
    }
    loadMenuItems()
    return () => { isMounted = false }
  }, [])

  function handleItemFieldChange(itemId, field, value) {
    setMenuItems((prev) => prev.map((it) => (it.item_id === itemId ? { ...it, [field]: value } : it)))
  }

  async function saveMenuItem(item) {
    setLoading(true); setError(''); setSuccess('')
    try {
      const trimmedName = String(item.item_name || '').trim()
      const priceNum = Number(item.price)
      if (!trimmedName) {
        setError('Item name cannot be empty.')
        return
      }
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        setError('Price must be a non-negative number.')
        return
      }
      
      // Get old values for audit log
      const oldItem = menuItems.find(mi => mi.item_id === item.item_id)
      const oldValue = oldItem ? { item_name: oldItem.item_name, price: oldItem.price } : null
      const newValue = { item_name: trimmedName, price: priceNum }
      
      const { error } = await supabase
        .from('menu_items')
        .update({ item_name: trimmedName, price: priceNum })
        .eq('item_id', item.item_id)
      if (error) throw error
      
      // Log audit activity
      if (userProfile) {
        await logActivity({
          action: auditActions.UPDATE_PRICE,
          entity: auditEntities.MENU_ITEM,
          entityId: item.item_id,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated menu item: ${trimmedName}`,
          oldValue,
          newValue
        })
      }
      
      setSuccess('Menu item updated.')
    } catch (e) {
      setError(e?.message || 'Failed to update menu item.')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="card bg-base-100 shadow-xl mb-6">
      <div className="card-body p-4 md:p-6">
        <h2 className="card-title text-error mb-4 text-lg md:text-xl">Edit Menu Prices</h2>

        {menuLoading ? (
          <div className="loading loading-spinner text-primary"></div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {menuItems.map((mi) => (
                    <tr key={mi.item_id}>
                      <td>
                        <input className="input input-bordered w-full" value={mi.item_name}
                          onChange={(e) => handleItemFieldChange(mi.item_id, 'item_name', e.target.value)} />
                      </td>
                      <td>
                        <div className="join">
                          <input type="number" className="input input-bordered join-item w-32 md:w-40" value={mi.price}
                            min="0" step="0.01"
                            onChange={(e) => handleItemFieldChange(mi.item_id, 'price', e.target.value)} />
                          <span className="btn btn-ghost join-item">PHP</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          <button className="btn btn-primary btn-sm" onClick={() => saveMenuItem(mi)} disabled={loading}>Save</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {menuItems.map((mi) => (
                <div key={mi.item_id} className="card bg-base-200 shadow-sm">
                  <div className="card-body p-4 space-y-3">
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text font-semibold">Item</span>
                      </label>
                      <input className="input input-bordered w-full" value={mi.item_name}
                        onChange={(e) => handleItemFieldChange(mi.item_id, 'item_name', e.target.value)} />
                    </div>
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text font-semibold">Price</span>
                      </label>
                      <div className="join w-full">
                        <input type="number" className="input input-bordered join-item flex-1" value={mi.price}
                          min="0" step="0.01"
                          onChange={(e) => handleItemFieldChange(mi.item_id, 'price', e.target.value)} />
                        <span className="btn btn-ghost join-item">PHP</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-primary flex-1" onClick={() => saveMenuItem(mi)} disabled={loading}>Save</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div className="mt-4 text-error text-sm md:text-base">{error}</div>}
        {success && <div className="mt-4 text-success text-sm md:text-base">{success}</div>}
      </div>
    </div>
  )
}
