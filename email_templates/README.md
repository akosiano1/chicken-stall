# Email Templates for Johnny's Chicken Stall

This directory contains improved email templates for staff account confirmation.

## 📧 Files Included

1. **staff_confirmation_email.html** - HTML version of the confirmation email
2. **staff_confirmation_email_plain.txt** - Plain text version for email clients that don't support HTML

## 🚀 How to Implement in Supabase

### Step 1: Access Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Select **Confirm signup** template

### Step 2: Update Email Template
1. Copy the HTML content from `staff_confirmation_email.html`
2. Replace the default template in Supabase with the new HTML
3. Or upload the plain text version if you prefer simplicity

### Step 3: Customize Variables
Supabase uses Go template syntax. These variables are automatically replaced:
- `{{ .Email }}` - Staff member's email address
- `{{ .ConfirmationURL }}` - Confirmation link URL
- `{{ .SiteURL }}` - Your site URL

### Step 4: Customize Subject Line
In Supabase dashboard, update the subject line:
```
Welcome to Johnny's Chicken Stall! Confirm Your Account
```

### Step 5: Test the Email
1. Create a test staff account
2. Check the email inbox
3. Verify the email renders correctly in different email clients

## ✨ Improvements Made

### Content Enhancements:
- ✅ Professional greeting with clear welcome message
- ✅ Clear account details section showing email and status
- ✅ Prominent call-to-action button
- ✅ Security note about link expiration
- ✅ "What's next" section explaining account benefits
- ✅ Help/support information
- ✅ Professional footer with branding

### Design Enhancements:
- ✅ Modern, responsive design that works on all devices
- ✅ Mobile-friendly layout
- ✅ Clear visual hierarchy
- ✅ Professional gradient color scheme
- ✅ Consistent branding throughout

### User Experience:
- ✅ Clear, concise instructions
- ✅ Reduced cognitive load
- ✅ Trust-building elements (security note)
- ✅ Accessibility considerations

## 🎨 Color Customization

To match your brand colors, update these CSS values in the HTML template:
- Primary gradient: `#667eea` and `#764ba2` (currently purple gradient)
- Button color: Same gradient
- Accent color: `#667eea`

Example for a red/orange theme:
- Change `#667eea` to `#dc2626` (red)
- Change `#764ba2` to `#ea580c` (orange)

## 📱 Testing Checklist

- [ ] Email renders correctly in Gmail
- [ ] Email renders correctly in Outlook
- [ ] Email renders correctly on mobile devices
- [ ] Confirmation link works correctly
- [ ] All variables are replaced correctly
- [ ] Spam score is low (use Mail-Tester.com)
- [ ] Email is accessible (screen reader friendly)

## 🔧 Advanced: Including Staff Name

To include the staff member's name in the email, you would need to:

**Option 1: Use Supabase Edge Functions**
Create an edge function that fetches staff details and sends a custom email.

**Option 2: Modify After Confirmation**
Send a welcome email after confirmation using a database trigger.

**Option 3: Use Magic Link with Metadata**
Store staff name in user metadata when creating the account, then use it in custom templates.

## 📝 Current Code Reference

In `src/ManageStaff.jsx`, the staff creation process:
```javascript
await supabaseAdmin.auth.admin.createUser({
  email: staffEmail,
  password: staffPassword,
  email_confirm: false,
});

// Send confirmation email
await supabaseAdmin.auth.resend({
  type: 'signup',
  email: staffEmail,
});
```

## 📞 Support

For questions about email templates or implementation:
- [Supabase Email Templates Documentation](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Go Template Syntax](https://pkg.go.dev/text/template)

