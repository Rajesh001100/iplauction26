const socket = io();

// State
let currentUser = null; // { role: 'admin' | 'team', id?: 't1' }
let appState = {
  teams: [],
  players: [],
  globalState: {
    activePlayerId: null,
    currentBid: 0,
    currentBidderId: null
  }
};
let currentTab = 'upcoming';

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

// --- Initialization ---

// Wait for initial state to populate login dropdown
socket.on('initialState', (state) => {
  appState = state;
  populateLoginDropdown();
  if (currentUser) {
    renderApp();
  }
});

socket.on('stateUpdate', (partialState) => {
  appState = { ...appState, ...partialState };
  if (currentUser) {
    renderApp();
  }
});

socket.on('auctionError', (msg) => {
  alert('Auction Rule Warning: ' + msg);
});

socket.on('playerSold', (data) => {
  showSoldAnimation(data);
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
        document.documentElement.style.setProperty('--primary', '#8b5cf6');
        document.documentElement.style.setProperty('--primary-hover', '#7c3aed');
      } else {
        const team = appState.teams.find(t => t.id === currentUser.id);
        welcomeMsg.textContent = `Franchise: ${team.name}`;
      }

      renderApp();
    } else {
      alert(res.message);
    }
  });
});

logoutBtn.addEventListener('click', () => {
  currentUser = null;
  mainApp.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  document.getElementById('password').value = '';
});

// --- UI Rendering ---

function renderApp() {
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
  const { activePlayerId, currentBid, currentBidderId } = appState.globalState;
  
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
  const img = player.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3';
  const playerStats = player.stats || { runs: '-', matches: '-', average: '-', strikeRate: '-', hs: '-', fiftiesHundreds: '-/-', wickets: '-', bowlMatches: '-', economy: '-', maidens: '-', bbi: '-', fourFive: '-/-' };

  let statsHtml = '';
  const batGrid = `
      <div class="player-stats-grid" style="margin-bottom: 5px;">
        <div class="stat-box"><div class="stat-value">${playerStats.runs || '-'}</div><div class="stat-label">Runs</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.matches || '-'}</div><div class="stat-label">Matches</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.average || '-'}</div><div class="stat-label">Average</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.strikeRate || '-'}</div><div class="stat-label">Strike Rate</div></div>
        <div class="stat-box empty-box"></div>
        <div class="stat-box"><div class="stat-value">${playerStats.hs || '-'}</div><div class="stat-label">Hs. Score</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.fiftiesHundreds || '-/-'}</div><div class="stat-label">50s/100s</div></div>
        <div class="stat-box empty-box"></div>
      </div>
  `;

  const bowlGrid = `
      <div class="player-stats-grid" style="margin-bottom: 5px;">
        <div class="stat-box"><div class="stat-value">${playerStats.wickets || '-'}</div><div class="stat-label">Wickets</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.bowlMatches || playerStats.matches || '-'}</div><div class="stat-label">Matches</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.economy || '-'}</div><div class="stat-label">Economy</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.maidens || '-'}</div><div class="stat-label">Maidens</div></div>
        <div class="stat-box empty-box"></div>
        <div class="stat-box"><div class="stat-value">${playerStats.bbi || '-'}</div><div class="stat-label">BBI</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.fourFive || '-/-'}</div><div class="stat-label">4Ws/5Ws</div></div>
        <div class="stat-box empty-box"></div>
      </div>
  `;

  const wkGrid = `
      <div class="player-stats-grid" style="margin-bottom: 5px;">
        <div class="stat-box"><div class="stat-value">${playerStats.catches || '-'}</div><div class="stat-label">Catches</div></div>
        <div class="stat-box"><div class="stat-value">${playerStats.stumpings || '-'}</div><div class="stat-label">Stumpings</div></div>
        <div class="stat-box empty-box"></div>
        <div class="stat-box empty-box"></div>
      </div>
  `;

  if (player.role === 'Wicketkeeper') {
    statsHtml = batGrid + wkGrid;
  } else if (player.role === 'Batter') {
    statsHtml = batGrid;
  } else if (player.role === 'Bowler') {
    statsHtml = bowlGrid;
  } else {
    statsHtml = batGrid + bowlGrid;
  }

  activePlayerCard.innerHTML = `
    <img src="${img}" alt="${player.name}" class="player-img">
    <div class="player-info">
      <div class="player-name">${player.name} ${player.isOverseas ? '✈️' : ''}</div>
      <div class="player-role">${player.role}</div>

      ${statsHtml}

      <div class="bid-details">
         <div class="text-muted">Current Bid</div>
         <div class="current-bid">${formatMoney(currentBid)}</div>
         <div class="current-bidder">${bidder}</div>
      </div>
    </div>
  `;
}

function renderPlayersList() {
  playersContainer.innerHTML = '';
  const filtered = appState.players.filter(p => p.status === currentTab);

  if (filtered.length === 0) {
    playersContainer.innerHTML = `<div class="text-muted" style="padding:20px;text-align:center;">No players in this category.</div>`;
    return;
  }

  filtered.forEach(p => {
    let rightSide = `<div class="p-list-price">${formatMoney(p.basePrice)}</div>`;
    if (p.status === 'sold') {
      const team = appState.teams.find(t => t.id === p.team);
      rightSide = `
        <div style="text-align:right">
           <div class="p-list-price">${formatMoney(p.finalPrice)}</div>
           <div style="font-size:0.8rem; color:#94a3b8;">${team?.name.split(' ')[0] || 'Unknown'}</div>
           ${p.bcciExcess ? `<div style="font-size:0.75rem; color:var(--success);">+ ${formatMoney(p.bcciExcess)} to BCCI</div>` : ''}
        </div>
      `;
    }

    let adminAction = '';
    if (currentUser.role === 'admin') {
      if (p.status === 'upcoming') {
        adminAction += `<button class="btn-outline" style="font-size:0.8rem; padding: 5px 10px; margin-left: 10px;" onclick="startAuction('${p.id}')">Start</button>`;
      }
      adminAction += `<button class="btn-secondary" style="font-size:0.8rem; padding: 5px 10px; margin-left: 5px;" onclick="editPlayer('${p.id}')">Edit</button>`;
    }

    const img = p.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=60';
    
    playersContainer.innerHTML += `
      <div class="list-item">
        <div class="p-list-left">
           <img src="${img}" class="p-list-avatar">
           <div class="p-list-info">
              <span class="p-list-name">${p.name} ${p.isOverseas ? '✈️' : ''}</span>
              <span class="p-list-role">${p.role}</span>
           </div>
        </div>
        <div style="display:flex;align-items:center;">
           ${rightSide}
           ${adminAction}
        </div>
      </div>
    `;
  });
}

function renderTeamsStats() {
  teamsContainer.innerHTML = '';
  
  const sortedTeams = [...appState.teams].sort((a, b) => b.budget - a.budget);

  sortedTeams.forEach(t => {
    const isMe = currentUser?.id === t.id;
    // Calculate total spent (assuming starting budget was 10000L). 
    // Since we dynamically update budget in state, spent = 10000 - current budget.
    const STARTING_BUDGET = 10000;
    const spent = STARTING_BUDGET - t.budget;
    const pctSpent = ((spent / STARTING_BUDGET) * 100).toFixed(1);
    const isOver75 = pctSpent >= 75;

    let overseasCount = t.players.filter(pid => {
      let plt = appState.players.find(x => x.id === pid);
      return plt && plt.isOverseas;
    }).length;

    teamsContainer.innerHTML += `
      <div class="list-item" style="${isMe ? 'border-color: var(--primary); background: rgba(59,130,246,0.1);' : ''}">
         <div class="team-item w-100" style="width: 100%;">
            <div class="team-top" style="display: flex; align-items: center; justify-content: space-between;">
               <div style="display: flex; align-items: center; gap: 10px;">
                  ${t.logo ? `<img src="${t.logo}" alt="${t.name}" style="width: 25px; height: 25px; object-fit: contain;">` : ''}
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
  document.getElementById('p-overseas').checked = !!p.isOverseas;
  document.getElementById('p-img').value = p.img || '';

  const stats = p.stats || {};
  document.getElementById('p-runs').value = stats.runs || '';
  document.getElementById('p-matches').value = stats.matches || '';
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
  playerModal.classList.remove('hidden');
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
  document.getElementById('p-overseas').checked = false;
  document.getElementById('p-img').value = '';

  document.getElementById('p-runs').value = '';
  document.getElementById('p-matches').value = '';
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
  playerModal.classList.remove('hidden');
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
  const isOverseas = document.getElementById('p-overseas').checked;
  const img = document.getElementById('p-img').value;

  const stats = {
    runs: document.getElementById('p-runs').value,
    matches: document.getElementById('p-matches').value,
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

  socket.emit('updatePlayer', { id, name, role, basePrice, isOverseas, img, stats });
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
