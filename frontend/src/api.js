/** Centralised API client — all fetch calls live here. */

const BASE = '/api'

async function handleRes(res) {
  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try { msg = JSON.parse(text)?.detail ?? text } catch {}
    throw new Error(`${res.status}: ${msg}`)
  }
  return res.json()
}

/** POST /api/upload — Stage 1 quality gate */
export async function uploadImage(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: fd })
  return handleRes(res)
}

/** POST /api/analyze/{imageId} — Stages 2→3→4 */
export async function analyzeImage(imageId) {
  const res = await fetch(`${BASE}/analyze/${imageId}`, { method: 'POST' })
  return handleRes(res)
}

/** GET /api/report/{reportId} */
export async function getReport(reportId) {
  const res = await fetch(`${BASE}/report/${reportId}`)
  return handleRes(res)
}

/** GET /api/worklist */
export async function getWorklist() {
  const res = await fetch(`${BASE}/worklist`)
  return handleRes(res)
}
