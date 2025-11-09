-- Add approval token columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS approval_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS approval_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index on approval_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_approval_token ON users(approval_token);

