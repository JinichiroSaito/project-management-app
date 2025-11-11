-- Fix application_file_type column length
-- MIME types can be longer than 50 characters (e.g., application/vnd.openxmlformats-officedocument.presentationml.presentation)
-- Change from VARCHAR(50) to VARCHAR(255)

ALTER TABLE projects 
ALTER COLUMN application_file_type TYPE VARCHAR(255);

-- Add comment for clarity
COMMENT ON COLUMN projects.application_file_type IS 'File MIME type (e.g., application/pdf, application/vnd.openxmlformats-officedocument.presentationml.presentation)';

