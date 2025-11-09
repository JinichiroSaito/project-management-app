require('dotenv').config();
const db = require('../db');

async function updateUserPosition() {
  try {
    const email = 'jinichirou.saitou@asahi-gh.com';
    const position = 'executor';
    
    console.log(`Updating position for ${email} to ${position}...`);
    
    const result = await db.query(
      'UPDATE users SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING *',
      [position, email]
    );
    
    if (result.rows.length === 0) {
      console.log(`User with email ${email} not found`);
      process.exit(1);
    }
    
    console.log('✓ User updated successfully:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating user position:', error);
    process.exit(1);
  }
}

updateUserPosition();

