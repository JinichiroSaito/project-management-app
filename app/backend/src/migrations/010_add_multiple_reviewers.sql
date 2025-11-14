-- Add support for multiple reviewers per project
-- Create project_reviewers junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS project_reviewers (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, reviewer_id)
);

-- Create indexes for project_reviewers
CREATE INDEX IF NOT EXISTS idx_project_reviewers_project_id ON project_reviewers(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reviewers_reviewer_id ON project_reviewers(reviewer_id);

-- Migrate existing reviewer_id data to project_reviewers table
INSERT INTO project_reviewers (project_id, reviewer_id, assigned_at)
SELECT id, reviewer_id, created_at
FROM projects
WHERE reviewer_id IS NOT NULL
ON CONFLICT (project_id, reviewer_id) DO NOTHING;

