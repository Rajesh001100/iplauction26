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
    currentBidderId: null
  }
};

// Initial Sync from Supabase
async function syncFromSupabase() {
  try {
    const { data: teams } = await supabase.from('teams').select('*').order('id');
    const { data: players } = await supabase.from('players').select('*').order('id');
    const { data: state } = await supabase.from('global_state').select('*').eq('id', 1).single();

    if (teams) db.teams = teams;
    if (players) db.players = players;
    if (state) {
      db.globalState = {
        activePlayerId: state.activePlayerId,
        currentBid: state.currentBid,
        currentBidderId: state.currentBidderId,
        adminPassword: state.admin_password // Sync from DB
      };
    }
    console.log('Synced with Supabase');
  } catch (err) {
    console.error('Initial sync error:', err);
  }
}

syncFromSupabase();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Strip passwords before sending to client
  const publicTeams = db.teams.map(t => {
    const { password, ...publicData } = t;
    return publicData;
  });

  socket.emit('initialState', { 
    teams: publicTeams, 
    players: db.players, 
    globalState: db.globalState 
  });

  // Login verification
  socket.on('login', ({ role, teamId, password }, callback) => {
    if (role === 'admin') {
      const dbAdminPass = db.globalState.adminPassword || process.env.ADMIN_PASSWORD || 'admin123';
      if (password === dbAdminPass) {
        callback({ success: true, role: 'admin' });
      } else {
        callback({ success: false, message: 'Invalid Admin Password' });
      }
    } else {
      const team = db.teams.find(t => t.id === teamId);
      if (team && team.password === password) {
        callback({ success: true, role: 'team', teamId: teamId });
      } else {
        callback({ success: false, message: 'Invalid Team Password' });
      }
    }
  });

  socket.on('setActivePlayer', async ({ playerId }) => {
    const player = db.players.find(p => p.id === playerId);
    if (player && player.status === 'upcoming') {
      db.globalState.activePlayerId = playerId;
      db.globalState.currentBid = player.basePrice;
      db.globalState.currentBidderId = null;

      await supabase.from('global_state').update({
        activePlayerId: playerId,
        currentBid: player.basePrice,
        currentBidderId: null
      }).eq('id', 1);

      io.emit('stateUpdate', { globalState: db.globalState, players: db.players });
    }
  });

  socket.on('placeBid', async ({ teamId, amount }) => {
    const team = db.teams.find(t => t.id === teamId);
    const activePlayer = db.players.find(p => p.id === db.globalState.activePlayerId);

    if (team && activePlayer) {
      if (team.players.length >= 25) {
        socket.emit('auctionError', 'Squad limit (25 players) reached!');
        return;
      }
      if (activePlayer.isOverseas) {
        let overseasCount = team.players.filter(pid => {
           let p = db.players.find(x => x.id === pid);
           return p && p.isOverseas;
        }).length;
        if (overseasCount >= 8) {
           socket.emit('auctionError', 'Overseas player limit (8 players) reached!');
           return;
        }
      }

      if (amount > db.globalState.currentBid && amount <= team.budget) {
        db.globalState.currentBid = amount;
        db.globalState.currentBidderId = teamId;
        
        await supabase.from('global_state').update({
          currentBid: amount,
          currentBidderId: teamId
        }).eq('id', 1);

        io.emit('stateUpdate', { globalState: db.globalState });
      } else if (amount > team.budget) {
        socket.emit('auctionError', 'Insufficient budget!');
      }
    }
  });

  socket.on('markSold', async () => {
    if (db.globalState.activePlayerId && db.globalState.currentBidderId) {
      const playerIdx = db.players.findIndex(p => p.id === db.globalState.activePlayerId);
      const teamIdx = db.teams.findIndex(t => t.id === db.globalState.currentBidderId);

      if (playerIdx !== -1 && teamIdx !== -1) {
        const price = db.globalState.currentBid;
        if (db.teams[teamIdx].budget >= price) {
          const player = db.players[playerIdx];
          const team = db.teams[teamIdx];
          
          player.status = 'sold';
          player.team = db.globalState.currentBidderId;
          
          let bcciExcess = 0;
          let finalPrice = price;
          if(player.isOverseas && price > 1800) {
             bcciExcess = price - 1800;
             finalPrice = 1800;
          }

          player.finalPrice = finalPrice;
          player.bcciExcess = bcciExcess;

          team.budget -= price;
          team.players.push(player.id);

          // Reset active player
          db.globalState.activePlayerId = null;
          db.globalState.currentBid = 0;
          db.globalState.currentBidderId = null;

          // Update Supabase
          await Promise.all([
            supabase.from('players').update({ 
               status: 'sold', 
               team: player.team, 
               finalPrice: player.finalPrice, 
               bcciExcess: player.bcciExcess 
            }).eq('id', player.id),
            supabase.from('teams').update({ 
               budget: team.budget, 
               players: team.players 
            }).eq('id', team.id),
            supabase.from('global_state').update({
               activePlayerId: null,
               currentBid: 0,
               currentBidderId: null
            }).eq('id', 1)
          ]);

          io.emit('stateUpdate', { 
            globalState: db.globalState, 
            players: db.players, 
            teams: db.teams 
          });
          
          io.emit('playerSold', {
            player: player,
            team: team,
            price: price
          });
        }
      }
    }
  });

  socket.on('markUnsold', async () => {
    if (db.globalState.activePlayerId) {
      const playerIdx = db.players.findIndex(p => p.id === db.globalState.activePlayerId);
      if (playerIdx !== -1) {
        const player = db.players[playerIdx];
        player.status = 'unsold';
        
        db.globalState.activePlayerId = null;
        db.globalState.currentBid = 0;
        db.globalState.currentBidderId = null;
        
        await Promise.all([
          supabase.from('players').update({ status: 'unsold' }).eq('id', player.id),
          supabase.from('global_state').update({
            activePlayerId: null,
            currentBid: 0,
            currentBidderId: null
          }).eq('id', 1)
        ]);

        io.emit('stateUpdate', { 
          globalState: db.globalState, 
          players: db.players 
        });
      }
    }
  });

  socket.on('acceleratedRound', async () => {
    const unsoldIds = db.players.filter(p => p.status === 'unsold').map(p => p.id);
    db.players.forEach(p => {
      if (p.status === 'unsold') p.status = 'upcoming';
    });

    if (unsoldIds.length > 0) {
      await supabase.from('players').update({ status: 'upcoming' }).in('id', unsoldIds);
    }

    io.emit('stateUpdate', { players: db.players });
  });

  socket.on('resetBiddings', async () => {
    db.players.forEach(p => {
      p.status = 'upcoming';
      p.team = null;
      p.finalPrice = null;
      p.bcciExcess = 0;
    });

    db.teams.forEach(t => {
      t.budget = 10000;
      t.players = [];
    });

    db.globalState = {
      activePlayerId: null,
      currentBid: 0,
      currentBidderId: null
    };

    // Bulk update approach for Supabase
    // Note: JS client doesn't do mass updates easily on different rows without identical data, 
    // but here we are resetting MANY rows. It's better to fetch and upsert or use an RPC.
    // For simplicity, we'll suggest an RPC or just do a few updates.
    
    await Promise.all([
      supabase.from('players').update({ status: 'upcoming', team: null, finalPrice: null, bcciExcess: 0 }).neq('id', 'dummy'),
      supabase.from('teams').update({ budget: 10000, players: [] }).neq('id', 'dummy'),
      supabase.from('global_state').update({ activePlayerId: null, currentBid: 0, currentBidderId: null }).eq('id', 1)
    ]);

    io.emit('initialState', { 
      teams: db.teams, 
      players: db.players, 
      globalState: db.globalState 
    });
  });

  socket.on('updatePlayer', async (playerData) => {
    if(playerData.id) {
       let idx = db.players.findIndex(p => p.id === playerData.id);
       if(idx !== -1) {
           db.players[idx] = { ...db.players[idx], ...playerData };
           await supabase.from('players').upsert(db.players[idx]);
       }
    } else {
       const newPlayer = {
           ...playerData,
           id: 'p' + (db.players.length + 1),
           status: 'upcoming',
           team: null,
           finalPrice: null,
           bcciExcess: 0
       };
       db.players.push(newPlayer);
       await supabase.from('players').insert(newPlayer);
    }

    io.emit('initialState', { 
      teams: db.teams, 
      players: db.players, 
      globalState: db.globalState 
    }); 
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
