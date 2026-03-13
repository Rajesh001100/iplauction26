require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let db = {
  teams: [],
  players: [],
  globalState: {
    activePlayerId: null,
    currentBid: 0,
    currentBidderId: null,
    timer: 15, // Default 15s
    isTimerRunning: false
  }
};

let lastDbState = null;

function saveHistory() {
  lastDbState = JSON.parse(JSON.stringify(db));
}

// Timer Logic
let timerInterval = null;
function startTimer() {
  stopTimer();
  db.globalState.timer = 15; // 15 seconds
  db.globalState.timerEndTime = Date.now() + (db.globalState.timer * 1000);
  continueTimer();
}

function continueTimer() {
  if (timerInterval) clearInterval(timerInterval);
  db.globalState.isTimerRunning = true;
  db.globalState.timerEndTime = Date.now() + (db.globalState.timer * 1000);

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((db.globalState.timerEndTime - Date.now()) / 1000));
    db.globalState.timer = remaining;

    if (db.globalState.timer > 0) {
      io.emit('timerUpdate', {
        seconds: db.globalState.timer,
        endTime: db.globalState.timerEndTime
      });
    } else {
      stopTimer();
      io.emit('auctionTimeout');
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  db.globalState.isTimerRunning = false;
  db.globalState.timer = 0;
  db.globalState.timerEndTime = null;
  io.emit('timerUpdate', { seconds: 0, endTime: null });
}

// ... syncFromSupabase remains similar ...

async function syncFromSupabase() {
  try {
    const { data: teams } = await supabase.from('teams').select('*').order('id');
    const { data: players } = await supabase.from('players').select('*').order('id');
    const { data: state } = await supabase.from('global_state').select('*').eq('id', 1).single();

    if (teams) db.teams = teams;
    if (players) db.players = players;
    if (state) {
      db.globalState = {
        ...db.globalState,
        activePlayerId: state.activePlayerId,
        currentBid: state.currentBid,
        currentBidderId: state.currentBidderId,
        adminPassword: state.admin_password
      };
    }
    console.log('Synced with Supabase');
  } catch (err) {
    console.error('Initial sync error:', err);
  }
}

syncFromSupabase();

io.on('connection', (socket) => {
  // ... initial emit ...
  socket.emit('initialState', {
    teams: db.teams.map(({ password, ...p }) => p),
    players: db.players,
    globalState: db.globalState
  });

  socket.on('login', ({ role, teamId, password }, callback) => {
    if (role === 'admin') {
      const winningPass = db.globalState.adminPassword || process.env.ADMIN_PASSWORD || 'admin123';
      if (password === winningPass) callback({ success: true, role: 'admin' });
      else callback({ success: false, message: 'Invalid Admin Password' });
    } else {
      const team = db.teams.find(t => t.id === teamId);
      if (team && team.password === password) callback({ success: true, role: 'team', teamId: teamId });
      else callback({ success: false, message: 'Invalid Team Password' });
    }
  });

  socket.on('setActivePlayer', async ({ playerId }) => {
    saveHistory();
    const player = db.players.find(p => p.id === playerId);
    if (player && player.status === 'upcoming') {
      db.globalState.activePlayerId = playerId;
      db.globalState.currentBid = player.basePrice;
      db.globalState.currentBidderId = null;

      startTimer();

      await supabase.from('global_state').update({
        activePlayerId: playerId,
        currentBid: player.basePrice,
        currentBidderId: null
      }).eq('id', 1);

      io.emit('stateUpdate', { globalState: db.globalState, players: db.players });
    }
  });

  socket.on('placeBid', async ({ teamId, amount }) => {
    if (!db.globalState.isTimerRunning || db.globalState.timer <= 0) {
      socket.emit('auctionError', 'Bidding has ended for this player!');
      return;
    }
    const team = db.teams.find(t => t.id === teamId);
    if (team && amount > db.globalState.currentBid && amount <= team.budget) {
      db.globalState.currentBid = amount;
      db.globalState.currentBidderId = teamId;

      startTimer(); // Reset timer on every bid

      await supabase.from('global_state').update({
        currentBid: amount,
        currentBidderId: teamId
      }).eq('id', 1);

      io.emit('stateUpdate', { globalState: db.globalState });
    }
  });

  socket.on('markSold', async () => {
    if (db.globalState.activePlayerId && db.globalState.currentBidderId) {
      saveHistory();
      const player = db.players.find(p => p.id === db.globalState.activePlayerId);
      const team = db.teams.find(t => t.id === db.globalState.currentBidderId);

      if (player && team) {
        const price = db.globalState.currentBid;
        player.status = 'sold';
        player.team = team.id;

        // Handle overseas logic if needed...
        player.finalPrice = price;
        team.budget -= price;
        team.players.push(player.id);

        stopTimer();
        db.globalState.activePlayerId = null;
        db.globalState.currentBid = 0;
        db.globalState.currentBidderId = null;

        await Promise.all([
          supabase.from('players').update({ status: 'sold', team: player.team, finalPrice: player.finalPrice }).eq('id', player.id),
          supabase.from('teams').update({ budget: team.budget, players: team.players }).eq('id', team.id),
          supabase.from('global_state').update({ activePlayerId: null, currentBid: 0, currentBidderId: null }).eq('id', 1)
        ]);

        io.emit('stateUpdate', { globalState: db.globalState, players: db.players, teams: db.teams });
        io.emit('playerSold', { player, team, price });
      }
    }
  });

  socket.on('markUnsold', async () => {
    if (db.globalState.activePlayerId) {
      saveHistory();
      const player = db.players.find(p => p.id === db.globalState.activePlayerId);
      if (player) {
        player.status = 'unsold';
        stopTimer();
        db.globalState.activePlayerId = null;
        await Promise.all([
          supabase.from('players').update({ status: 'unsold' }).eq('id', player.id),
          supabase.from('global_state').update({ activePlayerId: null, currentBid: 0, currentBidderId: null }).eq('id', 1)
        ]);
        io.emit('stateUpdate', { globalState: db.globalState, players: db.players });
      }
    }
  });

  socket.on('undoAction', async () => {
    if (lastDbState) {
      console.log('Undoing last action...');
      db = JSON.parse(JSON.stringify(lastDbState));
      lastDbState = null;

      // Sync the undone state back to Supabase
      const state = db.globalState;
      await Promise.all([
        supabase.from('global_state').update({
          activePlayerId: state.activePlayerId,
          currentBid: state.currentBid,
          currentBidderId: state.currentBidderId
        }).eq('id', 1),
        // We'd ideally need to sync teams/players too but for major "Sold" undos:
        ...db.teams.map(t => supabase.from('teams').update({ budget: t.budget, players: t.players }).eq('id', t.id)),
        ...db.players.map(p => supabase.from('players').update({ status: p.status, team: p.team }).eq('id', p.id))
      ]);

      io.emit('initialState', {
        teams: db.teams.map(({ password, ...p }) => p),
        players: db.players,
        globalState: db.globalState
      });
    }
  });

  socket.on('addExtraTime', (seconds) => {
    const amount = seconds || 60;
    if (db.globalState.activePlayerId) {
      db.globalState.timer += amount;
      db.globalState.timerEndTime = (db.globalState.timerEndTime || Date.now()) + (amount * 1000);

      if (!db.globalState.isTimerRunning) {
        continueTimer();
      } else {
        io.emit('timerUpdate', {
          seconds: db.globalState.timer,
          endTime: db.globalState.timerEndTime
        });
      }
    }
  });

  socket.on('deletePlayer', async ({ playerId }) => {
    if (db.globalState.activePlayerId === playerId) {
      socket.emit('auctionError', 'Cannot delete a player while they are actively being auctioned!');
      return;
    }
    const idx = db.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const player = db.players[idx];

      // If player was sold, remove from team's roster and refund budget (optional but logical)
      if (player.status === 'sold' && player.team) {
        const team = db.teams.find(t => t.id === player.team);
        if (team) {
          team.players = team.players.filter(pid => pid !== playerId);
          team.budget += (player.finalPrice || 0);
          await supabase.from('teams').update({ budget: team.budget, players: team.players }).eq('id', team.id);
        }
      }

      db.players.splice(idx, 1);
      await supabase.from('players').delete().eq('id', playerId);

      io.emit('stateUpdate', { players: db.players, teams: db.teams });
    }
  });

  socket.on('updatePlayer', async (playerData) => {
    if (playerData.id) {
      let idx = db.players.findIndex(p => p.id === playerData.id);
      if (idx !== -1) {
        db.players[idx] = { ...db.players[idx], ...playerData };
        await supabase.from('players').upsert(db.players[idx]);
      }
    } else {
      const newPlayer = {
        ...playerData,
        id: 'p' + (db.players.length + 1),
        status: 'upcoming'
      };
      db.players.push(newPlayer);
      await supabase.from('players').insert(newPlayer);
    }
    io.emit('stateUpdate', { players: db.players });
  });

  socket.on('resetBiddings', async () => {
    saveHistory();

    // Reset players in memory
    db.players.forEach(p => {
      p.status = 'upcoming';
      p.team = null;
      p.finalPrice = null;
    });

    // Reset teams in memory
    db.teams.forEach(t => {
      t.budget = 10000;
      t.players = [];
    });

    // Reset global state in memory
    db.globalState.activePlayerId = null;
    db.globalState.currentBid = 0;
    db.globalState.currentBidderId = null;
    stopTimer();

    // Sync to Supabase
    try {
      await Promise.all([
        supabase.from('global_state').update({
          activePlayerId: null,
          currentBid: 0,
          currentBidderId: null
        }).eq('id', 1),
        // Use a filter that matches all rows for mass update
        supabase.from('players').update({
          status: 'upcoming',
          team: null,
          finalPrice: null
        }).neq('id', 'all_reset_placeholder'),
        supabase.from('teams').update({
          budget: 10000,
          players: []
        }).neq('id', 'all_reset_placeholder')
      ]);
      console.log('Auction reset successfully in Supabase');
    } catch (err) {
      console.error('Error resetting biddings in Supabase:', err);
    }

    // Broadcast the full reset state to all clients
    io.emit('initialState', {
      teams: db.teams.map(({ password, ...p }) => p),
      players: db.players,
      globalState: db.globalState
    });
  });

  socket.on('acceleratedRound', async () => {
    saveHistory();
    // Move all unsold players back to upcoming
    db.players.forEach(p => {
      if (p.status === 'unsold') {
        p.status = 'upcoming';
      }
    });

    try {
      await supabase.from('players').update({ status: 'upcoming' }).eq('status', 'unsold');
      console.log('Accelerated round: moved unsold players back to upcoming');
    } catch (err) {
      console.error('Error updating players for accelerated round:', err);
    }

    io.emit('stateUpdate', { players: db.players });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
