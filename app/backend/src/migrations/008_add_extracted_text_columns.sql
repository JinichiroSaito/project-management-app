-- Add columns for extracted text and missing sections analysis
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS extracted_text TEXT, -- Gemini APIで抽出されたテキスト
ADD COLUMN IF NOT EXISTS extracted_text_updated_at TIMESTAMP WITH TIME ZONE, -- 抽出日時
ADD COLUMN IF NOT EXISTS missing_sections JSONB, -- 不足しているセクションの分析結果
ADD COLUMN IF NOT EXISTS missing_sections_updated_at TIMESTAMP WITH TIME ZONE; -- 分析日時

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_projects_extracted_text_updated_at ON projects(extracted_text_updated_at);

