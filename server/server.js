const path = require('path')
const fs = require('fs')
const http = require('http')
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const PORT = process.env.PORT || 3001
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'betoff07'

const app = express()
const server = http.createServer(app)
const { Server } = require('socket.io')
const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: true, methods: ['GET','POST','PUT','PATCH','DELETE'] }
})

app.use(express.json({ limit: '1mb' }))
app.use(cors())

// Data files
const DATA_DIR = path.join(__dirname, 'data')
const BACKUP_DIR = path.join(__dirname, 'backups')
const BETS_FILE = path.join(DATA_DIR, 'bets.json')
fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(BACKUP_DIR, { recursive: true })
if (!fs.existsSync(BETS_FILE)) fs.writeFileSync(BETS_FILE, '[]', 'utf8')

function readBets(){
  try { const a = JSON.parse(fs.readFileSync(BETS_FILE, 'utf8')); return Array.isArray(a)? a:[] } catch { return [] }
}
function backup(){
  const ts = new Date().toISOString().replace(/[:.]/g,'-')
  try { fs.copyFileSync(BETS_FILE, path.join(BACKUP_DIR, `bets-${ts}.json`)) } catch {}
}
function writeBets(bets){
  fs.writeFileSync(BETS_FILE, JSON.stringify(bets, null, 2), 'utf8')
  io.emit('bets:update', bets)
}

// Auth
function requireAdmin(req,res,next){
  const pw = req.headers['x-admin-password']
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' })
  next()
}

// API
app.get('/api/health', (req,res)=> res.json({ ok: true }))
app.get('/api/bets', (req,res)=> res.json(readBets()))

app.put('/api/bets', requireAdmin, (req,res)=> {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be array' })
  backup(); writeBets(req.body); res.json({ ok: true })
})
app.post('/api/bets', requireAdmin, (req,res)=> {
  const bets = readBets()
  bets.unshift(req.body || {})
  backup(); writeBets(bets); res.json({ ok: true })
})
app.patch('/api/bets/:id', requireAdmin, (req,res)=> {
  const id = String(req.params.id)
  const bets = readBets()
  const i = bets.findIndex(b => String(b.id) === id)
  if (i === -1) return res.status(404).json({ error: 'not found' })
  bets[i] = { ...bets[i], ...(req.body||{}) }
  backup(); writeBets(bets); res.json({ ok: true })
})
app.delete('/api/bets/:id', requireAdmin, (req,res)=> {
  const id = String(req.params.id)
  const next = readBets().filter(b => String(b.id) !== id)
  backup(); writeBets(next); res.json({ ok: true })
})
app.get('/api/auth/check', (req,res)=> {
  const pw = req.headers['x-admin-password']
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ ok:false })
  res.json({ ok: true })
})

// sockets
io.on('connection', ()=>{})

// static client
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist')
app.use(express.static(CLIENT_DIST))
app.get('*', (req,res) => {
  if (req.path.startsWith('/api')) return res.status(404).end()
  res.sendFile(path.join(CLIENT_DIST, 'index.html'))
})

server.listen(PORT, ()=> console.log(`BETOFF listening on http://0.0.0.0:${PORT}`))
