# Vercel Deployment Fix - Routing & Email Confirmation

## 🔴 Critical Issues Fixed

### 1. 404 NOT_FOUND on Page Reload
**Problem:** Reloading any page on Vercel shows 404 NOT_FOUND error.

**Cause:** Vercel's server tries to find files at the route paths (e.g., `/login`, `/dashboard`), but these routes are handled client-side by React Router. Without proper configuration, Vercel returns 404 for these routes.

**Fix:** Created `vercel.json` with rewrite rules to route all requests to `index.html`.

### 2. Duplicate Email Sending (400 Error)
**Problem:** POST to `/staff/resend-invite` returns 400 Bad Request.

**Cause:** The code was calling `resendStaffInvite()` after creating staff, but the Edge Function already sends the confirmation email automatically. This caused a duplicate send attempt, which failed.

**Fix:** Removed the duplicate `resendStaffInvite()` call from `ManageStaff.jsx`.

## 📁 Files Created/Modified

### Created: `vercel.json`
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "routes": [
    {
      "src": "/assets/(.*)",
      "dest": "/assets/$1"
    },
    {
      "src": "/(.*\\.(js|css|svg|png|jpg|jpeg|gif|ico|json))",
      "dest": "/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

**What it does:**
- Routes all non-asset requests to `index.html`
- Preserves asset files (JS, CSS, images, etc.)
- Allows React Router to handle all application routes

### Modified: `src/ManageStaff.jsx` (lines 138-147)
**Before:**
```javascript
// Send the confirmation email manually (best effort)
try {
  await resendStaffInvite(staffEmail);
} catch (resendError) {
  console.warn('Failed to trigger verification email:', resendError);
}
```

**After:**
```javascript
// Note: Confirmation email is automatically sent by the Edge Function
// No need to call resendStaffInvite here
```

## 🚀 Deployment Steps

1. **Commit and push the changes:**
   ```bash
   git add vercel.json src/ManageStaff.jsx
   git commit -m "Fix Vercel routing and remove duplicate email sending"
   git push
   ```

2. **Vercel will automatically redeploy** (if you have auto-deploy enabled)

3. **Verify the fixes:**
   - Open your Vercel deployment
   - Navigate to `/login`, `/dashboard`, etc.
   - Try reloading the page - should work without 404
   - Create a new staff account - confirmation email should send once
   - Click confirmation link - should redirect correctly

## ✅ Expected Behavior After Fix

### Page Reload
- ✅ Reloading any page works correctly
- ✅ Direct URL access works (e.g., manually typing `/dashboard`)
- ✅ No more 404 errors on page refresh

### Email Confirmation
- ✅ Confirmation email sent once when staff is created
- ✅ No 400 errors
- ✅ Clicking confirmation link redirects to login page
- ✅ User can log in immediately after confirmation

### Routes That Should Work
- `/` → redirects to `/dashboard`
- `/login` → login page
- `/dashboard` → dashboard (protected)
- `/manage-staff` → manage staff page (admin only)
- `/manage-inventory` → inventory page (protected)
- `/point-of-sale` → POS page (protected)
- `/reports` → reports page (protected)
- `/audit-log` → audit log (admin only)
- `/profile` → user profile (protected)

## 🔍 How to Test

1. **Test routing:**
   ```
   Visit: https://your-app.vercel.app/dashboard
   Reload the page (F5)
   Expected: Dashboard loads, no 404
   ```

2. **Test direct URL access:**
   ```
   Open new tab
   Go to: https://your-app.vercel.app/manage-staff
   Expected: Login page (if not authenticated) or Manage Staff page
   ```

3. **Test email confirmation:**
   ```
   - Create a new staff account
   - Check email inbox
   - Click confirmation link
   - Expected: Redirects to login, shows success message
   ```

## 📝 Notes

- The `vercel.json` file is required for any SPA (Single Page Application) deployed to Vercel
- Without it, client-side routing doesn't work on direct access or page reload
- The Edge Function handles email sending automatically; no need to call it again from the frontend

## 🐛 If Issues Persist

1. **Clear browser cache:**
   - Chrome: Ctrl+Shift+Delete → Clear cache
   - Or use incognito/private mode

2. **Check Vercel deployment logs:**
   - Go to Vercel Dashboard → Your Project → Deployments
   - Click on latest deployment
   - Check build logs and function logs

3. **Verify environment variables:**
   - Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel
   - Project Settings → Environment Variables

4. **Check Supabase configuration:**
   - Ensure redirect URLs are configured (see DEPLOYMENT_GUIDE.md)
   - Authentication → URL Configuration

