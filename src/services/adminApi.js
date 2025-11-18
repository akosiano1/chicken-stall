import { supabase } from '../supabaseClient'

const ADMIN_API_BASE_URL =
  (import.meta.env.VITE_ADMIN_API_URL || '/api/admin').replace(/\/$/, '')

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.access_token || null
}

async function request(path, { method = 'GET', body } = {}) {
  if (!ADMIN_API_BASE_URL) {
    throw new Error('Admin API base URL is not configured. Set VITE_ADMIN_API_URL.')
  }

  const token = await getAccessToken()
  if (!token) {
    throw new Error('You must be signed in to perform this action.')
  }

  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(errorText || `Admin API request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export async function createStaffAccount({ email, password, fullName, contactNumber, stallId }) {
  return request('/staff', {
    method: 'POST',
    body: { email, password, fullName, contactNumber, stallId },
  })
}

export async function resendStaffInvite(email) {
  return request('/staff/resend-invite', {
    method: 'POST',
    body: { email },
  })
}

export async function deleteStaffAccount(userId) {
  return request(`/staff/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}

export async function fetchUserAuthStatus(userId) {
  return request(`/staff/${encodeURIComponent(userId)}/auth`)
}


