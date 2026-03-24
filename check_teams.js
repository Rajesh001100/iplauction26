require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('id');
  if (error) {
    console.error('Error fetching teams:', error);
  } else {
    console.log('Current Teams in DB:');
    data.forEach(t => {
      console.log(`${t.id}: ${t.name} - Budget: ${t.budget}, Players: ${JSON.stringify(t.players)}, Eliminated: ${t.isEliminated}`);
    });
  }
}

checkTeams();
