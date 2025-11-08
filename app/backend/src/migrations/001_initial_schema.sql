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

-- Insert sample data
INSERT INTO projects (name, description, status) VALUES
  ('Project Alpha', 'First project - Alpha development', 'active'),
  ('Project Beta', 'Beta testing phase', 'planning'),
  ('Project Gamma', 'Completed gamma release', 'completed')
ON CONFLICT DO NOTHING;
