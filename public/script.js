const socket = io({
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true
});

socket.on('connect', () => {
  const statusEl = document.getElementById('conn-status');
  if (statusEl) {
    statusEl.textContent = 'Live';
    statusEl.style.background = 'var(--success)';
  }
});

socket.on('disconnect', () => {
  const statusEl = document.getElementById('conn-status');
  if (statusEl) {
    statusEl.textContent = 'Offline';
    statusEl.style.background = 'var(--danger)';
  }
});

// State
let currentUser = null; // { role: 'admin' | 'team' | 'viewer', id?: 't1' }
let appState = {
  teams: [],
  players: [],
  globalState: {
    activePlayerId: null,
    currentBid: 0,
    currentBidderId: null,
    timer: 0
  }
};
let currentTab = 'upcoming';
let currentRoleFilter = 'all';
let searchQuery = '';

// Audio Effects
const soldSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'); // Celebration/Tada sound

function formatMoney(lakhs) {
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2)} Cr`;
  }
  return `₹${lakhs} L`;
}

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const roleSelect = document.getElementById('role');
const welcomeMsg = document.getElementById('welcome-msg');
const logoutBtn = document.getElementById('logout-btn');

const noActivePlayer = document.getElementById('no-active-player');
const activePlayerCard = document.getElementById('active-player-card');
const auctionControls = document.getElementById('auction-controls');
const adminControls = document.getElementById('admin-controls');
const teamControls = document.getElementById('team-controls');

const playersContainer = document.getElementById('players-container');
const teamsContainer = document.getElementById('teams-container');
const tabBtns = document.querySelectorAll('.tab-btn');

const adminAddPlayer = document.getElementById('admin-add-player');
const btnNewPlayer = document.getElementById('btn-new-player');
const playerModal = document.getElementById('player-modal');
const playerForm = document.getElementById('player-form');
const closeBtn = document.querySelector('.close-btn');

const squadModal = document.getElementById('squad-modal');
const squadTitle = document.getElementById('squad-title');
const squadSummary = document.getElementById('squad-stats-summary');
const squadPlayersList = document.getElementById('squad-players-list');
const closeSquadBtn = document.querySelector('.close-squad-btn');

// Sold Animation Elements
const soldOverlay = document.getElementById('sold-overlay');
const soldPlayerImg = document.getElementById('sold-player-img');
const soldPlayerName = document.getElementById('sold-player-name');
const soldTeamLogo = document.getElementById('sold-team-logo');
const soldTeamName = document.getElementById('sold-team-name');
const soldPrice = document.getElementById('sold-price');

// Leaderboard Elements
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardContainer = document.getElementById('leaderboard-container');
const closeLeaderboardBtn = document.querySelector('.close-leaderboard-btn');
const btnLeaderboard = document.getElementById('btn-leaderboard');

// --- Initialization ---

// Wait for initial state to populate login dropdown
socket.on('initialState', (state) => {
  appState = state;
  populateLoginDropdown();
  if (appState.globalState && appState.globalState.timerEndTime) {
    startClientTimer(appState.globalState.timerEndTime);
  }
  if (currentUser) {
    renderApp();
  }
});

socket.on('stateUpdate', (partialState) => {
  appState = { ...appState, ...partialState };
  if (appState.globalState && appState.globalState.timerEndTime) {
    startClientTimer(appState.globalState.timerEndTime);
  } else if (appState.globalState && !appState.globalState.timerEndTime) {
    if (clientTimerInterval) clearInterval(clientTimerInterval);
  }
  if (currentUser) {
    renderApp();
  }
});

socket.on('auctionError', (msg) => {
  alert('Auction Rule Warning: ' + msg);
});

socket.on('playerSold', (data) => {
  soldSound.play().catch(e => console.log("Sound play failed", e));
  showSoldAnimation(data);
});

let clientTimerInterval = null;
function startClientTimer(endTime) {
  if (clientTimerInterval) clearInterval(clientTimerInterval);
  updateTimerUI(endTime);
  clientTimerInterval = setInterval(() => updateTimerUI(endTime), 100);
}

function updateTimerUI(endTime) {
  const timerVal = document.getElementById('timer-value');
  if (!timerVal) return;

  const now = Date.now();
  const remaining = endTime ? Math.max(0, Math.ceil((endTime - now) / 1000)) : 0;
  
  // Only update if the value actually changed
  if (remaining !== parseInt(timerVal.textContent)) {
    // Prevent overwriting the "Bidding Ended" text if the timer finished
    if (remaining === 0 && timerVal.textContent === "Bidding Ended") return;

    timerVal.textContent = remaining > 0 ? remaining : "0";
    
    if (remaining <= 5 && remaining > 0) {
      timerVal.classList.add('timer-low');
    } else {
      timerVal.classList.remove('timer-low');
    }
    
    // Manage bidding buttons
    if (remaining === 0) {
       document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = true);
    } else {
       document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = false);
    }
  }
}

socket.on('timerUpdate', (data) => {
  const seconds = typeof data === 'object' ? data.seconds : data;
  const endTime = typeof data === 'object' ? data.endTime : null;

  appState.globalState.timer = seconds;
  appState.globalState.timerEndTime = endTime;

  if (endTime) {
    startClientTimer(endTime);
  } else {
    if (clientTimerInterval) clearInterval(clientTimerInterval);
    const timerVal = document.getElementById('timer-value');
    if (timerVal) timerVal.textContent = seconds || "0";
  }
});

socket.on('auctionTimeout', () => {
  if (clientTimerInterval) clearInterval(clientTimerInterval);
  document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = true);
  const timerVal = document.getElementById('timer-value');
  if (timerVal) {
    timerVal.textContent = "Bidding Ended";
    timerVal.classList.add('timer-low');
  }
  const auctionControlsDisplay = document.getElementById('team-controls');
  if (auctionControlsDisplay) {
    auctionControlsDisplay.style.opacity = '0.5';
    auctionControlsDisplay.style.pointerEvents = 'none';
  }
});

function populateLoginDropdown() {
  const rs = document.getElementById('role');
  if (!rs) return;
  
  let html = `<option value="" disabled selected>Select Role...</option>`;
  html += `<option value="admin">Auctioneer (Admin)</option>`;
  
  if (appState.teams && appState.teams.length > 0) {
    html += `<option disabled>--- Franchises ---</option>`;
    appState.teams.forEach(team => {
      html += `<option value="${team.id}">${team.name}</option>`;
    });
  }
  
  rs.innerHTML = html;
}

// --- Login & Logout ---
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pwd = document.getElementById('password').value;
  const roleVal = roleSelect.value;
  
  const loginData = {
    role: roleVal === 'admin' ? 'admin' : 'team',
    teamId: roleVal === 'admin' ? null : roleVal,
    password: pwd
  };

  socket.emit('login', loginData, (res) => {
    if (res.success) {
      currentUser = {
        role: res.role,
        id: res.teamId
      };

      loginScreen.classList.add('hidden');
      mainApp.classList.remove('hidden');

      if (currentUser.role === 'admin') {
        welcomeMsg.textContent = 'Welcome, AuctioneerDesk';
        document.body.classList.add('is-admin');
        document.body.classList.remove('is-team');
        document.documentElement.style.setProperty('--primary', '#d4af37');
        document.documentElement.style.setProperty('--primary-hover', '#ffd700');
      } else {
        const team = appState.teams.find(t => t.id === currentUser.id);
        welcomeMsg.textContent = `Franchise: ${team.name}`;
        document.body.classList.add('is-team');
        document.body.classList.remove('is-admin');
      }

      renderApp();
    } else {
      alert(res.message);
    }
  });
});

const playerSearchInput = document.getElementById('player-search');
if (playerSearchInput) {
  playerSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPlayersList();
  });
}

logoutBtn.addEventListener('click', () => {
  currentUser = null;
  mainApp.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  document.getElementById('password').value = '';
});

// --- UI Rendering ---

function renderApp() {
  updateRoleCounts();
  renderLiveAuction();
  renderPlayersList();
  renderTeamsStats();

  // Admin visibility toggles
  if (currentUser.role === 'admin') {
    adminAddPlayer.classList.remove('hidden');
    adminControls.classList.remove('hidden');
    teamControls.classList.add('hidden');
  } else {
    adminAddPlayer.classList.add('hidden');
    adminControls.classList.add('hidden');
    teamControls.classList.remove('hidden');
  }
}

function renderLiveAuction() {
  const { activePlayerId, currentBid, currentBidderId, timer } = appState.globalState;
  
  if (!activePlayerId) {
    noActivePlayer.classList.remove('hidden');
    activePlayerCard.classList.add('hidden');
    auctionControls.classList.add('hidden');
    return;
  }

  noActivePlayer.classList.add('hidden');
  activePlayerCard.classList.remove('hidden');
  auctionControls.classList.remove('hidden');

  const player = appState.players.find(p => p.id === activePlayerId);
  const bidder = currentBidderId ? appState.teams.find(t => t.id === currentBidderId)?.name : 'No bids yet';
  const img = player.img || 'https://images2.imgbox.com/6c/d2/8I1zS2mY_o.png'; // High-res generic placeholder
  
  const stats = player.stats || {};

  const getStat = (val) => (val === undefined || val === null || val === '') ? '-' : val;

  const batStats = `
    <div class="stat-box"><div class="stat-value">${getStat(stats.runs)}</div><div class="stat-label">Runs</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.average)}</div><div class="stat-label">Avg</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.strikeRate)}</div><div class="stat-label">S/R</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.matches)}</div><div class="stat-label">Matches</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.hs)}</div><div class="stat-label">HS</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.fiftiesHundreds)}</div><div class="stat-label">50s/100s</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.fours)}</div><div class="stat-label">4s</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.sixes)}</div><div class="stat-label">6s</div></div>
  `;

  const bowlStats = `
    <div class="stat-box"><div class="stat-value">${getStat(stats.wickets)}</div><div class="stat-label">Wickets</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.economy)}</div><div class="stat-label">Econ</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.average || stats.bowlAvg)}</div><div class="stat-label">Avg</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.bowlMatches)}</div><div class="stat-label">Matches</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.bbi)}</div><div class="stat-label">BBI</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.maidens)}</div><div class="stat-label">Maidens</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.fourFive)}</div><div class="stat-label">4w/5w</div></div>
  `;

  const fieldStats = (stats.catches || stats.stumpings) ? `
    <div class="stat-box"><div class="stat-value">${getStat(stats.catches)}</div><div class="stat-label">Catches</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.stumpings)}</div><div class="stat-label">Stumpings</div></div>
  ` : '';

  if (player.role === 'Batter') {
    roleStatsHtml = `<div class="player-stats-grid">${batStats}</div>`;
  } else if (player.role === 'Bowler') {
    roleStatsHtml = `<div class="player-stats-grid">${bowlStats}</div>`;
  } else if (player.role === 'Wicketkeeper' || player.role === 'Wicketkeeper-Batsman') {
    roleStatsHtml = `
      <div class="player-stats-grid">${batStats}</div>
      <div class="player-stats-grid" style="margin-top:5px;">${fieldStats}</div>
    `;
  } else {
    // All-rounder
    roleStatsHtml = `
      <div class="player-stats-grid">${batStats}</div>
      <div class="player-stats-grid" style="margin-top:5px;">${bowlStats}</div>
    `;
  }

  activePlayerCard.innerHTML = `
    ${player.jerseyNumber ? `<div class="jersey-badge" title="Jersey #${player.jerseyNumber}">${player.jerseyNumber}</div>` : ''}
    <div class="bid-timer-container">
       <span class="timer-label">TIME REMAINING</span>
       <span class="timer-value ${timer <= 10 ? 'timer-low' : ''}" id="timer-value">${timer}</span>
    </div>
    <img src="${img}" alt="${player.name}" class="player-img">
    <div class="player-info">
      <div class="player-name">${player.name} ${player.isOverseas ? '✈️' : ''}</div>
      <div class="player-role">${player.role} <span style="font-size: 0.7rem; color: var(--primary); margin-left: 5px;">
        (${player.hasIplExp ? 'IPL Stats' : (player.isOverseas ? 'Intl T20' : 'Domestic T20')})
      </span></div>

      ${roleStatsHtml}

      <div class="bid-details">
         <div class="text-muted">Current Bid</div>
         <div class="current-bid">${formatMoney(currentBid)}</div>
         <div class="current-bidder">${bidder}</div>
      </div>
    </div>
  `;

  if (appState.globalState.timerEndTime) {
    updateTimerUI(appState.globalState.timerEndTime);
  }

  // Re-enable bidding UI for teams when a new player is set
  const teamControlsDisplay = document.getElementById('team-controls');
  if (teamControlsDisplay) {
    teamControlsDisplay.style.opacity = '1';
    teamControlsDisplay.style.pointerEvents = 'auto';
  }
  document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = false);
}

function renderPlayersList() {
  playersContainer.innerHTML = '';
  let filtered = appState.players.filter(p => p.status === currentTab);

  if (currentRoleFilter !== 'all') {
    filtered = filtered.filter(p => {
      if (currentRoleFilter === 'Wicketkeeper-Batsman') {
        return p.role === 'Wicketkeeper-Batsman' || p.role === 'Wicketkeeper';
      }
      if (currentRoleFilter === 'Overseas') {
        return p.isOverseas === true;
      }
      if (currentRoleFilter === 'Domestic') {
        return p.isOverseas !== true;
      }
      return p.role === currentRoleFilter;
    });
  }

  if (searchQuery) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));
  }

  if (filtered.length === 0) {
    playersContainer.innerHTML = `<div class="text-muted" style="padding:20px;text-align:center;">No players matches this filter or search.</div>`;
    return;
  }

  let html = '';
  filtered.forEach(p => {
    let rightSide = `<div class="p-list-price">${formatMoney(p.status === 'sold' ? p.finalPrice : p.basePrice)}</div>`;
    if (p.status === 'sold') {
      const team = appState.teams.find(t => t.id === p.team);
      rightSide = `
        <div style="text-align:right">
           <div class="p-list-price">${formatMoney(p.finalPrice)}</div>
           <div style="font-size:0.8rem; color:#94a3b8;">${team?.name.split(' ')[0] || 'Unknown'}</div>
        </div>
      `;
    }

    let adminAction = '';
    if (currentUser.role === 'admin') {
      if (p.status === 'upcoming') {
        adminAction += `<button class="btn-outline" style="font-size:0.75rem; padding: 4px 8px; margin-left: 10px;" onclick="startAuction('${p.id}')">Start</button>`;
      }
      adminAction += `<button class="btn-secondary" style="font-size:0.75rem; padding: 4px 8px; margin-left: 5px;" onclick="editPlayer('${p.id}')">Edit</button>`;
      adminAction += `<button class="btn-danger" style="font-size:0.75rem; padding: 4px 8px; margin-left: 5px;" onclick="deletePlayer('${p.id}')">Delete</button>`;
    }

    const img = p.img || 'https://images2.imgbox.com/6c/d2/8I1zS2mY_o.png'; 
    
    html += `
      <div class="list-item ${p.status === 'sold' ? 'sold-item' : ''}">
        <div class="p-list-left">
           <div class="p-list-img-container">
             <img src="${img}" class="p-list-avatar" loading="lazy">
             ${p.jerseyNumber ? `<div class="p-list-jersey">${p.jerseyNumber}</div>` : ''}
           </div>
           <div class="p-list-info">
              <span class="p-list-name">${p.name} ${p.isOverseas ? '✈️' : ''}</span>
              <span class="p-list-role">${p.role}</span>
           </div>
        </div>
        <div style="display:flex;align-items:center; gap: 5px;">
           ${rightSide}
           ${adminAction}
        </div>
      </div>
    `;
  });
  playersContainer.innerHTML = html;
}

function renderTeamsStats() {
  let html = '';
  const sortedTeams = [...appState.teams].sort((a, b) => b.budget - a.budget);

  sortedTeams.forEach(t => {
    const isMe = currentUser?.id === t.id;
    const STARTING_BUDGET = 10000;
    const spent = STARTING_BUDGET - t.budget;
    const pctSpent = ((spent / STARTING_BUDGET) * 100).toFixed(1);
    const isOver75 = pctSpent >= 75;

    let overseasCount = t.players.filter(pid => {
      let plt = appState.players.find(x => x.id === pid);
      return plt && plt.isOverseas;
    }).length;

    html += `
      <div class="list-item" style="${isMe ? 'border-color: var(--primary); background: rgba(59,130,246,0.1);' : ''}">
         <div class="team-item w-100" style="width: 100%;">
            <div class="team-top" style="display: flex; align-items: center; justify-content: space-between;">
               <div style="display: flex; align-items: center; gap: 10px;">
                  ${t.logo ? `<img src="${t.logo}" alt="${t.name}" style="width: 25px; height: 25px; object-fit: contain;" loading="lazy">` : ''}
                  <span class="team-name">${t.name} ${isMe ? '<span style="color:var(--primary);font-size:0.8rem;">(You)</span>' : ''}</span>
               </div>
               <span class="team-budget">${formatMoney(t.budget)}</span>
            </div>
            <div class="team-stats">
               <span style="font-weight:600; color:${isOver75 ? 'var(--success)' : 'var(--danger)'}">Spent: ${pctSpent}%</span> | 
               Roster: ${t.players.length}/25 | 
               Overseas: ${overseasCount}/8
            </div>
            ${(currentUser.role === 'admin' || isMe) ? 
              `<button class="btn-outline btn-view-squad" onclick="viewSquad('${t.id}')">View Squad</button>` : 
              ''
            }
         </div>
      </div>
    `;
  });
  teamsContainer.innerHTML = html;
}

function updateRoleCounts() {
  const playersInTab = appState.players.filter(p => p.status === currentTab);
  
  const counts = {
    all: playersInTab.length,
    Batter: 0,
    Bowler: 0,
    'All-rounder': 0,
    'Wicketkeeper-Batsman': 0,
    'Overseas': 0,
    'Domestic': 0
  };

  playersInTab.forEach(p => {
    if (p.isOverseas) {
      counts['Overseas']++;
    } else {
      counts['Domestic']++;
    }
    
    if (p.role === 'Wicketkeeper') {
      counts['Wicketkeeper-Batsman']++;
    } else if (counts[p.role] !== undefined) {
      counts[p.role]++;
    }
  });

  Object.keys(counts).forEach(role => {
    const countEl = document.getElementById(`count-${role}`);
    if (countEl) countEl.textContent = counts[role];
  });
}

// --- Interactions ---

// Tabs
tabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentTab = e.target.dataset.tab;
    renderPlayersList();
  });
});

// Admin: Start Auction
window.startAuction = function(playerId) {
  if (appState.globalState.activePlayerId) {
    alert("An auction is already active. Mark it sold or unsold first.");
    return;
  }
  socket.emit('setActivePlayer', { playerId });
};

// Admin: Accelerated Round
const btnAccelerated = document.getElementById('btn-accelerated');
if (btnAccelerated) {
  btnAccelerated.addEventListener('click', () => {
    if (confirm("Move all unsold players back to upcoming for an accelerated round?")) {
      socket.emit('acceleratedRound');
    }
  });
}

// Role Filters Listener
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentRoleFilter = chip.dataset.role;
    renderPlayersList();
  });
});

// Admin Modal Logic for Dynamic Stats Labels
const pOverseasCheckbox = document.getElementById('p-overseas');
const pIplExpCheckbox = document.getElementById('p-ipl-exp');
const labelBat = document.getElementById('label-bat-stats');
const labelBowl = document.getElementById('label-bowl-stats');
const labelWk = document.getElementById('label-wk-stats');

function updateModalLabels() {
  const isOverseas = pOverseasCheckbox.checked;
  const hasIplExp = pIplExpCheckbox.checked;
  if (!labelBat || !labelBowl || !labelWk) return;
  
  if (hasIplExp) {
    // Any player with IPL experience shows IPL labels
    labelBat.textContent = "IPL Batting Statistics";
    labelBowl.textContent = "IPL Bowling Statistics";
    labelWk.textContent = "IPL Wicketkeeping Statistics";
  } else if (isOverseas) {
    // Overseas without IPL exp
    labelBat.textContent = "International T20 Batting Records";
    labelBowl.textContent = "International T20 Bowling Records";
    labelWk.textContent = "International T20 Keeping Records";
  } else {
    // Domestic Indian player
    labelBat.textContent = "Domestic T20 Stats (Syed Mushtaq Ali/Ranji)";
    labelBowl.textContent = "Domestic T20 Stats (Vijay Hazare/Ranji)";
    labelWk.textContent = "Domestic Wicketkeeping Stats";
  }
}

if (pOverseasCheckbox) {
  pOverseasCheckbox.addEventListener('change', updateModalLabels);
}
if (pIplExpCheckbox) {
  pIplExpCheckbox.addEventListener('change', updateModalLabels);
}

// Admin: Undo Action
const btnUndo = document.getElementById('btn-undo');
if (btnUndo) {
  btnUndo.addEventListener('click', () => {
    if (confirm("Revert the last significant auction action? This will undo the last Sold/Unsold/Start action.")) {
      socket.emit('undoAction');
    }
  });
}

// Admin: Leaderboard
if (btnLeaderboard) {
  btnLeaderboard.addEventListener('click', () => {
    calculateAndShowLeaderboard();
  });
}

function calculateAndShowLeaderboard() {
  const teamsData = appState.teams.map(team => {
    const squad = appState.players.filter(p => p.team === team.id);
    
    // Points Calculation Logic
    let starPower = 0;
    let balancePoints = 0;
    
    // 1. Star Power (Based on points/price value)
    squad.forEach(p => {
      // 1 point for every 10L spent (Value perception)
      starPower += (p.finalPrice / 10);
    });

    // 2. Balance (Composition)
    const counts = { Batter: 0, Bowler: 0, AllRounder: 0, Wicketkeeper: 0 };
    squad.forEach(p => {
      const role = p.role.replace('-', '').replace(' ', ''); // Handle 'All-rounder' or 'All rounder'
      if (role.includes('Batter')) counts.Batter++;
      if (role.includes('Bowler')) counts.Bowler++;
      if (role.includes('All')) counts.AllRounder++;
      if (role.includes('keeper')) counts.Wicketkeeper++;
    });

    // Award bonus points for reaching minimum balance
    if (counts.Batter >= 5) balancePoints += 10;
    if (counts.Bowler >= 5) balancePoints += 10;
    if (counts.AllRounder >= 2) balancePoints += 10;
    if (counts.Wicketkeeper >= 1) balancePoints += 10;

    // 3. Roster Size
    const rosterPoints = squad.length * 2;

    const totalScore = (starPower + balancePoints + rosterPoints).toFixed(1);

    return { ...team, squad, totalScore, counts };
  });

  // Sort by score
  teamsData.sort((a, b) => b.totalScore - a.totalScore);

  leaderboardContainer.innerHTML = '';
  teamsData.forEach((t, idx) => {
    leaderboardContainer.innerHTML += `
      <div class="list-item" style="${idx === 0 ? 'border: 2px solid #FFD700; background: rgba(212, 175, 55, 0.1);' : ''}">
        <div style="display:flex; align-items:center; gap:20px; width:100%;">
          <div style="font-size:1.5rem; font-weight:900; color:var(--primary); width:30px;">${idx + 1}</div>
          <img src="${t.logo || ''}" style="width:40px; height:40px; object-fit:contain;">
          <div style="flex:1">
            <div style="font-weight:800; font-size:1.1rem;">${t.name} ${idx === 0 ? '👑' : ''}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">
              ${t.counts.Batter} BAT | ${t.counts.Bowler} BOWL | ${t.counts.AllRounder} AR | ${t.counts.Wicketkeeper} WK
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:1.5rem; font-weight:900; color:var(--primary);">${t.totalScore}</div>
            <div style="font-size:0.7rem; text-transform:uppercase;">Squad Rating</div>
          </div>
        </div>
      </div>
    `;
  });

  leaderboardModal.classList.remove('hidden');
}

closeLeaderboardBtn.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
});

// Admin: Reset Biddings Only
const btnResetBids = document.getElementById('btn-reset-bids');
if (btnResetBids) {
  btnResetBids.addEventListener('click', () => {
    if (confirm("Reset all biddings? This will clear squads and budgets but KEEP all currently added players. Continue?")) {
      socket.emit('resetBiddings');
    }
  });
}

// Admin: Edit Player
window.editPlayer = function(playerId) {
  const p = appState.players.find(pl => pl.id === playerId);
  if (!p) return;
  document.getElementById('p-id').value = p.id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-role').value = p.role;
  document.getElementById('p-baseprice').value = p.basePrice || 50;
  document.getElementById('p-jersey').value = p.jerseyNumber || '';
  document.getElementById('p-overseas').checked = !!p.isOverseas;
  document.getElementById('p-ipl-exp').checked = !!p.hasIplExp;
  updateModalLabels(); // Set correct labels
  document.getElementById('p-img').value = p.img || '';

  const stats = p.stats || {};
  document.getElementById('p-runs').value = stats.runs || '';
  document.getElementById('p-matches').value = stats.matches || '';
  document.getElementById('p-fours').value = stats.fours || '';
  document.getElementById('p-sixes').value = stats.sixes || '';
  document.getElementById('p-average').value = stats.average || '';
  document.getElementById('p-strike-rate').value = stats.strikeRate || '';
  document.getElementById('p-hs').value = stats.hs || '';
  document.getElementById('p-fifties').value = stats.fiftiesHundreds || '';

  document.getElementById('p-wickets').value = stats.wickets || '';
  document.getElementById('p-bowl-matches').value = stats.bowlMatches || '';
  document.getElementById('p-economy').value = stats.economy || '';
  document.getElementById('p-maidens').value = stats.maidens || '';
  document.getElementById('p-bbi').value = stats.bbi || '';
  document.getElementById('p-four-five').value = stats.fourFive || '';

  document.getElementById('p-catches').value = stats.catches || '';
  document.getElementById('p-stumpings').value = stats.stumpings || '';

  document.getElementById('modal-title').innerText = 'Edit Player';
  document.getElementById('btn-delete-player-modal').classList.remove('hidden');
  playerModal.classList.remove('hidden');
};

// Admin: Delete Player
window.deletePlayer = function(playerId) {
  const p = appState.players.find(pl => pl.id === playerId);
  if (!p) return;
  
  if (confirm(`Are you sure you want to delete ${p.name}? This action cannot be undone.`)) {
    socket.emit('deletePlayer', { playerId });
  }
};

// Admin Commands
document.getElementById('btn-sold').addEventListener('click', () => {
  if (!appState.globalState.currentBidderId) {
    alert("No bids placed yet!");
    return;
  }
  socket.emit('markSold');
});

document.getElementById('btn-unsold').addEventListener('click', () => {
  socket.emit('markUnsold');
});

// Team Commands
document.querySelectorAll('.btn-bid').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (currentUser.role !== 'team') return;
    const bidAmount = parseInt(e.target.dataset.amount);
    const newTotal = appState.globalState.currentBid + bidAmount;
    
    const myTeam = appState.teams.find(t => t.id === currentUser.id);
    if (newTotal > myTeam.budget) {
      alert("Insufficient Budget!");
      return;
    }
    
    socket.emit('placeBid', { teamId: currentUser.id, amount: newTotal });
  });
});

// Admin Player Modal
btnNewPlayer.addEventListener('click', () => {
  document.getElementById('p-id').value = '';
  document.getElementById('p-name').value = '';
  document.getElementById('p-role').value = 'Batter';
  document.getElementById('p-baseprice').value = '50';
  document.getElementById('p-jersey').value = '';
  document.getElementById('p-overseas').checked = false;
  document.getElementById('p-ipl-exp').checked = false;
  updateModalLabels(); // Reset labels to Domestic by default
  document.getElementById('p-img').value = '';

  document.getElementById('p-runs').value = '';
  document.getElementById('p-matches').value = '';
  document.getElementById('p-fours').value = '';
  document.getElementById('p-sixes').value = '';
  document.getElementById('p-average').value = '';
  document.getElementById('p-strike-rate').value = '';
  document.getElementById('p-hs').value = '';
  document.getElementById('p-fifties').value = '';

  document.getElementById('p-wickets').value = '';
  document.getElementById('p-bowl-matches').value = '';
  document.getElementById('p-economy').value = '';
  document.getElementById('p-maidens').value = '';
  document.getElementById('p-bbi').value = '';
  document.getElementById('p-four-five').value = '';

  document.getElementById('p-catches').value = '';
  document.getElementById('p-stumpings').value = '';

  document.getElementById('modal-title').innerText = 'Add New Player';
  document.getElementById('btn-delete-player-modal').classList.add('hidden');
  playerModal.classList.remove('hidden');
});

// Admin: Modal Delete Button
document.getElementById('btn-delete-player-modal').addEventListener('click', () => {
  const playerId = document.getElementById('p-id').value;
  if (!playerId) return;
  window.deletePlayer(playerId);
  playerModal.classList.add('hidden');
});

closeBtn.addEventListener('click', () => {
  playerModal.classList.add('hidden');
});

playerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const name = document.getElementById('p-name').value;
  const role = document.getElementById('p-role').value;
  const basePrice = parseInt(document.getElementById('p-baseprice').value);
  const jerseyNumber = document.getElementById('p-jersey').value;
  const isOverseas = document.getElementById('p-overseas').checked;
  const hasIplExp = document.getElementById('p-ipl-exp').checked;
  const img = document.getElementById('p-img').value;

  const stats = {
    runs: document.getElementById('p-runs').value,
    matches: document.getElementById('p-matches').value,
    fours: document.getElementById('p-fours').value,
    sixes: document.getElementById('p-sixes').value,
    average: document.getElementById('p-average').value,
    strikeRate: document.getElementById('p-strike-rate').value,
    hs: document.getElementById('p-hs').value,
    fiftiesHundreds: document.getElementById('p-fifties').value,
    wickets: document.getElementById('p-wickets').value,
    bowlMatches: document.getElementById('p-bowl-matches').value,
    economy: document.getElementById('p-economy').value,
    maidens: document.getElementById('p-maidens').value,
    bbi: document.getElementById('p-bbi').value,
    fourFive: document.getElementById('p-four-five').value,
    catches: document.getElementById('p-catches').value,
    stumpings: document.getElementById('p-stumpings').value
  };

  socket.emit('updatePlayer', { id, name, role, basePrice, jerseyNumber, isOverseas, hasIplExp, img, stats });
  playerModal.classList.add('hidden');
});

// --- Squad Logic ---
window.viewSquad = function(teamId) {
  const team = appState.teams.find(t => t.id === teamId);
  if (!team) return;

  squadTitle.innerText = `${team.name} - Squad`;
  
  const squadPlayers = appState.players.filter(p => p.team === teamId);
  const overseasCount = squadPlayers.filter(p => p.isOverseas).length;
  const STARTING_BUDGET = 10000;
  const spent = STARTING_BUDGET - team.budget;

  squadSummary.innerHTML = `
    <div class="summary-item">
      <span class="summary-val">${squadPlayers.length}/25</span>
      <span class="summary-lbl">Roster</span>
    </div>
    <div class="summary-item">
      <span class="summary-val">${overseasCount}/8</span>
      <span class="summary-lbl">Overseas</span>
    </div>
    <div class="summary-item">
      <span class="summary-val">${formatMoney(spent)}</span>
      <span class="summary-lbl">Spent</span>
    </div>
    <div class="summary-item">
      <span class="summary-val">${formatMoney(team.budget)}</span>
      <span class="summary-lbl">Remaining</span>
    </div>
  `;

  squadPlayersList.innerHTML = '';
  if (squadPlayers.length === 0) {
    squadPlayersList.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">No players bought yet.</div>';
  } else {
    squadPlayers.forEach(p => {
      const img = p.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=60';
      squadPlayersList.innerHTML += `
        <div class="list-item">
          <div class="p-list-left">
             <img src="${img}" class="p-list-avatar">
             <div class="p-list-info">
                <span class="p-list-name">${p.name} ${p.isOverseas ? '✈️' : ''}</span>
                <span class="p-list-role">${p.role}</span>
             </div>
          </div>
          <div class="p-list-right">
             <div class="p-list-price">${formatMoney(p.finalPrice)}</div>
          </div>
        </div>
      `;
    });
  }

  squadModal.classList.remove('hidden');
};

closeSquadBtn.addEventListener('click', () => {
  squadModal.classList.add('hidden');
});

window.addEventListener('click', (e) => {
  if (e.target === squadModal) squadModal.classList.add('hidden');
});

// --- Sold Animation Logic ---
function showSoldAnimation({ player, team, price }) {
  soldPlayerImg.src = player.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=500&auto=format&fit=crop&q=60';
  soldPlayerName.innerText = player.name;
  soldTeamLogo.src = team.logo || '';
  soldTeamLogo.style.display = team.logo ? 'block' : 'none';
  soldTeamName.innerText = team.name;
  soldPrice.innerText = formatMoney(price);

  soldOverlay.classList.remove('hidden');

  // Trigger confetti or flowers if needed, but the stamp animation is key
  console.log(`Celebration: ${player.name} sold to ${team.name} for ${price}`);

  setTimeout(() => {
    soldOverlay.classList.add('hidden');
  }, 4500); // Show for 4.5 seconds
}
