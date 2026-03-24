require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAllTeams() {
  const { data, error } = await supabase.from('teams').select('id, name, budget, players').order('id');
  if (error) {
    console.error('Error:', error);
  } else {
    data.forEach(t => {
      console.log(`TEAM ${t.id}: ${t.name} -> Budget: ${t.budget}, Players Count: ${t.players ? t.players.length : 0}`);
    });
  }
}

checkAllTeams();
