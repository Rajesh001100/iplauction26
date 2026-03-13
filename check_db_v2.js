require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAdminPass() {
  const { data, error } = await supabase.from('global_state').select('*').eq('id', 1).single();
  if (error) {
    console.log('DB_ERROR: ' + error.message);
  } else {
    console.log('ADMIN_PASS_VALUE: ' + (data.admin_password || 'NULL'));
  }
}

checkAdminPass();
