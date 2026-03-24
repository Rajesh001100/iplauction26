require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSnakeCase() {
  const { data, error } = await supabase.from('teams').select('is_combined').limit(1); // Wait, I meant is_eliminated
  // Let's just try to select everything and see keys again, but I'll make sure to get ALL columns.
  const { data: d2, error: e2 } = await supabase.from('teams').select('*').limit(1);
  if (e2) console.error(e2);
  else console.log('KEYS:' + Object.keys(d2[0]).join(','));
}

checkSnakeCase();
