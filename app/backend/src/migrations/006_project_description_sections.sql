-- Add detailed description sections for project applications
-- Split description into sections 2-10 as per requirements

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS section_2_target_customers TEXT, -- ターゲット顧客
ADD COLUMN IF NOT EXISTS section_3_customer_problems TEXT, -- 顧客課題
ADD COLUMN IF NOT EXISTS section_4_solution_hypothesis TEXT, -- ソリューション仮説
ADD COLUMN IF NOT EXISTS section_5_differentiation TEXT, -- 差別化・自社優位
ADD COLUMN IF NOT EXISTS section_6_market_potential TEXT, -- 市場性
ADD COLUMN IF NOT EXISTS section_7_revenue_model TEXT, -- 収益モデル
ADD COLUMN IF NOT EXISTS section_8_1_ideation_plan TEXT, -- 検証計画 8-1: アイディエーション
ADD COLUMN IF NOT EXISTS section_8_2_mvp_plan TEXT, -- 検証計画 8-2: MVP開発
ADD COLUMN IF NOT EXISTS section_9_execution_plan TEXT, -- 実行計画・体制・予算
ADD COLUMN IF NOT EXISTS section_10_strategic_alignment TEXT; -- 自社戦略との整合

-- Note: section_2 and section_3 are required for ideation phase
-- The old description column is kept for backward compatibility

