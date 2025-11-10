-- Replace section 2-10 columns with file upload support
-- Remove detailed section columns and add file upload columns

ALTER TABLE projects 
DROP COLUMN IF EXISTS section_2_target_customers,
DROP COLUMN IF EXISTS section_3_customer_problems,
DROP COLUMN IF EXISTS section_4_solution_hypothesis,
DROP COLUMN IF EXISTS section_5_differentiation,
DROP COLUMN IF EXISTS section_6_market_potential,
DROP COLUMN IF EXISTS section_7_revenue_model,
DROP COLUMN IF EXISTS section_8_1_ideation_plan,
DROP COLUMN IF EXISTS section_8_2_mvp_plan,
DROP COLUMN IF EXISTS section_9_execution_plan,
DROP COLUMN IF EXISTS section_10_strategic_alignment;

-- Add file upload columns
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS application_file_url TEXT, -- Cloud Storage URL
ADD COLUMN IF NOT EXISTS application_file_name VARCHAR(255), -- Original file name
ADD COLUMN IF NOT EXISTS application_file_type VARCHAR(50), -- File type (ppt, pdf, etc.)
ADD COLUMN IF NOT EXISTS application_file_size BIGINT, -- File size in bytes
ADD COLUMN IF NOT EXISTS application_file_uploaded_at TIMESTAMP WITH TIME ZONE; -- Upload timestamp

-- Create index on file upload timestamp
CREATE INDEX IF NOT EXISTS idx_projects_file_uploaded_at ON projects(application_file_uploaded_at);

