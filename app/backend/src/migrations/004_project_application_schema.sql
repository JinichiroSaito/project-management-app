-- Extend projects table with application and review fields
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS executor_id INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS reviewer_id INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS requested_amount DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS application_status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, under_review, approved, rejected
ADD COLUMN IF NOT EXISTS review_comment TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id);

-- Create index on application_status
CREATE INDEX IF NOT EXISTS idx_projects_application_status ON projects(application_status);
CREATE INDEX IF NOT EXISTS idx_projects_executor_id ON projects(executor_id);
CREATE INDEX IF NOT EXISTS idx_projects_reviewer_id ON projects(reviewer_id);

-- KPI Reports table
CREATE TABLE IF NOT EXISTS kpi_reports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL, -- external_mvp, internal_mvp, semi_annual
  period_start DATE,
  period_end DATE,
  kpi_metrics JSONB, -- Store KPI metrics as JSON
  results TEXT,
  budget_used DECIMAL(15, 2),
  budget_allocated DECIMAL(15, 2),
  status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, reviewed
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for KPI reports
CREATE INDEX IF NOT EXISTS idx_kpi_reports_project_id ON kpi_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_kpi_reports_report_type ON kpi_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_kpi_reports_status ON kpi_reports(status);

-- Budget Applications table (for projects >= 500 million yen)
CREATE TABLE IF NOT EXISTS budget_applications (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  application_year INTEGER NOT NULL,
  requested_budget DECIMAL(15, 2) NOT NULL,
  justification TEXT,
  status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, approved, rejected
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by INTEGER REFERENCES users(id),
  review_comment TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, application_year)
);

-- Create indexes for budget applications
CREATE INDEX IF NOT EXISTS idx_budget_applications_project_id ON budget_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_applications_application_year ON budget_applications(application_year);
CREATE INDEX IF NOT EXISTS idx_budget_applications_status ON budget_applications(status);

