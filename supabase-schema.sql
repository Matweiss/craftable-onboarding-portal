-- ============================================
-- CRAFTABLE ONBOARDING PORTAL - SUPABASE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- ============================================
-- 1. CUSTOMERS TABLE
-- ============================================
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  company TEXT,
  phone TEXT,
  assigned_om TEXT DEFAULT 'Unassigned',
  start_date DATE DEFAULT CURRENT_DATE,
  current_phase INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. TASKS TABLE (Master template - same for all customers)
-- ============================================
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phase INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  description TEXT,
  owner TEXT DEFAULT 'Customer',
  est_time TEXT,
  sort_order INTEGER NOT NULL,
  is_success_gate BOOLEAN DEFAULT FALSE,
  unlocks_report TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. CUSTOMER_PROGRESS TABLE (Per-customer task status)
-- ============================================
CREATE TABLE customer_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  file_url TEXT,
  file_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, task_id)
);

-- ============================================
-- 4. ADMIN USERS TABLE
-- ============================================
CREATE TABLE admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. REPORTS TABLE
-- ============================================
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phase INTEGER NOT NULL,
  description TEXT,
  key_metric TEXT,
  report_url TEXT,
  sort_order INTEGER
);

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks are viewable by everyone" ON tasks FOR SELECT USING (true);
CREATE POLICY "Reports are viewable by everyone" ON reports FOR SELECT USING (true);

CREATE POLICY "Customers can view own record" ON customers FOR SELECT USING (
  auth.jwt() ->> 'email' = email
  OR EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Admins can update customers" ON customers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Admins can insert customers" ON customers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Customers can view own progress" ON customer_progress FOR SELECT USING (
  customer_id IN (SELECT id FROM customers WHERE email = auth.jwt() ->> 'email')
  OR EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Customers can update own progress" ON customer_progress FOR UPDATE USING (
  customer_id IN (SELECT id FROM customers WHERE email = auth.jwt() ->> 'email')
  OR EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Customers can insert own progress" ON customer_progress FOR INSERT WITH CHECK (
  customer_id IN (SELECT id FROM customers WHERE email = auth.jwt() ->> 'email')
  OR EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Admins can view admin list" ON admin_users FOR SELECT USING (
  EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt() ->> 'email')
);

-- ============================================
-- 7. SEED DATA: ADMIN USERS
-- ============================================
INSERT INTO admin_users (email, name, role) VALUES
  ('mat@craftable.com', 'Mat', 'admin');

-- ============================================
-- 8. SEED DATA: TASKS
-- ============================================
INSERT INTO tasks (phase, phase_name, task_name, description, owner, est_time, sort_order, is_success_gate, unlocks_report) VALUES
(0, 'Phase 0: Before We Start', 'Complete Preflight Checklist', 'Fill out vendor and category loaders provided by Sales Rep', 'Customer', '30-60 min', 1, FALSE, NULL),
(0, 'Phase 0: Before We Start', 'Gather 60-90 Days of Invoices', 'Scan invoices and have ready to share digitally during Kickoff Call', 'Customer', '30-60 min', 2, FALSE, NULL),
(0, 'Phase 0: Before We Start', 'Schedule Kickoff Call', 'Use the calendar link from your Sales Rep', 'Customer', '5 min', 3, TRUE, NULL),
(1, 'Phase 1: Immediate — Days 1-6', 'Kickoff Call', 'Walk through the onboarding process and share reports and tools', 'Both', '30-45 min', 4, FALSE, NULL),
(1, 'Phase 1: Immediate — Days 1-6', 'Confirm Tech Connections', 'POS and accounting integrations typically live within 1 business day', 'Customer', '10 min', 5, FALSE, 'Heartbeat Analytics'),
(1, 'Phase 1: Immediate — Days 1-6', 'Invoice Upload', 'Share invoices with Onboarding Manager', 'Customer', '10 min', 6, FALSE, NULL),
(1, 'Phase 1: Immediate — Days 1-6', 'Ops Group & GL Mappings', 'Configure ops groups and GL mappings in Books', 'Customer', '45-90 min', 7, FALSE, 'Sales by Hour'),
(1, 'Phase 1: Immediate — Days 1-6', 'App Install', 'Download Craftable app (App Store/Google Play)', 'Customer', '15 min', 8, TRUE, 'Labor by Hour'),
(2, 'Phase 2: Crawl — Weeks 1-2', 'Approve Item Template', 'Review with your Onboarding Manager for duplicate/dead items', 'Customer', '30-45 min', 9, FALSE, 'Invoice Summary Report'),
(2, 'Phase 2: Crawl — Weeks 1-2', 'Mapping New Invoices', 'Map new items and pack sizes to your inventory', 'Customer', '10 min', 10, FALSE, 'Descending Dollar'),
(2, 'Phase 2: Crawl — Weeks 1-2', 'Build Storage Areas', 'Walk-in, Dry Storage, Bar — all in walking order', 'Customer', '10 min', 11, FALSE, NULL),
(2, 'Phase 2: Crawl — Weeks 1-2', 'Assign Bins', 'Shelf-to-sheet setup so counting matches your layout', 'Customer', '45-90 min', 12, FALSE, NULL),
(2, 'Phase 2: Crawl — Weeks 1-2', 'Build Prep Items', 'Sauces, batches, anything made from multiple ingredients', 'Customer', '15 min', 13, FALSE, NULL),
(2, 'Phase 2: Crawl — Weeks 1-2', 'Prep for First Inventory', 'Confirm bins and storage areas, scan and save UPC barcodes', 'Customer', '45-90 min', 14, TRUE, 'Best Price Report'),
(3, 'Phase 3: Walk — Weeks 3-4', 'Set Par Levels', 'Minimum stock you need, set up preferred vendors, qty min, etc.', 'Customer', '60 min', 15, FALSE, 'Consumption Details'),
(3, 'Phase 3: Walk — Weeks 3-4', 'Train Staff on Depletions', 'Logging spills, waste, comps in the app', 'Customer', '30 min', 16, FALSE, NULL),
(3, 'Phase 3: Walk — Weeks 3-4', 'First Audit', 'Track items that need to be added to your inventory', 'Customer', 'Varies', 17, FALSE, 'Invoice Cost Details'),
(3, 'Phase 3: Walk — Weeks 3-4', 'Place First Order', 'Order to Par button builds your cart automatically', 'Customer', '30 min', 18, TRUE, 'Operations Statement'),
(4, 'Phase 4: Run — Month 2+', 'Build Pours', 'Shots, wine-by-the-glass, so sales deduct correctly', 'Customer', '30 min', 19, FALSE, NULL),
(4, 'Phase 4: Run — Month 2+', 'Build Recipes', '80/20 rule: top 20 items that make up 80% of sales', 'Customer', '2-3 hrs', 20, FALSE, NULL),
(4, 'Phase 4: Run — Month 2+', 'POS Mappings', 'Burger button deducts bun + patty + toppings', 'Customer', '45 min', 21, FALSE, 'Actual vs Theoretical'),
(4, 'Phase 4: Run — Month 2+', 'Map Modifiers', 'Double Shot or Extra Cheese deplete the right amount', 'Customer', '30 min', 22, FALSE, NULL),
(4, 'Phase 4: Run — Month 2+', 'Second Audit Count', 'Track items that need to be added to your inventory', 'Customer', 'Varies', 23, FALSE, 'Menu Engineering'),
(4, 'Phase 4: Run — Month 2+', 'Review Reports', 'Shows where actual vs. expected do not match', 'Customer', '15 min', 24, TRUE, 'Cost Summary by Ops Group');

-- ============================================
-- 9. SEED DATA: REPORTS
-- ============================================
INSERT INTO reports (name, phase, description, key_metric, sort_order) VALUES
('Heartbeat Analytics', 1, 'Real-time sales vs. labor in 15-min intervals', 'Labor % Spikes', 1),
('Sales by Hour', 1, 'Revenue patterns throughout day', 'Low PGA during Happy Hour', 2),
('Labor by Hour', 1, 'How much you are paying your staff', 'Overtime alerts', 3),
('Daily Prime Cost Flash', 1, 'Labor + Purchases as % of sales', 'Prime Cost > 65%', 4),
('Invoice Summary Report', 2, 'Volume of invoices approved vs. unapproved', 'High backlog', 5),
('Descending Dollar', 2, 'Prices paid per item across all stores', 'Contracted pricing', 6),
('Best Price Report', 2, 'Comparison of price paid vs. lowest you have paid', 'Potential savings', 7),
('Consumption Details', 3, 'Days on Hand - Cash tied up in inventory', 'Items sitting too long', 8),
('Invoice Cost Details', 3, 'High cost items sitting on shelf', 'Dead inventory', 9),
('Operations Statement', 3, 'High level view of financial health', 'Buying more than selling', 10),
('Actual vs Theoretical', 4, 'Where product is disappearing', 'Variance alerts', 11),
('Menu Engineering', 4, 'Stars, dogs, pricing opportunities', 'Menu optimization', 12),
('Cost Summary by Ops Group', 4, 'COGS Report', 'Cost % by category', 13);

-- ============================================
-- 10. SEED DATA: TEST CUSTOMERS
-- ============================================
INSERT INTO customers (name, email, company, assigned_om) VALUES
('US Burger Shack', 'owner@usburgershack.com', 'US Burger Shack', 'Mat'),
('Taco Town', 'gm@tacotown.com', 'Taco Town', 'Mat');

-- ============================================
-- 11. INITIALIZE PROGRESS FOR TEST CUSTOMERS
-- ============================================
INSERT INTO customer_progress (customer_id, task_id)
SELECT c.id, t.id FROM customers c CROSS JOIN tasks t;

-- ============================================
-- 12. AUTO-CREATE PROGRESS TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION create_customer_progress()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO customer_progress (customer_id, task_id)
  SELECT NEW.id, t.id FROM tasks t;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_customer_created
  AFTER INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION create_customer_progress();

-- ============================================
-- 13. TIMESTAMP UPDATE TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_timestamp
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_progress_timestamp
  BEFORE UPDATE ON customer_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();
