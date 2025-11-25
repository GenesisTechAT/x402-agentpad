/**
 * Simple Local Dashboard Server
 * 
 * Provides a web-based dashboard to monitor your agents in real-time.
 * 
 * Usage:
 *   1. Run this server: tsx examples/dashboard-server.ts
 *   2. Open browser: http://localhost:3030
 *   3. Run your agents with the dashboard hook (see below)
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';

const app = express();
const server = createServer(app);
const io = new SocketIO(server, {
  cors: { origin: '*' }
});

// Store agent data in memory
interface AgentData {
  agentId: string;
  status: 'running' | 'stopped' | 'error';
  balance: string;
  executions: any[];
  startedAt: number;
  lastUpdate: number;
}

const agents = new Map<string, AgentData>();

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('📱 Dashboard connected');
  
  // Send current state to new connections
  socket.emit('agents', Array.from(agents.values()));
  
  socket.on('disconnect', () => {
    console.log('📱 Dashboard disconnected');
  });
});

// API endpoint to receive agent updates
app.use(express.json());

app.post('/agent/update', (req, res) => {
  const { agentId, type, data } = req.body;
  
  if (!agentId) {
    return res.status(400).json({ error: 'agentId required' });
  }
  
  let agent = agents.get(agentId);
  if (!agent) {
    agent = {
      agentId,
      status: 'running',
      balance: '0',
      executions: [],
      startedAt: Date.now(),
      lastUpdate: Date.now(),
    };
    agents.set(agentId, agent);
  }
  
  agent.lastUpdate = Date.now();
  
  // Handle different update types
  switch (type) {
    case 'start':
      agent.status = 'running';
      agent.startedAt = Date.now();
      break;
      
    case 'stop':
      agent.status = 'stopped';
      break;
      
    case 'error':
      agent.status = 'error';
      agent.executions.push({
        timestamp: Date.now(),
        action: 'error',
        success: false,
        error: data.error,
      });
      break;
      
    case 'execution':
      agent.executions.push({
        timestamp: data.timestamp || Date.now(),
        action: data.action,
        success: data.success,
        balanceBefore: data.balanceBefore,
        balanceAfter: data.balanceAfter,
        reasoning: data.decision?.reasoning,
        error: data.error,
      });
      
      // Keep only last 50 executions
      if (agent.executions.length > 50) {
        agent.executions = agent.executions.slice(-50);
      }
      
      // Update balance
      if (data.balanceAfter) {
        agent.balance = data.balanceAfter;
      }
      break;
  }
  
  // Broadcast update to all connected dashboards
  io.emit('agent-update', { agentId, agent });
  
  res.json({ success: true });
});

// Serve dashboard HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>AgentPad Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: system-ui, -apple-system, sans-serif; 
      background: #0a0e27; 
      color: #fff; 
      padding: 20px;
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px; 
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 10px;
    }
    .header h1 { font-size: 32px; margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    .agents { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
    .agent-card { 
      background: #1a1f3a; 
      border-radius: 10px; 
      padding: 20px; 
      border: 2px solid #2d3561;
    }
    .agent-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 15px; 
      padding-bottom: 15px; 
      border-bottom: 1px solid #2d3561;
    }
    .agent-id { font-weight: bold; font-size: 18px; }
    .status { 
      padding: 5px 12px; 
      border-radius: 20px; 
      font-size: 12px; 
      font-weight: bold;
    }
    .status.running { background: #10b981; color: white; }
    .status.stopped { background: #6b7280; color: white; }
    .status.error { background: #ef4444; color: white; }
    .stat { 
      display: flex; 
      justify-content: space-between; 
      padding: 8px 0; 
      border-bottom: 1px solid #2d3561;
    }
    .stat-label { opacity: 0.7; }
    .stat-value { font-weight: bold; }
    .executions { 
      margin-top: 15px; 
      max-height: 300px; 
      overflow-y: auto;
    }
    .execution { 
      padding: 10px; 
      margin: 5px 0; 
      background: #0f1429; 
      border-radius: 5px; 
      font-size: 13px;
      border-left: 3px solid #667eea;
    }
    .execution.error { border-left-color: #ef4444; }
    .exec-header { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 5px; 
      font-weight: bold;
    }
    .exec-body { opacity: 0.8; font-size: 12px; }
    .empty { text-align: center; opacity: 0.5; padding: 40px; }
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #0f1429; }
    ::-webkit-scrollbar-thumb { background: #667eea; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 AgentPad Dashboard</h1>
    <p>Real-time monitoring for your autonomous trading agents</p>
  </div>
  
  <div id="agents" class="agents"></div>
  <div id="empty" class="empty" style="display: none;">
    <h2>No agents running</h2>
    <p>Start an agent with the dashboard hook to see it here</p>
  </div>
  
  <script>
    const socket = io();
    const agentsDiv = document.getElementById('agents');
    const emptyDiv = document.getElementById('empty');
    
    const agents = new Map();
    
    function formatBalance(balance) {
      return (Number(balance) / 1e6).toFixed(2) + ' USDC';
    }
    
    function formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    }
    
    function formatUptime(startedAt) {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
      if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
      return seconds + 's';
    }
    
    function renderAgents() {
      if (agents.size === 0) {
        agentsDiv.style.display = 'none';
        emptyDiv.style.display = 'block';
        return;
      }
      
      agentsDiv.style.display = 'grid';
      emptyDiv.style.display = 'none';
      
      agentsDiv.innerHTML = Array.from(agents.values()).map(agent => {
        const successCount = agent.executions.filter(e => e.success).length;
        const totalCount = agent.executions.length;
        const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
        
        return \`
          <div class="agent-card">
            <div class="agent-header">
              <div class="agent-id">\${agent.agentId}</div>
              <div class="status \${agent.status}">\${agent.status.toUpperCase()}</div>
            </div>
            
            <div class="stat">
              <span class="stat-label">Balance</span>
              <span class="stat-value">\${formatBalance(agent.balance)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Executions</span>
              <span class="stat-value">\${totalCount}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Success Rate</span>
              <span class="stat-value">\${successRate}%</span>
            </div>
            <div class="stat">
              <span class="stat-label">Uptime</span>
              <span class="stat-value">\${formatUptime(agent.startedAt)}</span>
            </div>
            
            <div class="executions">
              <h3 style="margin: 15px 0 10px 0; font-size: 14px; opacity: 0.7;">Recent Executions</h3>
              \${agent.executions.slice().reverse().slice(0, 10).map(exec => \`
                <div class="execution \${exec.success ? '' : 'error'}">
                  <div class="exec-header">
                    <span>\${exec.success ? '✅' : '❌'} \${exec.action.toUpperCase()}</span>
                    <span>\${formatTime(exec.timestamp)}</span>
                  </div>
                  <div class="exec-body">
                    \${exec.reasoning || exec.error || 'No details'}
                  </div>
                </div>
              \`).join('') || '<p style="opacity: 0.5; padding: 10px;">No executions yet</p>'}
            </div>
          </div>
        \`;
      }).join('');
    }
    
    // Initial load
    socket.on('agents', (agentList) => {
      agentList.forEach(agent => agents.set(agent.agentId, agent));
      renderAgents();
    });
    
    // Real-time updates
    socket.on('agent-update', ({ agentId, agent }) => {
      agents.set(agentId, agent);
      renderAgents();
    });
    
    // Auto-refresh uptime every second
    setInterval(renderAgents, 1000);
  </script>
</body>
</html>
  `);
});

const PORT = process.env.DASHBOARD_PORT || 3030;

server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('│     🚀 AgentPad Dashboard Server                           │');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`│  📊 Dashboard URL: http://localhost:${PORT}                 │`);
  console.log(`│  📡 WebSocket: ws://localhost:${PORT}                      │`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('│  Usage:                                                     │');
  console.log('│  1. Keep this server running                                │');
  console.log('│  2. Open http://localhost:' + PORT + ' in browser              │');
  console.log('│  3. Run agents with dashboardUrl in config                  │');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
});

export { app, server, io };

