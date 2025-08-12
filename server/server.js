import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server } from 'socket.io'
import http from 'http'
import dotenv from 'dotenv'

dotenv.config()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3001
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'betoff07'
const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'bets.json')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8')

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use((err, req, res, next) => {
  if (err) { console.error('Middleware error:', err?.message || err); return res.status(400).json({ error: 'bad_request' }) }
  next()
})

const readBets = () => { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) ?? [] } catch (e) { console.error('readBets error:', e?.message || e); return [] } }
const writeBets = (bets) => fs.writeFileSync(DATA_FILE, JSON.stringify(bets, null, 2), 'utf8')
const backupBets = (bets) => { try{ const stamp = new Date().toISOString().replace(/[:.]/g,'-'); const file = path.join(BACKUP_DIR, `bets-${stamp}.json`); fs.writeFileSync(file, JSON.stringify(bets, null, 2), 'utf8') }catch(e){ console.error('backup error:', e?.message || e) } }
const isAuthed = (req) => (req.headers['x-admin-password'] === ADMIN_PASSWORD)

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.get('/api/version', (req, res) => res.json({ version: 'v3.9' }))

// strict auth check for admin
app.get('/api/auth/check', (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' })
  res.json({ ok: true })
})

// bets API
app.get('/api/bets', (req, res) => res.json(readBets()))
app.get('/api/bets/export', (req, res) => {
  try {
    const buf = fs.readFileSync(DATA_FILE)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="bets.json"')
    res.send(buf)
  } catch (e) {
    console.error('export error:', e?.message||e)
    res.status(500).json({ error: 'export_failed' })
  }
})
app.put('/api/bets', (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' })
  const payload = Array.isArray(req.body) ? req.body : []
  writeBets(payload); backupBets(payload)
  io.emit('bets:update', payload)
  res.json({ ok: true, count: payload.length })
})
app.post('/api/bets', (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' })
  const bet = req.body || {}
  const bets = readBets()
  bets.unshift({
    time: bet.time || '',
    id: String(bet.id || Date.now()),
    match: bet.match || '',
    bet: bet.bet || '',
    status: bet.status || 'Нерасчитана',
    stake_value: Number(bet.stake_value || 0),
    stake_currency: bet.stake_currency || 'RUB',
    coef: Number(bet.coef || 0),
    win_value: Number(bet.win_value || 0),
    win_currency: bet.win_currency || 'RUB'
  })
  writeBets(bets)
  io.emit('bets:update', bets)
  res.json({ ok: true })
})
app.patch('/api/bets/:id', (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' })
  const id = String(req.params.id)
  const bets = readBets()
  const idx = bets.findIndex(b => String(b.id) === id)
  if (idx === -1) return res.status(404).json({ error: 'not_found' })
  const allowed = ['time','match','bet','status','stake_value','stake_currency','coef','win_value','win_currency']
  for (const k of allowed) if (k in req.body) bets[idx][k] = req.body[k]
  bets[idx].stake_value = Number(bets[idx].stake_value || 0)
  bets[idx].coef = Number(bets[idx].coef || 0)
  bets[idx].win_value = Number(bets[idx].win_value || 0)
  writeBets(bets)
  io.emit('bets:update', bets)
  res.json({ ok: true })
})
app.delete('/api/bets/:id', (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' })
  const id = String(req.params.id)
  const bets = readBets().filter(b => String(b.id) !== id)
  writeBets(bets); backupBets(bets)
  io.emit('bets:update', bets)
  res.json({ ok: true })
})

io.on('connection', (socket) => socket.emit('bets:update', readBets()))
server.listen(PORT, () => {
  console.log(`[BETOFF] API v3.9 on http://localhost:${PORT}`)
  console.log(`[BETOFF] Admin password loaded: ${ADMIN_PASSWORD ? 'OK' : 'MISSING'}`)
})
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r))
process.on('uncaughtException', (e) => console.error('uncaughtException:', e))
