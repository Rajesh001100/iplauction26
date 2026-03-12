const fs = require('fs');
const https = require('https');
const path = require('path');

const fileNames = {
  't1': 'File:Chennai_Super_Kings_Logo.svg',
  't2': 'File:Mumbai_Indians_Logo.svg',
  't3': 'File:Royal_Challengers_Bangalore_Logo.svg',
  't4': 'File:Kolkata_Knight_Riders_Logo.svg',
  't5': 'File:Delhi_Capitals_Logo.svg',
  't6': 'File:Rajasthan_Royals_Logo.svg',
  't7': 'File:Punjab_Kings_Logo.svg',
  't8': 'File:Sunrisers_Hyderabad.svg',
  't9': 'File:Lucknow_Super_Giants_IPL_Logo.svg',
  't10': 'File:Gujarat_Titans_Logo.svg'
};

const dir = path.join(__dirname, 'public', 'logos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

async function getWikiUrl(title) {
  return new Promise((resolve) => {
    const api = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
    https.get(api, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        const pages = json.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pages[pageId].imageinfo) {
           resolve(pages[pageId].imageinfo[0].url);
        } else {
           resolve(null);
        }
      });
    });
  });
}

async function download(url, dest) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(download(res.headers.location.startsWith('http') ? res.headers.location : `https://upload.wikimedia.org${res.headers.location}`, dest));
      } else {
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => resolve(true));
      }
    });
  });
}

(async () => {
  const dbPath = path.join(__dirname, 'database.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  for (const [id, title] of Object.entries(fileNames)) {
    console.log(`Fetching ${title}...`);
    const url = await getWikiUrl(title);
    if (url) {
      console.log(`URL found: ${url}. Downloading...`);
      await download(url, path.join(dir, `${id}.svg`));
      
      const t = db.teams.find(x => x.id === id);
      if (t) t.logo = `/logos/${id}.svg`;
      console.log(`Saved ${id}.svg successfully.`);
    } else {
      console.log(`Failed to find ${title}`);
    }
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('All done. updated DB.');
})();
