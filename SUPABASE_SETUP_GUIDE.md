# Supabase Setup Guide

This guide will help you set up Supabase for authentication and report storage in your chess analysis application.

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up for a free account or sign in
3. Click "New Project"
4. Choose your organization
5. Fill in project details:
   - **Name**: `pawns-poses-chess` (or any name you prefer)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the closest region to your users
6. Click "Create new project"
7. Wait for the project to be created (takes 1-2 minutes)

## Step 2: Get Your Project Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like: `https://your-project-id.supabase.co`)
   https://qnkuttpdoejeftwpvahk.supabase.co
   - **Anon public key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFua3V0dHBkb2VqZWZ0d3B2YWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDM5NjgsImV4cCI6MjA3NDcxOTk2OH0.Q-6BC2HlIsHnXRzT460LY3Czv9XP7sOcvqh3yE94cnM

## Step 3: Configure Environment Variables

1. Copy your `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your Supabase credentials:
   ```env
   REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your_anon_key_here
   ```

## Step 4: Set Up Authentication

1. In your Supabase dashboard, go to **Authentication** → **Settings**
2. Configure the following settings:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: Add your production domain when deploying
3. Enable email confirmation if desired (recommended for production)

## Step 5: Create Database Tables

The application will automatically create the necessary tables when you first save a report. However, you can manually create them if needed:

1. Go to **SQL Editor** in your Supabase dashboard
2. Run the following SQL to create the reports table:

```sql
-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS reports_user_id_idx ON reports(user_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at DESC);

-- Enable Row Level Security
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Create policy so users can only see their own reports
CREATE POLICY "Users can view their own reports" ON reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports" ON reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" ON reports
  FOR DELETE USING (auth.uid() = user_id);
```

## Step 6: Test the Setup

1. Start your development server:
   ```bash
   npm start
   ```

2. Navigate to `/auth` and try creating an account
3. Check your Supabase dashboard under **Authentication** → **Users** to see if the user was created
4. Try generating a report to test the full flow

## Deployment Notes

When deploying to production:

1. Update your **Site URL** and **Redirect URLs** in Supabase Authentication settings
2. Make sure your production environment variables are set correctly
3. Consider enabling email confirmation for better security

## Troubleshooting

### Common Issues:

1. **"Invalid API key"**: Check that your environment variables are correct and the file is named `.env` (not `.env.example`)

2. **Authentication not working**: Verify your Site URL in Supabase matches your application URL

3. **Database errors**: Check that RLS policies are set up correctly and the user has proper permissions

4. **CORS errors**: Make sure your domain is added to the allowed origins in Supabase

### Getting Help:

- Check the [Supabase Documentation](https://supabase.com/docs)
- Visit the [Supabase Community](https://github.com/supabase/supabase/discussions)
- Check your browser's developer console for detailed error messages

## Security Best Practices

1. Never commit your `.env` file to version control
2. Use strong passwords for your database
3. Enable Row Level Security (RLS) on all tables
4. Regularly rotate your API keys
5. Enable email confirmation in production
6. Monitor your Supabase dashboard for unusual activity

Your authentication system is now ready! Users will need to sign in before generating reports, and their reports will be securely stored in Supabase.