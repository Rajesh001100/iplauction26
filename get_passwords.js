require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    const { data: g } = await s.from('global_state').select('admin_password').eq('id', 1).single();
    const { data: t } = await s.from('teams').select('name,password').order('id');

    let output = '--- ORIGINAL PASSWORDS ---\n';
    output += `Auctioneer (Admin): ${g.admin_password}\n`;
    output += '---------------------------\n';
    t.forEach(team => {
        output += `${team.name.padEnd(35)} : ${team.password}\n`;
    });
    require('fs').writeFileSync('passwords.txt', output);
    console.log('Done. Check passwords.txt');
}
run();
