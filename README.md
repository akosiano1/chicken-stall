### Prerequisites
- Node.js 18+ installed ([Download Node.js](https://nodejs.org/))
- Git installed
- A code editor (VS Code recommended)

### Step 2: Install Dependencies
npm install


This will install all required packages including:
- React 19.1.1
- Supabase client
- Tailwind CSS + DaisyUI
- Chart.js
- React Router DOM
- And other dependencies

### Step 3: Set Up Environment Variables
create a `.env.local` file in the root directory with the Supabase credentials. **Never** place service-role keys or other secrets in this file because everything prefixed with `VITE_` is exposed to the browser.

```
VITE_SUPABASE_URL=https://bizfaejufnphdzfwnewa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpemZhZWp1Zm5waGR6ZnduZXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NzMyNDEsImV4cCI6MjA3NTE0OTI0MX0.As0cFpqMY25fzOm83MsxMGJJsuwZWdx1HGdjYqaA8u0
VITE_ADMIN_API_URL=https://your-secure-backend.example.com/admin
```

`VITE_ADMIN_API_URL` should point to a secure backend (Supabase Edge Function, Cloud Function, custom API, etc.) that runs with the Supabase service role key. That backend is responsible for privileged actions such as creating staff accounts, resending invites, deleting users, and reading auth metadata. See “Deploy the Admin API” below for a checklist.


### Step 4: Run the Development Server
npm run dev

The application will start at `http://localhost:5173`

### Step 5: Login
admiin account:
- admin@test.com
- chicken


PAG STAFF ACCOUNT GAGAWA MISMO SA ADMIN ACCOUNT, USE REAL GMAIL, OPEN VERIFICATION SA SAME DEVICE

---

### Deploy the Admin API (required for production)

1. **Rotate your Supabase keys** in the Supabase dashboard (Settings → API) to invalidate the leaked service-role key.
2. Write a Supabase Edge Function or serverless API that exposes secure endpoints:
   - `POST /staff` → uses the service role to `auth.admin.createUser`, inserts the profile row, and sends the invitation email.
   - `POST /staff/resend-invite` → calls `auth.resend`.
   - `GET /staff/:id/auth` → returns `email_confirmed_at` and `last_sign_in_at`.
   - `DELETE /staff/:id` → calls `auth.admin.deleteUser` and cleans up related data.
3. Store the service role key **only** inside that backend’s environment variables.
4. Deploy the backend and set `VITE_ADMIN_API_URL` to its base URL.
5. Update firewall/edge rules so only authenticated admins can invoke those endpoints (e.g., verify Supabase JWT in the backend).

The frontend now calls these endpoints via `src/services/adminApi.js`, so once the backend is live no additional code changes are needed.
