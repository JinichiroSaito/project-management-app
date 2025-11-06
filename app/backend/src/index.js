const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    environment: process.env.ENVIRONMENT || 'dev',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.get('/api/projects', (req, res) => {
  res.json({
    projects: [
      { id: 1, name: 'Project Alpha', status: 'active' },
      { id: 2, name: 'Project Beta', status: 'planning' },
      { id: 3, name: 'Project Gamma', status: 'completed' }
    ]
  });
});

app.get('/api/projects/:id', (req, res) => {
  const id = parseInt(req.params.id);
  res.json({
    id: id,
    name: `Project ${id}`,
    status: 'active',
    description: 'Sample project description',
    createdAt: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.ENVIRONMENT || 'dev'}`);
});
