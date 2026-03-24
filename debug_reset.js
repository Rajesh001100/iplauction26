require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function debugReset() {
  console.log('Attempting to reset teams in Supabase (WITHOUT isEliminated)...');
  const { data, error } = await supabase.from('teams').update({
    budget: 10000,
    players: []
  }).neq('id', 'all_reset_placeholder').select();

  if (error) {
    console.error('Error resetting teams:', error);
  } else {
    console.log('Reset success. Updated rows:', data ? data.length : 0);
    if (data) {
      data.forEach(t => {
        console.log(`Updated ${t.id}: ${t.name} - Budget: ${t.budget}`);
      });
    }
  }
}

debugReset();
