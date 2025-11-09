-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'planning',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on status
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Note: Sample data insertion removed to prevent duplicate projects on each deployment
-- If you need sample data, insert it manually or use a separate seed script
