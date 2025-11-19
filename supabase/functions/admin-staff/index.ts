import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ALLOWED_ORIGIN_ENV = Deno.env.get("ALLOWED_ORIGIN")
// Site URL for email confirmation redirects (defaults to Vercel deployment)
const SITE_URL = Deno.env.get("SITE_URL") || "https://chicken-stall-sebastian-rafhael-garcias-projects.vercel.app"

// Dynamic CORS origin handler
function getCorsOrigin(req: Request): string {
  const requestOrigin = req.headers.get("origin")
  
  // If ALLOWED_ORIGIN is "*" or not set, allow all origins
  if (ALLOWED_ORIGIN_ENV === "*" || !ALLOWED_ORIGIN_ENV) {
    return requestOrigin || "*"
  }
  
  // If ALLOWED_ORIGIN is set, check if it's a comma-separated list
  const allowedOrigins = ALLOWED_ORIGIN_ENV.split(",").map(o => o.trim())
  
  // If request origin matches any allowed origin, return it
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin
  }
  
  // Special handling: if request is from a production domain (vercel.app, netlify.app, etc.)
  // and ALLOWED_ORIGIN only has localhost, allow the production origin anyway
  if (requestOrigin) {
    const isProductionDomain = 
      requestOrigin.includes("vercel.app") ||
      requestOrigin.includes("netlify.app") ||
      requestOrigin.includes("github.io") ||
      requestOrigin.startsWith("https://") // Any HTTPS origin is likely production
    
    const hasOnlyLocalhost = allowedOrigins.every(origin => 
      origin.includes("localhost") || origin.includes("127.0.0.1")
    )
    
    if (isProductionDomain && hasOnlyLocalhost) {
      return requestOrigin
    }
  }
  
  // If no match and we have allowed origins, return the first one (fallback)
  // This handles the case where origin header might be missing
  return allowedOrigins[0] || "*"
}

function getCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  }
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function getAuthenticatedUser(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!jwt) return null

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(jwt)

  if (error || !user) {
    return null
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  return profile ? { user, role: profile.role } : null
}

async function requireAdmin(req: Request) {
  const authData = await getAuthenticatedUser(req)
  return authData?.role === "admin" ? authData.user : null
}

function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request) {
  const corsHeaders = req ? getCorsHeaders(req) : {}
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function textResponse(message: string, status = 200, req?: Request) {
  const corsHeaders = req ? getCorsHeaders(req) : {}
  return new Response(message, {
    status,
    headers: corsHeaders,
  })
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return textResponse("ok", 200, req)
    }

    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/|\/$/g, "").split("/")
    // Expected path: /admin-staff/staff/...
    const resource = segments[1]
    const rest = segments.slice(2)

    if (resource !== "staff") {
      return textResponse("Not Found", 404, req)
    }

    // GET /staff/:id/auth can be accessed by staff (their own) or admins (anyone's)
    // All other endpoints require admin role
    const isAuthEndpoint = req.method === "GET" && rest.length === 2 && rest[1] === "auth"
    
    if (!isAuthEndpoint) {
      // Require admin for all endpoints except GET /staff/:id/auth
      const admin = await requireAdmin(req)
      if (!admin) {
        return textResponse("Forbidden", 403, req)
      }
    }

    // POST /staff -> create staff
    if (req.method === "POST" && rest.length === 0) {
      const body = await req.json()
      const {
        email,
        password,
        fullName,
        contactNumber,
        stallId,
      } = body as {
        email?: string
        password?: string
        fullName?: string
        contactNumber?: string | null
        stallId?: string | null
      }

      if (!email || !password || !fullName) {
        return textResponse("Missing required fields", 400, req)
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      })

      if (error || !data.user) {
        return textResponse(error?.message ?? "Unable to create user", 400, req)
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").insert([
        {
          id: data.user.id,
          full_name: fullName,
          email,
          contact_number: contactNumber || null,
          role: "staff",
          status: "inactive",
          stall_id: stallId || null,
        },
      ])

      if (profileError) {
        return textResponse(profileError.message, 400, req)
      }

      const { error: inviteError } = await supabaseAdmin.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${SITE_URL}/login`,
        },
      })
      if (inviteError) {
        console.error("Failed to send confirmation email", inviteError)
        // Don't fail the entire request if email sending fails - user is still created
        // Log the error but continue
        console.warn("User created but confirmation email failed to send:", inviteError.message)
      }

      return jsonResponse(
        {
          userId: data.user.id,
          confirmationSent: true,
        },
        200,
        req,
      )
    }

    // POST /staff/resend-invite -> resend email
    if (req.method === "POST" && rest[0] === "resend-invite") {
      const { email, staffId } = (await req.json()) as {
        email?: string
        staffId?: string
      }

      let targetEmail = email ?? null
      let userId: string | null = null

      if (!targetEmail && staffId) {
        const { data: profile, error: profileLookupError } = await supabaseAdmin
          .from("profiles")
          .select("email, id")
          .eq("id", staffId)
          .single()

        if (profileLookupError || !profile?.email) {
          return textResponse("User not found", 404, req)
        }

        targetEmail = profile.email
        userId = profile.id
      } else if (targetEmail) {
        // Look up user by email to get their ID
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", targetEmail)
          .single()
        
        if (profile) {
          userId = profile.id
        }
      }

      if (!targetEmail) {
        return textResponse("Missing email", 400, req)
      }

      // Check if user is already confirmed
      if (userId) {
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (!authError && authUser?.user?.email_confirmed_at) {
          return textResponse("User email is already confirmed", 400, req)
        }
      }

      const { error } = await supabaseAdmin.auth.resend({
        type: "signup",
        email: targetEmail,
        options: {
          emailRedirectTo: `${SITE_URL}/login`,
        },
      })

      if (error) {
        console.error("Failed to resend confirmation email", error)
        // Provide more helpful error message
        const errorMessage = error.message.includes("already confirmed") 
          ? "User email is already confirmed"
          : error.message.includes("not found")
          ? "User not found"
          : `Failed to resend email: ${error.message}`
        return textResponse(errorMessage, 400, req)
      }

      return jsonResponse({ message: "Email resent successfully" }, 200, req)
    }

    // GET /staff/:id/auth -> auth metadata
    // Allow staff to access their own auth data, or admins to access anyone's
    if (req.method === "GET" && rest.length === 2 && rest[1] === "auth") {
      const staffId = rest[0]
      
      // Get the authenticated user (staff or admin)
      const authData = await getAuthenticatedUser(req)
      if (!authData) {
        return textResponse("Forbidden", 403, req)
      }

      // Allow admins to access any user's auth data
      // Allow staff to access only their own auth data
      if (authData.role !== "admin" && authData.user.id !== staffId) {
        return textResponse("Forbidden - You can only access your own auth data", 403, req)
      }

      const { data, error } = await supabaseAdmin.auth.admin.getUserById(staffId)
      if (error || !data?.user) {
        return textResponse(error?.message ?? "User not found", 404, req)
      }

      return jsonResponse(
        {
          emailConfirmedAt: data.user.email_confirmed_at,
          lastSignInAt: data.user.last_sign_in_at,
        },
        200,
        req,
      )
    }

    // DELETE /staff/:id -> delete staff
    if (req.method === "DELETE" && rest.length === 1) {
      const staffId = rest[0]

      await supabaseAdmin.from("profiles").delete().eq("id", staffId)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(staffId)
      if (error) {
        return textResponse(error.message, 400, req)
      }

      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(req),
      })
    }

    return textResponse("Not Found", 404, req)
  } catch (error) {
    console.error("admin-staff error", error)
    return jsonResponse({ message: "Internal Server Error" }, 500, req)
  }
})
