const fs = require('fs');
const https = require('https');
const path = require('path');

const logos = {
  't1': 'https://upload.wikimedia.org/wikipedia/en/2/2b/Chennai_Super_Kings_Logo.svg',
  't2': 'https://upload.wikimedia.org/wikipedia/en/c/cd/Mumbai_Indians_Logo.svg',
  't3': 'https://upload.wikimedia.org/wikipedia/en/2/2a/Royal_Challengers_Bangalore_2020.svg',
  't4': 'https://upload.wikimedia.org/wikipedia/en/4/4c/Kolkata_Knight_Riders_Logo.svg',
  't5': 'https://upload.wikimedia.org/wikipedia/en/f/f5/Delhi_Capitals_Logo.svg',
  't6': 'https://upload.wikimedia.org/wikipedia/en/6/60/Rajasthan_Royals_Logo.svg',
  't7': 'https://upload.wikimedia.org/wikipedia/en/d/d4/Punjab_Kings_Logo.svg',
  't8': 'https://upload.wikimedia.org/wikipedia/en/8/81/Sunrisers_Hyderabad.svg',
  't9': 'https://upload.wikimedia.org/wikipedia/en/a/a9/Lucknow_Super_Giants_IPL_Logo.svg',
  't10': 'https://upload.wikimedia.org/wikipedia/en/0/09/Gujarat_Titans_Logo.svg'
};

const dir = path.join(__dirname, 'public', 'logos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const ids = Object.keys(logos);
const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } };

async function downloadSequentially() {
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const url = logos[id];
    console.log(`Downloading ${id}...`);
    
    await new Promise((resolve) => {
      const getFile = (u) => {
        https.get(u, options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            getFile(res.headers.location.startsWith('http') ? res.headers.location : `https://upload.wikimedia.org${res.headers.location}`);
          } else if (res.statusCode === 429) {
            console.log("Ratelimited, waiting 3 seconds...");
            setTimeout(() => getFile(u), 3000);
          } else {
            const file = fs.createWriteStream(path.join(dir, `${id}.svg`));
            res.pipe(file);
            file.on('finish', () => {
              file.close();
              setTimeout(resolve, 1500); // 1.5s delay between requests to avoid 429
            });
          }
        }).on('error', err => {
          console.error(err);
          resolve();
        });
      };
      getFile(url);
    });
  }
  console.log("Downloads finished!");
}

downloadSequentially();
