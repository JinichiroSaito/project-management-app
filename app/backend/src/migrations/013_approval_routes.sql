-- Manage approval routes and final approvers by amount threshold

CREATE TABLE IF NOT EXISTS approval_routes (
  id SERIAL PRIMARY KEY,
  amount_threshold VARCHAR(20) UNIQUE NOT NULL, -- '<100m' or '>=100m'
  reviewer_ids INT[] NOT NULL DEFAULT '{}',      -- parallel reviewers
  final_approver_user_id INT,                    -- G-CGO or G-CEO user id
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE approval_routes
  ADD CONSTRAINT chk_amount_threshold CHECK (amount_threshold IN ('<100m', '>=100m'));

-- Track final approver and reviewer approvals per project
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS final_approver_user_id INT,
  ADD COLUMN IF NOT EXISTS reviewer_approvals JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_final_approver ON projects(final_approver_user_id);

