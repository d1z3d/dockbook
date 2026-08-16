'use strict'

function readJsonBody (req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > 2 * 1024 * 1024) {
        reject(new Error('payload_too_large'))
        req.destroy()
        return
      }
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) { resolve({}); return }
      try { resolve(JSON.parse(raw)) } catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

function sendJson (res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

module.exports = { readJsonBody, sendJson }
