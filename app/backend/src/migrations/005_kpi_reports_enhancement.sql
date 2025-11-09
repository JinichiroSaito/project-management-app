-- Enhance KPI Reports table with additional fields
ALTER TABLE kpi_reports
ADD COLUMN IF NOT EXISTS verification_content TEXT, -- 検証する内容
ADD COLUMN IF NOT EXISTS planned_date DATE, -- 予定の年月
ADD COLUMN IF NOT EXISTS planned_budget DECIMAL(15, 2); -- 使用予定金額

-- Add comment for clarity
COMMENT ON COLUMN kpi_reports.verification_content IS 'Content to be verified in MVP development';
COMMENT ON COLUMN kpi_reports.planned_date IS 'Planned date (year-month) for the report';
COMMENT ON COLUMN kpi_reports.planned_budget IS 'Planned budget amount for this report';

