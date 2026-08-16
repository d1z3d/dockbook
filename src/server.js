'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

function createServer (outDir, { liveReload = false } = {}) {
  const sseClients = new Set()

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost')

    if (liveReload && parsed.pathname === '/__dockbook_events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      res.write('\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    let filePath = path.join(outDir, decodeURIComponent(parsed.pathname))
    if (parsed.pathname === '/' || !path.extname(parsed.pathname)) {
      filePath = path.join(outDir, 'index.html')
    }
    if (!filePath.startsWith(outDir)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    const sendIndex = () => {
      fs.readFile(path.join(outDir, 'index.html'), 'utf8', (err2, indexData) => {
        if (err2) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        if (liveReload) {
          indexData = indexData.replace('</body>', `<script>
            new EventSource('/__dockbook_events').onmessage = () => location.reload()
          </script></body>`)
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
        res.end(indexData)
      })
    }

    if (filePath === path.join(outDir, 'index.html')) {
      sendIndex()
      return
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        sendIndex()
        return
      }
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(data)
    })
  })

  server.broadcastReload = () => {
    for (const client of sseClients) {
      client.write('data: reload\n\n')
    }
  }

  return server
}

module.exports = { createServer }
