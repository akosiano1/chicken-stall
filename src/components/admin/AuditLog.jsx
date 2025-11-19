// src/components/admin/AuditLog.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Layout from '../Layout'
import ExcelJS from 'exceljs'
import { logActivity, auditActions, auditEntities } from '../../utils/auditLog'
import { useNotifications } from '../../contexts/NotificationContext'
import { useProfile } from '../../contexts/ProfileContext'
import ChangesViewer from './ChangesViewer'
import DateRangeFilter from '../common/DateRangeFilter'
import { applyDateRangeFilter } from '../../utils/dateFilterUtils'

export default function AuditLog() {
  const navigate = useNavigate()
  const { showError } = useNotifications()
  const [profile, setProfile] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filter states
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterUser, setFilterUser] = useState('')

  // Get unique values for filters
  const [actions, setActions] = useState([])
  const [entities, setEntities] = useState([])
  const [users, setUsers] = useState([])

  // Get profile from context and verify admin
  const { profile: profileFromContext } = useProfile()
  
  useEffect(() => {
    if (profileFromContext) {
      setProfile(profileFromContext)
      if (profileFromContext.role !== 'admin') {
        showError('Access denied. Only admins can view audit logs.')
        navigate('/dashboard')
      }
    }
  }, [profileFromContext, navigate, showError])

  // Load audit logs
  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    
    let isMounted = true
    async function loadAuditLogs() {
      setLoading(true)
      setError(null)
      try {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(1000) // Limit to prevent performance issues

        // Apply date filters using timezone-aware utility
        query = applyDateRangeFilter(query, 'timestamp', startDate, endDate, true)

        // Apply other filters
        if (filterAction) {
          query = query.eq('action', filterAction)
        }
        if (filterEntity) {
          query = query.eq('entity', filterEntity)
        }
        if (filterUser) {
          query = query.eq('user_id', filterUser)
        }

        const { data, error } = await query

        if (error) {
          // Check if table doesn't exist (404, PGRST116, or relation does not exist)
          const isTableMissing = 
            error.code === 'PGRST116' || 
            error.code === '42P01' ||
            error.status === 404 ||
            error.message?.includes('does not exist') || 
            error.message?.includes('relation') ||
            error.message?.includes('audit_logs') ||
            error.details?.includes('does not exist')
          
          if (isTableMissing) {
            throw new Error('TABLE_MISSING')
          }
          throw error
        }

        if (isMounted) {
          setAuditLogs(data || [])
          
          // Extract unique values for filters
          const uniqueActions = [...new Set(data?.map(log => log.action).filter(Boolean) || [])].sort()
          const uniqueEntities = [...new Set(data?.map(log => log.entity).filter(Boolean) || [])].sort()
          const uniqueUserIds = [...new Set(data?.map(log => log.user_id).filter(Boolean) || [])]
          
          setActions(uniqueActions)
          setEntities(uniqueEntities)
          
          // Get user names for user filter
          if (uniqueUserIds.length > 0) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', uniqueUserIds)
            
            if (userData) {
              setUsers(userData.map(u => ({ id: u.id, name: u.full_name })))
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load audit logs:', err)
          const errorMessage = err?.message || 'Failed to load audit logs.'
          
          // If it's a table missing error, show more helpful message
          if (errorMessage === 'TABLE_MISSING' || 
              errorMessage.includes('does not exist') || 
              errorMessage.includes('audit_logs table') ||
              err?.code === 'PGRST116' ||
              err?.code === '42P01' ||
              err?.status === 404) {
            setError(
              <div className="space-y-2">
                <p className="font-bold text-lg">⚠️ Audit Logs Table Not Found</p>
                <p>The <code className="bg-base-200 px-1 rounded">audit_logs</code> table does not exist in your Supabase database.</p>
                <div className="bg-base-200 p-4 rounded-lg mt-3">
                  <p className="font-semibold mb-2">To fix this, follow these steps:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Open your <strong>Supabase Dashboard</strong></li>
                    <li>Navigate to <strong>SQL Editor</strong> (in the left sidebar)</li>
                    <li>Open the file <code className="bg-base-300 px-1 rounded">audit_logs_table.sql</code> from your project root</li>
                    <li>Copy all the SQL code from that file</li>
                    <li>Paste it into the SQL Editor in Supabase</li>
                    <li>Click <strong>Run</strong> or press Ctrl+Enter</li>
                    <li>Wait for the success message</li>
                    <li>Refresh this page</li>
                  </ol>
                </div>
                <p className="text-sm text-base-content/70 mt-2">
                  The SQL file creates the table, indexes, and security policies needed for the audit log system.
                </p>
              </div>
            )
          } else {
            setError(errorMessage)
          }
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadAuditLogs()
    return () => { isMounted = false }
  }, [profile, startDate, endDate, filterAction, filterEntity, filterUser])

  // Log audit log access when admin views the page
  useEffect(() => {
    if (profile && profile.role === 'admin') {
      logActivity({
        action: auditActions.VIEW_AUDIT_LOG,
        entity: auditEntities.AUDIT_LOG,
        userId: profile.id,
        userName: profile.full_name,
        details: 'Admin accessed audit log'
      })
    }
  }, [profile])

  const handleExportExcel = async () => {
    try {
      // Create a new workbook and worksheet
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Audit Log')

      // Define columns
      worksheet.columns = [
        { header: 'Timestamp', key: 'timestamp', width: 20 },
        { header: 'Action', key: 'action', width: 15 },
        { header: 'Entity', key: 'entity', width: 15 },
        { header: 'Entity ID', key: 'entityId', width: 12 },
        { header: 'User', key: 'user', width: 20 },
        { header: 'User ID', key: 'userId', width: 40 },
        { header: 'Details', key: 'details', width: 30 },
        { header: 'Stall ID', key: 'stallId', width: 12 },
        { header: 'IP Address', key: 'ipAddress', width: 15 },
        { header: 'Old Value', key: 'oldValue', width: 30 },
        { header: 'New Value', key: 'newValue', width: 30 }
      ]

      // Style the header row
      worksheet.getRow(1).font = { bold: true }
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      }

      // Add data rows
      auditLogs.forEach(log => {
        worksheet.addRow({
          timestamp: new Date(log.timestamp).toLocaleString(),
          action: log.action || '',
          entity: log.entity || '',
          entityId: log.entity_id || '',
          user: log.user_name || '',
          userId: log.user_id || '',
          details: log.details || '',
          stallId: log.stall_id || '',
          ipAddress: log.ip_address || '',
          oldValue: log.old_value ? JSON.stringify(JSON.parse(log.old_value), null, 2) : '',
          newValue: log.new_value ? JSON.stringify(JSON.parse(log.new_value), null, 2) : ''
        })
      })

      // Generate filename with date range
      const dateStr = startDate && endDate 
        ? `${startDate}_to_${endDate}`
        : new Date().toISOString().split('T')[0]
      const filename = `audit_log_${dateStr}.xlsx`

      // Create blob and download
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      // Log export activity
      if (profile) {
        await logActivity({
          action: auditActions.EXPORT_AUDIT_LOG,
          entity: auditEntities.AUDIT_LOG,
          userId: profile.id,
          userName: profile.full_name,
          details: `Exported audit log to Excel (${auditLogs.length} records)${startDate && endDate ? ` from ${startDate} to ${endDate}` : ''}`
        })
      }
    } catch (err) {
      console.error('Error exporting to Excel:', err)
      setError('Failed to export audit log to Excel.')
    }
  }

  const clearFilters = () => {
    setStartDate('')
    setEndDate('')
    setFilterAction('')
    setFilterEntity('')
    setFilterUser('')
  }

  if (loading && !auditLogs.length) {
    return (
      <Layout userProfile={profile}>
        <div className="min-h-screen bg-base-200 flex items-center justify-center">
          <div className="loading loading-spinner loading-lg text-primary"></div>
        </div>
      </Layout>
    )
  }

  if (profile && profile.role !== 'admin') {
    return null
  }

  return (
    <Layout userProfile={profile}>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-primary mb-1">Audit Log</h1>
            <p className="text-base-content/70">
              View and filter all system activities and changes.
            </p>
          </div>

          {/* Filters Card */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4 md:p-6">
              <h2 className="card-title text-lg mb-4">Filters</h2>
              
              <div className="space-y-4">
                {/* Date Range Filter */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">Date Range</span>
                  </label>
                  <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(newStartDate, newEndDate) => {
                      setStartDate(newStartDate)
                      setEndDate(newEndDate)
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'md',
                    }}
                  />
                </div>

                {/* Other Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Action Filter */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Action</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                  >
                    <option value="">All Actions</option>
                    {actions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>

                {/* Entity Filter */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Entity</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={filterEntity}
                    onChange={(e) => setFilterEntity(e.target.value)}
                  >
                    <option value="">All Entities</option>
                    {entities.map(entity => (
                      <option key={entity} value={entity}>{entity}</option>
                    ))}
                  </select>
                </div>

                {/* User Filter */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">User</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                  >
                    <option value="">All Users</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>

                </div>

                {/* Clear All Filters Button */}
                <div className="flex justify-end">
                  <button className="btn btn-ghost" onClick={clearFilters}>
                    Clear All Filters
                  </button>
                </div>
              </div>

              {/* Export Button */}
              <div className="mt-4">
                <button className="btn btn-success" onClick={handleExportExcel} disabled={auditLogs.length === 0}>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export to Excel
                </button>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4 md:p-6">
              <h2 className="card-title text-lg mb-4">
                Activity Log ({auditLogs.length} records)
              </h2>

              {error && (
                <div className="alert alert-error mb-4">
                  {typeof error === 'string' ? (
                    <span>{error}</span>
                  ) : (
                    <div>{error}</div>
                  )}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="loading loading-spinner loading-lg text-primary"></div>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-base-content/50">
                  No audit logs found for the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto max-h-96">
                    <table className="table table-zebra w-full">
                      <thead className="sticky top-0 z-10 bg-base-100">
                        <tr>
                          <th className="bg-base-100">Timestamp</th>
                          <th className="bg-base-100">Action</th>
                          <th className="bg-base-100">Entity</th>
                          <th className="bg-base-100">User</th>
                          <th className="bg-base-100">Details</th>
                          <th className="bg-base-100">Changes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="text-sm">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td>
                              <span className="badge badge-primary badge-sm">{log.action}</span>
                            </td>
                            <td>
                              <span className="badge badge-secondary badge-sm">{log.entity}</span>
                            </td>
                            <td>{log.user_name || 'N/A'}</td>
                            <td className="max-w-xs truncate">{log.details || '-'}</td>
                            <td>
                              <ChangesViewer
                                oldValue={log.old_value}
                                newValue={log.new_value}
                                action={log.action}
                                entity={log.entity}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="card bg-base-200 shadow-sm">
                        <div className="card-body p-3">
                          {/* Header Section */}
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-2 flex-wrap">
                              <span className="badge badge-primary badge-sm">{log.action}</span>
                              <span className="badge badge-secondary badge-sm">{log.entity}</span>
                            </div>
                            <span className="text-xs text-base-content/70 flex-shrink-0 ml-2">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          
                          {/* User Section */}
                          <div className="mb-2">
                            <span className="text-xs text-base-content/70">User: </span>
                            <span className="text-sm font-semibold">{log.user_name || 'N/A'}</span>
                          </div>
                          
                          {/* Details Section with Divider */}
                          {log.details && (
                            <>
                              <div className="mb-2 pb-2 border-b border-base-300">
                                <p className="text-xs text-base-content/70 mb-1">Details</p>
                                <p className="text-sm">{log.details}</p>
                              </div>
                            </>
                          )}
                          
                          {/* Changes Section */}
                          <div className="mt-2">
                            <ChangesViewer
                              oldValue={log.old_value}
                              newValue={log.new_value}
                              action={log.action}
                              entity={log.entity}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    </Layout>
  )
}

