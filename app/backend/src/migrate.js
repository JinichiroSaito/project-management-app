const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const migrationFile = fs.readFileSync(
        path.join(migrationsDir, file),
        'utf8'
      );
      
      await db.query(migrationFile);
      console.log(`✓ ${file} completed`);
    }
    
    console.log('✓ All migrations completed successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
