-- ============================================
-- USER PROFILES TABLE SETUP
-- Tracks free report claims and subscription status
-- ============================================

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  
  -- Free report tracking
  has_claimed_free_report BOOLEAN DEFAULT FALSE,
  free_report_claimed_at TIMESTAMPTZ,
  
  -- Subscription information
  subscription_type TEXT DEFAULT 'none' CHECK (subscription_type IN ('none', 'monthly', 'quarterly', 'annual', 'one-time')),
  subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'cancelled', 'inactive', 'expired')),
  subscription_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  
  -- Stripe integration
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer ON user_profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status ON user_profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_expires ON user_profiles(subscription_expires_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Service role has full access (for webhooks)
CREATE POLICY "Service role has full access"
  ON user_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- PAYMENT TRANSACTIONS TABLE
-- Tracks all payment history
-- ============================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Stripe information
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Transaction details
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
  
  -- Plan information
  plan_type TEXT NOT NULL,
  plan_name TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_payment ON payment_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created ON payment_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON payment_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to transactions"
  ON payment_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  profile RECORD;
BEGIN
  SELECT subscription_status, subscription_expires_at
  INTO profile
  FROM user_profiles
  WHERE id = user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if subscription is active and not expired
  IF profile.subscription_status = 'active' AND 
     (profile.subscription_expires_at IS NULL OR profile.subscription_expires_at > NOW()) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access puzzles
CREATE OR REPLACE FUNCTION can_access_puzzles(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN has_active_subscription(user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's subscription tier
CREATE OR REPLACE FUNCTION get_subscription_tier(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  profile RECORD;
BEGIN
  SELECT subscription_type, subscription_status, subscription_expires_at
  INTO profile
  FROM user_profiles
  WHERE id = user_id;
  
  IF NOT FOUND THEN
    RETURN 'none';
  END IF;
  
  -- Check if subscription is active
  IF profile.subscription_status = 'active' AND 
     (profile.subscription_expires_at IS NULL OR profile.subscription_expires_at > NOW()) THEN
    RETURN profile.subscription_type;
  END IF;
  
  RETURN 'none';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INITIAL DATA SETUP
-- ============================================

-- Create user profiles for existing users (if any)
INSERT INTO user_profiles (id, email, subscription_type, subscription_status)
SELECT 
  id, 
  email,
  'none',
  'inactive'
FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TESTING QUERIES
-- ============================================

-- Test 1: View all user profiles
-- SELECT * FROM user_profiles;

-- Test 2: Check if user has claimed free report (replace with your user ID)
-- SELECT id, email, has_claimed_free_report, subscription_type, subscription_status 
-- FROM user_profiles 
-- WHERE email = 'your-email@example.com';

-- Test 3: Check if user has active subscription (get user ID first from Test 2)
-- SELECT has_active_subscription(id) FROM user_profiles WHERE email = 'your-email@example.com';

-- Test 4: Get user's subscription tier (get user ID first from Test 2)
-- SELECT get_subscription_tier(id) FROM user_profiles WHERE email = 'your-email@example.com';

-- Test 5: View payment transactions
-- SELECT * FROM payment_transactions ORDER BY created_at DESC;

-- Test 6: Quick check - Get your user ID
-- SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- ============================================
-- CLEANUP (USE WITH CAUTION)
-- ============================================

-- DROP TABLE IF EXISTS payment_transactions CASCADE;
-- DROP TABLE IF EXISTS user_profiles CASCADE;
-- DROP FUNCTION IF EXISTS has_active_subscription(UUID);
-- DROP FUNCTION IF EXISTS can_access_puzzles(UUID);
-- DROP FUNCTION IF EXISTS get_subscription_tier(UUID);