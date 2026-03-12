require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runUpdates() {
  console.log('🔄 Adding password column to teams table...');
  
  // Note: This might fail if column already exists, which is fine.
  const { error: alterError } = await supabase.rpc('execute_sql', {
    sql_query: 'ALTER TABLE teams ADD COLUMN IF NOT EXISTS password TEXT;'
  });

  // RPC might not be enabled, so we'll just try to upsert with the new field.
  // Supabase upsert will usually work if the column exists.
  
  const dbPath = path.join(__dirname, 'database.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  console.log('📤 Uploading updated teams with passwords...');
  const { error: teamsError } = await supabase
    .from('teams')
    .upsert(db.teams);

  if (teamsError) {
    if (teamsError.message.includes('column "password" of relation "teams" does not exist')) {
      console.error('❌ ERROR: The "password" column does not exist in your Supabase "teams" table.');
      console.log('👉 ACTION REQUIRED: Please go to the Supabase SQL Editor and run:');
      console.log('   ALTER TABLE teams ADD COLUMN password TEXT;');
    } else {
      console.error('Error during migration:', teamsError);
    }
  } else {
    console.log('✅ Teams updated successfully with passwords!');
  }
}

runUpdates();
