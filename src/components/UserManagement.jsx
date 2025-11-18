import { useState, useEffect } from 'react'
import { getRoleDisplayName, getRoleBadgeColor } from '../utils/roleUtils'
import { useNotifications } from '../contexts/NotificationContext'

function UserManagement() {
    const { showError, showSuccess } = useNotifications()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        try {
            setLoading(true)
            // Note: This requires RLS policies to be set up in Supabase
            // For now, we'll show a placeholder
            setUsers([
                {
                    id: '1',
                    email: 'admin@chickenstall.com',
                    role: 'admin',
                    created_at: new Date().toISOString()
                },
                {
                    id: '2',
                    email: 'staff@chickenstall.com',
                    role: 'staff',
                    created_at: new Date().toISOString()
                }
            ])
        } catch (err) {
            setError('Failed to fetch users')
            console.error('Error fetching users:', err)
        } finally {
            setLoading(false)
        }
    }

    const updateUserRole = async (userId, newRole) => {
        try {
            // This would require a server-side function or RLS policy
            // For now, we'll just update the local state
            setUsers(users.map(user => 
                user.id === userId ? { ...user, role: newRole } : user
            ))
            showSuccess(`User role updated to ${newRole}`)
        } catch (err) {
            showError('Failed to update user role')
            console.error('Error updating user role:', err)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="loading loading-spinner loading-lg text-primary"></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
            </div>
        )
    }

    return (
        <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
                <h2 className="card-title">User Management</h2>
                <p className="text-base-content/70">Manage user roles and permissions</p>
                
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="table table-zebra w-full">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="avatar placeholder">
                                                <div className="bg-neutral text-neutral-content rounded-full w-8">
                                                    <span className="text-xs">
                                                        {user.email.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="font-bold">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${getRoleBadgeColor(user.role)}`}>
                                            {getRoleDisplayName(user.role)}
                                        </span>
                                    </td>
                                    <td>
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div className="dropdown dropdown-end">
                                            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
                                                Change Role
                                            </div>
                                            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-32">
                                                <li>
                                                    <button 
                                                        onClick={() => updateUserRole(user.id, 'admin')}
                                                        className={user.role === 'admin' ? 'active' : ''}
                                                    >
                                                        Admin
                                                    </button>
                                                </li>
                                                <li>
                                                    <button 
                                                        onClick={() => updateUserRole(user.id, 'staff')}
                                                        className={user.role === 'staff' ? 'active' : ''}
                                                    >
                                                        Staff
                                                    </button>
                                                </li>
                                            </ul>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {users.map((user) => (
                        <div key={user.id} className="card bg-base-200 shadow-sm">
                            <div className="card-body p-3">
                                <div className="flex items-start gap-3 mb-2">
                                    <div className="avatar placeholder">
                                        <div className="bg-neutral text-neutral-content rounded-full w-10">
                                            <span className="text-sm">
                                                {user.email.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm">{user.email}</p>
                                        <p className="text-xs text-base-content/70">
                                            Created: {new Date(user.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`badge badge-sm ${getRoleBadgeColor(user.role)}`}>
                                        {getRoleDisplayName(user.role)}
                                    </span>
                                    <div className="dropdown dropdown-end">
                                        <div tabIndex={0} role="button" className="btn btn-ghost btn-sm min-h-[44px]">
                                            Change Role
                                        </div>
                                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-32">
                                            <li>
                                                <button 
                                                    onClick={() => updateUserRole(user.id, 'admin')}
                                                    className={user.role === 'admin' ? 'active' : ''}
                                                >
                                                    Admin
                                                </button>
                                            </li>
                                            <li>
                                                <button 
                                                    onClick={() => updateUserRole(user.id, 'staff')}
                                                    className={user.role === 'staff' ? 'active' : ''}
                                                >
                                                    Staff
                                                </button>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default UserManagement

