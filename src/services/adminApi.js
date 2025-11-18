import { supabase } from '../supabaseClient'

function deriveDefaultAdminApiBaseUrl() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) {
    return null
  }

  try {
    const url = new URL(supabaseUrl)
    const { protocol, hostname } = url

    if (hostname.endsWith('.supabase.co')) {
      const functionHost = hostname.replace('.supabase.co', '.functions.supabase.co')
      return `${protocol}//${functionHost}/admin-staff`
    }

    return `${url.origin}/functions/v1/admin-staff`
  } catch (error) {
    console.warn('Unable to derive admin API URL from VITE_SUPABASE_URL', error)
    return null
  }
}

const rawAdminApiBaseUrl =
  import.meta.env.VITE_ADMIN_API_URL || deriveDefaultAdminApiBaseUrl() || ''

const ADMIN_API_BASE_URL = rawAdminApiBaseUrl.replace(/\/$/, '')

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.access_token || null
}

async function request(path, { method = 'GET', body } = {}) {
  if (!ADMIN_API_BASE_URL) {
    throw new Error(
      'Admin API base URL is not configured. Set VITE_ADMIN_API_URL or ensure VITE_SUPABASE_URL is valid.',
    )
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
  if (!userId) {
    throw new Error('User ID is required to fetch auth status.')
  }

  return request(`/staff/${encodeURIComponent(userId)}/auth`)
}



