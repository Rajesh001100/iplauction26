require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Please set SUPABASE_URL and SUPABASE_KEY in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  const dbPath = path.join(__dirname, 'database.json');
  if (!fs.existsSync(dbPath)) {
    console.error('database.json not found.');
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  console.log('Starting migration...');

  // 1. Migrate Teams
  console.log('Migrating teams...');
  const { error: teamsError } = await supabase
    .from('teams')
    .upsert(db.teams);
  if (teamsError) console.error('Error migrating teams:', teamsError);

  // 2. Migrate Players
  console.log('Migrating players...');
  const { error: playersError } = await supabase
    .from('players')
    .upsert(db.players);
  if (playersError) console.error('Error migrating players:', playersError);

  // 3. Migrate Global State
  console.log('Migrating global state...');
  const { error: stateError } = await supabase
    .from('global_state')
    .upsert({ id: 1, ...db.globalState });
  if (stateError) console.error('Error migrating global state:', stateError);

  console.log('Migration complete!');
}

migrate();
