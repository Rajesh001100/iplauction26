require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
  const { data, error } = await supabase.from('players').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('PLAYER_COLUMNS:' + Object.keys(data[0]).join(','));
  }
}

checkSchema();
