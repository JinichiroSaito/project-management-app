-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  company VARCHAR(255),
  department VARCHAR(255),
  position VARCHAR(255),
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Insert initial admin user
INSERT INTO users (firebase_uid, email, is_admin, is_approved, name)
VALUES ('admin-initial', 'jinichirou.saitou@asahi-gh.com', TRUE, TRUE, 'Admin User')
ON CONFLICT (email) DO UPDATE SET is_admin = TRUE, is_approved = TRUE;

