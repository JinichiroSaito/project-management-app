-- Add project phase (step) column to projects table
-- Phase values: mvp_development, business_launch, business_stabilization
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_phase VARCHAR(50) DEFAULT 'mvp_development';

-- Create index on project_phase
CREATE INDEX IF NOT EXISTS idx_projects_project_phase ON projects(project_phase);

-- Update existing approved projects to have a default phase
UPDATE projects 
SET project_phase = 'mvp_development' 
WHERE project_phase IS NULL AND application_status = 'approved';

-- Update existing projects with 'ideation' phase to 'mvp_development'
UPDATE projects 
SET project_phase = 'mvp_development' 
WHERE project_phase = 'ideation';

