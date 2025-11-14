-- Add monthly budget and expense tracking for approved projects
CREATE TABLE IF NOT EXISTS project_budget_entries (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  opex_budget DECIMAL(15, 2) DEFAULT 0, -- Opex annual budget allocated to this month
  opex_used DECIMAL(15, 2) DEFAULT 0, -- Opex amount used in this month
  capex_budget DECIMAL(15, 2) DEFAULT 0, -- Capex annual budget allocated to this month
  capex_used DECIMAL(15, 2) DEFAULT 0, -- Capex amount used in this month
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, year, month)
);

-- Create indexes for project_budget_entries
CREATE INDEX IF NOT EXISTS idx_project_budget_entries_project_id ON project_budget_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budget_entries_year_month ON project_budget_entries(year, month);

-- Add annual budget columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS annual_opex_budget DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS annual_capex_budget DECIMAL(15, 2);

