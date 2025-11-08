const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    const migrationFile = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_initial_schema.sql'),
      'utf8'
    );
    
    await db.query(migrationFile);
    console.log('✓ Migrations completed successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
