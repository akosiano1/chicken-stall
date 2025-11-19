// Audit Log Utility
// Records all system activities for audit trail purposes

import { supabase } from '../supabaseClient'

/**
 * Log an activity to the audit trail
 * @param {Object} params - Activity parameters
 * @param {string} params.action - The action performed (e.g., 'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT')
 * @param {string} params.entity - The entity type (e.g., 'MENU_ITEM', 'STALL', 'STAFF', 'SALE', 'STOCK')
 * @param {string} params.entityId - The ID of the entity affected
 * @param {string} params.userId - The user ID who performed the action
 * @param {string} params.userName - The name of the user
 * @param {string} params.details - Additional details about the action
 * @param {string} params.ipAddress - IP address (optional)
 * @param {string} params.userAgent - User agent (optional)
 * @param {Object} params.oldValue - Previous value (for updates)
 * @param {Object} params.newValue - New value (for updates)
 */
export async function logActivity({
  action,
  entity,
  entityId = null,
  userId,
  userName,
  details = '',
  ipAddress = null,
  userAgent = null,
  oldValue = null,
  newValue = null,
  stallId = null
}) {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        action,
        entity,
        entity_id: entityId,
        user_id: userId,
        user_name: userName,
        details,
        ip_address: ipAddress || getClientIP(),
        user_agent: userAgent || navigator.userAgent,
        old_value: oldValue ? JSON.stringify(oldValue) : null,
        new_value: newValue ? JSON.stringify(newValue) : null,
        stall_id: stallId,
        timestamp: new Date().toISOString()
      })

    if (error) {
      // Check if table doesn't exist - only log once to avoid spam
      const isTableMissing = 
        error.code === 'PGRST116' || 
        error.code === '42P01' ||
        error.status === 404 ||
        error.message?.includes('does not exist') || 
        error.message?.includes('relation')
      
      if (isTableMissing) {
        // Only log once per session to avoid console spam
        if (!window._auditTableMissingLogged) {
          console.warn('⚠️ Audit logs table does not exist. Activities will not be logged until you run the SQL migration (audit_logs_table.sql) in Supabase.')
          window._auditTableMissingLogged = true
        }
      } else {
        console.error('Error logging activity:', error)
      }
      // Don't throw - audit logging should not break the main flow
    }
  } catch (err) {
    // Only log unexpected errors if table exists (to avoid spam)
    if (err?.code !== 'PGRST116' && err?.code !== '42P01' && err?.status !== 404) {
      console.error('Unexpected error logging activity:', err)
    }
    // Don't throw - audit logging should not break the main flow
  }
}

/**
 * Get client IP address (best effort)
 */
function getClientIP() {
  // In a real application, you might get this from headers
  // For now, return null as it's optional
  return null
}

/**
 * Helper functions for common actions
 */
export const auditActions = {
  // User actions
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  VIEW_AUDIT_LOG: 'VIEW_AUDIT_LOG',
  EXPORT_AUDIT_LOG: 'EXPORT_AUDIT_LOG',
  
  // CRUD actions
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VIEW: 'VIEW',
  
  // Specific entity actions
  UPDATE_STOCK: 'UPDATE_STOCK',
  UPDATE_STATUS: 'UPDATE_STATUS',
  UPDATE_LOCATION: 'UPDATE_LOCATION',
  UPDATE_PRICE: 'UPDATE_PRICE',
  ADD_MENU_ITEM: 'ADD_MENU_ITEM',
  DELETE_MENU_ITEM: 'DELETE_MENU_ITEM',
  CREATE_SALE: 'CREATE_SALE',
  ADD_EXPENSE: 'ADD_EXPENSE',
  UPDATE_EXPENSE: 'UPDATE_EXPENSE',
  DELETE_EXPENSE: 'DELETE_EXPENSE'
}

export const auditEntities = {
  USER: 'USER',
  MENU_ITEM: 'MENU_ITEM',
  STALL: 'STALL',
  STAFF: 'STAFF',
  SALE: 'SALE',
  STOCK: 'STOCK',
  EXPENSE: 'EXPENSE',
  AUDIT_LOG: 'AUDIT_LOG'
}

