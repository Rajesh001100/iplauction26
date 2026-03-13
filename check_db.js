require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAdminPass() {
  const { data, error } = await supabase.from('global_state').select('*').eq('id', 1).single();
  if (error) {
    console.error('Error fetching state:', error);
  } else {
    console.log('Current Global State in DB:', data);
    console.log('Admin Password is:', data.admin_password || 'NOT SET (NULL)');
  }
}

checkAdminPass();
