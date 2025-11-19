// Role utility functions for managing user permissions

export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
}

// Get user role from Supabase profile object
// profile should come from your `profiles` table
export const getUserRole = (profile) => {
  if (!profile) return null
  return profile.role || ROLES.STAFF // Default to staff if no role set
}

// Check if user has admin role
export const isAdmin = (profile) => {
  return getUserRole(profile) === ROLES.ADMIN
}

// Check if user has staff role
export const isStaff = (profile) => {
  return getUserRole(profile) === ROLES.STAFF
}

// Check if user has a specific role
export const hasRole = (profile, role) => {
  return getUserRole(profile) === role
}

// Get readable role name for UI
export const getRoleDisplayName = (role) => {
  switch (role) {
    case ROLES.ADMIN:
      return 'Administrator'
    case ROLES.STAFF:
      return 'Staff Member'
    default:
      return 'Unknown Role'
  }
}

// Get badge color based on role
export const getRoleBadgeColor = (role) => {
  switch (role) {
    case ROLES.ADMIN:
      return 'badge-error' // Red for admin
    case ROLES.STAFF:
      return 'badge-info' // Blue for staff
    default:
      return 'badge-neutral'
  }
}

// Permission helpers

// Only admins can perform admin actions
export const canPerformAdminAction = (profile) => {
  return isAdmin(profile)
}

// Only admins can manage users
export const canManageUsers = (profile) => {
  return isAdmin(profile)
}

// Admins and staff can view reports
  export const canViewReports = (profile) => {
    return isAdmin(profile) || isStaff(profile)
  }

// Only staff can view point of sales
export const canViewPointOfSales = (profile) => {
  return isStaff(profile)
}

// Only admins can manage stock
export const canManageStock = (profile) => {
  return isAdmin(profile)
}

// Admins and staff can manage sales
export const canManageSales = (profile) => {
  return isAdmin(profile) || isStaff(profile)
}
