# Deployment Guide for Admin Staff Function

## Setting Environment Variables

### Option 1: Using Supabase CLI (Recommended)

1. **Set the ALLOWED_ORIGIN variable:**
   ```bash
   supabase secrets set ALLOWED_ORIGIN="*" --project-ref YOUR_PROJECT_REF
   ```

   Or for multiple origins:
   ```bash
   supabase secrets set ALLOWED_ORIGIN="http://localhost:5173,https://chicken-stall-sebastian-rafhael-garcias-projects.vercel.app" --project-ref YOUR_PROJECT_REF
   ```

2. **Verify it's set:**
   ```bash
   supabase secrets list --project-ref YOUR_PROJECT_REF
   ```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **Edge Functions**
3. Find the `admin-staff` function
4. Click on **Settings** or **Environment Variables**
5. Add a new variable:
   - **Key:** `ALLOWED_ORIGIN`
   - **Value:** `*` (or your specific origins)
   - **Scope:** Function-specific

### Option 3: Using Supabase Dashboard (Alternative Path)

If you can't find it in Edge Functions settings:

1. Go to **Project Settings** → **API**
2. Look for **Environment Variables** or **Secrets** section
3. Add `ALLOWED_ORIGIN` with value `*`

**Note:** The function will work without setting `ALLOWED_ORIGIN` because the code defaults to allowing all origins (`*`) if the variable is not set. However, setting it explicitly is recommended for clarity.

## Deploying the Function

```bash
supabase functions deploy admin-staff --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with your actual Supabase project reference (found in your project URL or settings).

## Troubleshooting Import Errors

If you encounter import errors during deployment:

1. **Try the JSR import** (current): `jsr:@supabase/supabase-js@2`
2. **Fallback to esm.sh with specific version**: `https://esm.sh/@supabase/supabase-js@2.39.3`
3. **Alternative CDN**: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`

The function code will automatically handle CORS for both localhost and production domains even if `ALLOWED_ORIGIN` is set to localhost only.

