# Craftable Onboarding Portal

A customer onboarding portal for Craftable, built with Next.js + Supabase.

## Quick Start (15 minutes)

### Step 1: Set Up Supabase Database (5 min)

1. Go to [supabase.com](https://supabase.com) → your project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase-schema.sql` and paste it
5. Click **Run** (or Cmd+Enter)
6. You should see "Success" messages

### Step 2: Enable Email Auth (2 min)

1. In Supabase, go to **Authentication** → **Providers**
2. Make sure **Email** is enabled
3. Go to **Authentication** → **URL Configuration**
4. Set **Site URL** to: `http://localhost:3000` (for dev)
5. Add to **Redirect URLs**: `http://localhost:3000/auth/callback`

### Step 3: Create Storage Bucket (1 min)

1. Go to **Storage** in Supabase
2. Click **New Bucket**
3. Name: `customer-files`
4. Public: **OFF** (keep private)
5. Click **Create**

### Step 4: Deploy to Vercel (5 min)

1. Push this code to a GitHub repo
2. Go to [vercel.com](https://vercel.com)
3. Click **New Project** → Import your repo
4. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://pynfywmoagvhdcpelrfx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `[your anon key]`
5. Click **Deploy**

### Step 5: Update Supabase URLs (2 min)

After Vercel gives you a URL (e.g., `craftable-onboarding.vercel.app`):

1. Go back to Supabase → **Authentication** → **URL Configuration**
2. Update **Site URL** to: `https://your-app.vercel.app`
3. Add to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

## How It Works

### For Customers
1. Customer goes to your portal URL
2. Enters their email → receives magic link
3. Clicks link → taken to their dashboard
4. Checks off tasks, adds notes
5. Progress saves automatically

### For Admins (you)
1. Go to same URL, login with `mat@craftable.com`
2. Automatically redirected to admin dashboard
3. See all customers, their progress, last activity
4. Add new customers (they auto-get all tasks)

## Adding a New Customer

**Option 1: Admin Dashboard**
1. Login as admin
2. Click "Add Customer"
3. Enter name, email, company
4. Done! They can now login via magic link

**Option 2: Supabase Table Editor**
1. Go to Supabase → Table Editor → `customers`
2. Click "Insert row"
3. Fill in: name, email, company, assigned_om
4. Progress rows auto-created by trigger

## Making Changes with Claude Code

### Add a new task
```sql
-- Run in Supabase SQL Editor
INSERT INTO tasks (phase, phase_name, task_name, description, owner, est_time, sort_order, is_success_gate)
VALUES (2, 'Phase 2: Crawl — Weeks 1-2', 'New Task Name', 'Description here', 'Customer', '30 min', 15, FALSE);

-- Add to existing customers
INSERT INTO customer_progress (customer_id, task_id)
SELECT c.id, t.id FROM customers c, tasks t WHERE t.task_name = 'New Task Name';
```

### Add a new column to tasks
1. In Supabase Table Editor, add column to `tasks` table
2. Tell Claude Code: "Add a 'priority' field to the task display in dashboard/page.tsx"

### Change styling
Tell Claude Code: "Change the Phase 2 color from orange to purple"

## File Structure

```
craftable-onboarding/
├── app/
│   ├── page.tsx          # Login page
│   ├── layout.tsx        # Root layout
│   ├── globals.css       # Tailwind + custom styles
│   ├── dashboard/
│   │   └── page.tsx      # Customer dashboard
│   ├── admin/
│   │   └── page.tsx      # Admin dashboard
│   └── auth/
│       └── callback/
│           └── page.tsx  # Magic link handler
├── lib/
│   └── supabase.ts       # Supabase client + types
├── .env.local            # Environment variables
└── supabase-schema.sql   # Database setup
```

## Troubleshooting

### "Customer not found" after login
- Check that customer email exists in `customers` table
- Email must match exactly (case-sensitive)

### Magic link not arriving
- Check spam folder
- Verify email provider isn't blocking Supabase
- Check Supabase Auth logs

### Progress not saving
- Check browser console for errors
- Verify RLS policies are set correctly
- Make sure customer_progress row exists for that customer/task

## Cost

**$0/month** for your scale:
- Supabase Free: 500MB database, 50k monthly active users
- Vercel Free: 100GB bandwidth
- No paid services required
// Trigger redeploy
Mon Feb 16 12:55:58 PST 2026
