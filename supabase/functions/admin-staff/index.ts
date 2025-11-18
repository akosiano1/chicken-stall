import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*"

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function requireAdmin(req: Request) {
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

  return profile?.role === "admin" ? user : null
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function textResponse(message: string, status = 200) {
  return new Response(message, {
    status,
    headers: corsHeaders,
  })
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return textResponse("ok", 200)
    }

    const admin = await requireAdmin(req)
    if (!admin) {
      return textResponse("Forbidden", 403)
    }

    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/|\/$/g, "").split("/")
    // Expected path: /admin-staff/staff/...
    const resource = segments[1]
    const rest = segments.slice(2)

    if (resource !== "staff") {
      return textResponse("Not Found", 404)
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
        return textResponse("Missing required fields", 400)
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      })

      if (error || !data.user) {
        return textResponse(error?.message ?? "Unable to create user", 400)
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
        return textResponse(profileError.message, 400)
      }

      const { error: inviteError } = await supabaseAdmin.auth.resend({
        type: "signup",
        email,
      })
      if (inviteError) {
        console.error("Failed to send confirmation email", inviteError)
        return textResponse(inviteError.message, 400)
      }

      return jsonResponse(
        {
          userId: data.user.id,
          confirmationSent: true,
        },
        200,
      )
    }

    // POST /staff/resend-invite -> resend email
    if (req.method === "POST" && rest[0] === "resend-invite") {
      const { email, staffId } = (await req.json()) as {
        email?: string
        staffId?: string
      }

      let targetEmail = email ?? null

      if (!targetEmail && staffId) {
        const { data: profile, error: profileLookupError } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", staffId)
          .single()

        if (profileLookupError || !profile?.email) {
          return textResponse("User not found", 404)
        }

        targetEmail = profile.email
      }

      if (!targetEmail) {
        return textResponse("Missing email", 400)
      }

      const { error } = await supabaseAdmin.auth.resend({
        type: "signup",
        email: targetEmail,
      })

      if (error) {
        console.error("Failed to resend confirmation email", error)
        return textResponse(error.message, 400)
      }

      return jsonResponse({ message: "Email resent" }, 200)
    }

    // GET /staff/:id/auth -> auth metadata
    if (req.method === "GET" && rest.length === 2 && rest[1] === "auth") {
      const staffId = rest[0]
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(staffId)
      if (error || !data?.user) {
        return textResponse(error?.message ?? "User not found", 404)
      }

      return jsonResponse(
        {
          emailConfirmedAt: data.user.email_confirmed_at,
          lastSignInAt: data.user.last_sign_in_at,
        },
        200,
      )
    }

    // DELETE /staff/:id -> delete staff
    if (req.method === "DELETE" && rest.length === 1) {
      const staffId = rest[0]

      await supabaseAdmin.from("profiles").delete().eq("id", staffId)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(staffId)
      if (error) {
        return textResponse(error.message, 400)
      }

      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    return textResponse("Not Found", 404)
  } catch (error) {
    console.error("admin-staff error", error)
    return jsonResponse({ message: "Internal Server Error" }, 500)
  }
})
