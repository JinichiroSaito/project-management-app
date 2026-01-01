-- Add support for additional materials and messages from executors to reviewers
-- This allows executors to respond to rejections by uploading additional files and sending messages

-- Project additional materials table
CREATE TABLE IF NOT EXISTS project_additional_materials (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  file_size BIGINT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  message TEXT, -- Optional message with the file
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for project_additional_materials
CREATE INDEX IF NOT EXISTS idx_project_additional_materials_project_id ON project_additional_materials(project_id);
CREATE INDEX IF NOT EXISTS idx_project_additional_materials_uploaded_by ON project_additional_materials(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_project_additional_materials_uploaded_at ON project_additional_materials(uploaded_at);

-- Project messages table (for communication between executors and reviewers)
CREATE TABLE IF NOT EXISTS project_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER REFERENCES users(id), -- NULL means message to all reviewers
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP WITH TIME ZONE -- When the message was read
);

-- Create indexes for project_messages
CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_from_user_id ON project_messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_to_user_id ON project_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_created_at ON project_messages(created_at);

