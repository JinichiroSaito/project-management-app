-- Add project phase (step) column to projects table
-- Phase values: ideation, mvp_development, business_launch, business_stabilization
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_phase VARCHAR(50) DEFAULT 'ideation';

-- Create index on project_phase
CREATE INDEX IF NOT EXISTS idx_projects_project_phase ON projects(project_phase);

-- Update existing approved projects to have a default phase
UPDATE projects 
SET project_phase = 'ideation' 
WHERE project_phase IS NULL AND application_status = 'approved';

