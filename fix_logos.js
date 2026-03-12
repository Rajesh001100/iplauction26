const fs = require('fs');
const https = require('https');
const path = require('path');

const sites = {
  't1': 'https://www.chennaisuperkings.com',
  't2': 'https://www.mumbaiindians.com',
  't3': 'https://www.royalchallengers.com',
  't4': 'https://www.kkr.in',
  't5': 'https://www.delhicapitals.in',
  't6': 'https://www.rajasthanroyals.com',
  't7': 'https://www.punjabkingsipl.in',
  't8': 'https://www.sunrisershyderabad.in',
  't9': 'https://www.lucknowsupergiants.in',
  't10': 'https://www.gujarattitansipl.com'
};

const dir = path.join(__dirname, 'public', 'logos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

async function downloadFavicon(id, url) {
  const gApiUrl = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=256`;
  return new Promise((resolve) => {
    https.get(gApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
       const file = fs.createWriteStream(path.join(dir, `${id}.png`));
       res.pipe(file);
       file.on('finish', () => resolve());
    });
  });
}

(async () => {
  for (const [id, url] of Object.entries(sites)) {
    await downloadFavicon(id, url);
    console.log(`Downloaded ${id}`);
  }

  // Update DB
  const dbPath = path.join(__dirname, 'database.json');
  if (fs.existsSync(dbPath)) {
     const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
     db.teams.forEach(t => t.logo = `/logos/${t.id}.png`);
     fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }

  // Update server.js
  const sPath = path.join(__dirname, 'server.js');
  let code = fs.readFileSync(sPath, 'utf8');
  code = code.replace(/\/logos\/t(\d+)\.svg/g, '/logos/t$1.png');
  fs.writeFileSync(sPath, code);

  console.log('All fixed!');
})();
