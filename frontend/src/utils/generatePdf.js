/**
 * generatePdf.js
 * ──────────────────────────────────────────────────────────────
 * Builds a professional, multi-page PDF report for a DR
 * screening analysis using jsPDF.
 *
 * Key sections rendered:
 *   1. Header & report metadata
 *   2. Summary — ICDR grade, quality, referable probability
 *   3. Grade probabilities bar chart
 *   4. Quality breakdown
 *   5. Evidence table (lesion findings)
 *   6. Segmentation statistics
 *   7. Clinical recommendation
 *   8. Embedded fundus images (original + grad-cam)
 *   9. Footer with timestamp & disclaimer
 */
import jsPDF from 'jspdf'

// ── Color palette ───────────────────────────────────────────
const COLORS = {
  primary:   [15, 23, 42],     // slate-900
  secondary: [71, 85, 105],    // slate-500
  muted:     [148, 163, 184],  // slate-400
  white:     [255, 255, 255],
  bgLight:   [248, 250, 252],  // slate-50
  bgMedium:  [241, 245, 249],  // slate-100
  border:    [226, 232, 240],  // slate-200
  accent:    [59, 130, 246],   // blue-500
  green:     [22, 163, 74],
  amber:     [217, 119, 6],
  red:       [220, 38, 38],
  violet:    [124, 58, 237],
}

const GRADE_COLORS = [
  [22, 163, 74],    // Grade 0 — green
  [101, 163, 13],   // Grade 1 — lime
  [217, 119, 6],    // Grade 2 — amber
  [220, 38, 38],    // Grade 3 — red
  [124, 58, 237],   // Grade 4 — violet
]

const GRADE_LABELS = [
  'No DR',
  'Mild NPDR',
  'Moderate NPDR',
  'Severe NPDR',
  'Proliferative DR',
]

// ── Helpers ─────────────────────────────────────────────────
const pct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
const PAGE_W = 210  // A4 width mm
const PAGE_H = 297  // A4 height mm
const MARGIN = 18
const CONTENT_W = PAGE_W - 2 * MARGIN

/**
 * Load an image URL into a data-URL suitable for jsPDF.
 * Returns null if loading fails.
 */
async function loadImageAsDataURL(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Ensure we have enough room; if not, add a new page.
 */
function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE_H - MARGIN - 10) {
    doc.addPage()
    return MARGIN + 5
  }
  return y
}

/**
 * Draw a horizontal separator line.
 */
function drawSeparator(doc, y, color = COLORS.border) {
  doc.setDrawColor(...color)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  return y + 4
}

// ── Main export ─────────────────────────────────────────────
export default async function generatePdf(report, reportId, patientInfo = null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { grade = {}, quality = {}, segmentation = {}, explainability = {}, images = {}, recommendation } = report

  // Pre-load key images
  const [originalImg, gradcamImg, fusedOverlayImg, fusedSegImg] = await Promise.all([
    images.original           ? loadImageAsDataURL(images.original)           : null,
    images.gradcam            ? loadImageAsDataURL(images.gradcam)            : null,
    images.fused_overlay      ? loadImageAsDataURL(images.fused_overlay)      : null,
    images.fused_segmentation ? loadImageAsDataURL(images.fused_segmentation) : null,
  ])

  let y = MARGIN

  // ════════════════════════════════════════════════════════════
  // 1. HEADER
  // ════════════════════════════════════════════════════════════
  // Header background bar
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, PAGE_W, 28, 'F')

  // Title
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Fundus Analysis Report', MARGIN, 13)

  // Patient name in header if available
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  if (patientInfo?.patientName) {
    doc.text(`Patient: ${patientInfo.patientName}  |  ID: ${patientInfo.patientId}`, MARGIN, 20)
  } else {
    doc.text('EyeQ DR Screening Pipeline — Automated Diabetic Retinopathy Assessment', MARGIN, 20)
  }

  // Report ID on right
  doc.setFontSize(7.5)
  doc.setTextColor(180, 200, 220)
  doc.text(`Report ID: ${reportId}`, PAGE_W - MARGIN, 13, { align: 'right' })
  doc.text(`Generated: ${new Date().toLocaleString()}`, PAGE_W - MARGIN, 18, { align: 'right' })

  y = 35

  // ════════════════════════════════════════════════════════════
  // 1b. PATIENT DETAILS
  // ════════════════════════════════════════════════════════════
  if (patientInfo) {
    doc.setTextColor(...COLORS.primary)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Patient Information', MARGIN, y + 2)
    y += 8

    // Patient details table
    const fields = [
      ['Patient ID', patientInfo.patientId],
      ['Patient Name', patientInfo.patientName],
      ['Age', `${patientInfo.age} years`],
      ['Gender', patientInfo.gender],
      ['Duration of Diabetes', `${patientInfo.diabetesDuration} years`],
    ]
    if (patientInfo.hba1c) fields.push(['HbA1c', `${patientInfo.hba1c}%`])
    if (patientInfo.previousTreatment) fields.push(['Previous Eye Treatment', patientInfo.previousTreatment])
    if (patientInfo.visionSymptoms) fields.push(['Vision / Eye Symptoms', patientInfo.visionSymptoms])

    // Render as a 2-column key-value grid
    const kvColW = 42
    const kvValW = CONTENT_W / 2 - kvColW - 4

    // Background
    const rowsPerSide = Math.ceil(fields.length / 2)
    const tableH = Math.max(rowsPerSide * 6.5 + 2, 14)
    doc.setFillColor(...COLORS.bgLight)
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.3)
    doc.roundedRect(MARGIN, y, CONTENT_W, tableH, 2, 2, 'FD')

    fields.forEach((f, i) => {
      const col = i < rowsPerSide ? 0 : 1
      const row = i < rowsPerSide ? i : i - rowsPerSide
      const baseX = MARGIN + 4 + col * (CONTENT_W / 2)
      const baseY = y + 5 + row * 6.5

      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.muted)
      doc.text(f[0] + ':', baseX, baseY)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.primary)
      const valText = doc.splitTextToSize(String(f[1] ?? ''), kvValW)
      doc.text(valText[0] ?? '', baseX + kvColW, baseY)
    })

    y += tableH + 4
    y = drawSeparator(doc, y)
  }

  // ════════════════════════════════════════════════════════════
  // 2. SUMMARY CARD
  // ════════════════════════════════════════════════════════════
  const gradeIdx = grade.icdr_grade ?? 0
  const gColor = GRADE_COLORS[gradeIdx] ?? COLORS.muted

  // Card background
  doc.setFillColor(...COLORS.bgLight)
  doc.setDrawColor(...gColor)
  doc.setLineWidth(0.6)
  doc.roundedRect(MARGIN, y, CONTENT_W, 32, 3, 3, 'FD')

  // Grade circle
  const circleX = MARGIN + 16
  const circleY = y + 16
  doc.setFillColor(...gColor)
  doc.circle(circleX, circleY, 10, 'F')
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(String(gradeIdx), circleX, circleY + 1, { align: 'center', baseline: 'middle' })

  // Grade label
  const labelX = MARGIN + 32
  doc.setTextColor(...COLORS.primary)
  doc.setFontSize(14)
  doc.text(grade.icdr_label ?? GRADE_LABELS[gradeIdx], labelX, y + 10)

  // Grade description
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.secondary)
  const descLines = doc.splitTextToSize(grade.icdr_description ?? '', CONTENT_W - 50)
  doc.text(descLines, labelX, y + 16)

  // Referable badge
  const badgeY = y + 27
  if (grade.referable) {
    doc.setFillColor(...COLORS.red)
    doc.roundedRect(labelX, badgeY - 3.5, 32, 5.5, 1.5, 1.5, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text('⚠ REFERABLE DR', labelX + 16, badgeY, { align: 'center' })
  } else {
    doc.setFillColor(...COLORS.green)
    doc.roundedRect(labelX, badgeY - 3.5, 32, 5.5, 1.5, 1.5, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text('✓ NON-REFERABLE', labelX + 16, badgeY, { align: 'center' })
  }

  // Referable probability (right side of summary)
  const probX = PAGE_W - MARGIN - 50
  doc.setTextColor(...COLORS.secondary)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Referable DR Probability', probX, y + 8)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(grade.referable ? COLORS.red : COLORS.green))
  doc.text(
    grade.referable_probability != null
      ? `${(grade.referable_probability * 100).toFixed(1)}%`
      : '—',
    probX, y + 18
  )
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.muted)
  doc.text(
    `Threshold: ≥${grade.referable_threshold != null ? (grade.referable_threshold * 100).toFixed(0) : '50'}%`,
    probX, y + 23
  )

  y += 38

  // Quality line
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.secondary)
  doc.text('Image Quality:', MARGIN, y)
  const qColor = quality.label === 'Good' ? COLORS.green : quality.label === 'Usable' ? COLORS.amber : COLORS.red
  doc.setTextColor(...qColor)
  doc.text(`${quality.label ?? '—'}  (${pct(quality.confidence)} confidence)`, MARGIN + 28, y)
  y += 6

  y = drawSeparator(doc, y)

  // ════════════════════════════════════════════════════════════
  // 3. GRADE PROBABILITIES
  // ════════════════════════════════════════════════════════════
  doc.setTextColor(...COLORS.primary)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Grade Probabilities', MARGIN, y + 2)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.muted)
  doc.text('CORAL ordinal head · Calibrated with temperature scaling', MARGIN + 42, y + 2)
  y += 8

  const probs = grade.class_probabilities ?? {}
  const probEntries = Object.entries(probs)
  const barH = 5
  const barMaxW = CONTENT_W - 55

  probEntries.forEach(([label, prob], i) => {
    y = ensureSpace(doc, y, barH + 4)
    const clr = GRADE_COLORS[i] ?? COLORS.muted

    // Label
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.primary)
    doc.text(`Grade ${i} — ${label}`, MARGIN, y + 3.5)

    // Background track
    const barX = MARGIN + 45
    doc.setFillColor(...COLORS.bgMedium)
    doc.roundedRect(barX, y, barMaxW, barH, 1.5, 1.5, 'F')

    // Fill
    const fillW = Math.max(1, prob * barMaxW)
    doc.setFillColor(...clr)
    doc.roundedRect(barX, y, fillW, barH, 1.5, 1.5, 'F')

    // Percentage
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.primary)
    doc.text(`${(prob * 100).toFixed(1)}%`, barX + barMaxW + 3, y + 3.5)

    y += barH + 3
  })

  y += 3
  y = drawSeparator(doc, y)

  // ════════════════════════════════════════════════════════════
  // 4. QUALITY BREAKDOWN
  // ════════════════════════════════════════════════════════════
  y = ensureSpace(doc, y, 30)
  doc.setTextColor(...COLORS.primary)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Quality Assessment Breakdown', MARGIN, y + 2)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.muted)
  doc.text('EfficientNet-B0 quality classifier', MARGIN + 57, y + 2)
  y += 8

  const qProbs = quality.probs ?? {}
  Object.entries(qProbs).forEach(([label, prob]) => {
    y = ensureSpace(doc, y, barH + 4)
    const clr = label === 'Good' ? COLORS.green : label === 'Usable' ? COLORS.amber : COLORS.red

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.primary)
    doc.text(label, MARGIN, y + 3.5)

    const barX = MARGIN + 45
    doc.setFillColor(...COLORS.bgMedium)
    doc.roundedRect(barX, y, barMaxW, barH, 1.5, 1.5, 'F')

    const fillW = Math.max(1, prob * barMaxW)
    doc.setFillColor(...clr)
    doc.roundedRect(barX, y, fillW, barH, 1.5, 1.5, 'F')

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.primary)
    doc.text(`${(prob * 100).toFixed(1)}%`, barX + barMaxW + 3, y + 3.5)

    y += barH + 3
  })

  y += 3
  y = drawSeparator(doc, y)

  // ════════════════════════════════════════════════════════════
  // 5. EVIDENCE TABLE
  // ════════════════════════════════════════════════════════════
  const evidenceRows = explainability.evidence_table ?? []
  if (evidenceRows.length > 0) {
    y = ensureSpace(doc, y, 15 + evidenceRows.length * 7)
    doc.setTextColor(...COLORS.primary)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Evidence Table', MARGIN, y + 2)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    doc.text('Lesion findings mapped to ICDR criteria', MARGIN + 30, y + 2)
    y += 8

    // Table header
    const colW = [50, 28, 22, CONTENT_W - 100]
    const headers = ['Lesion Type', 'Pixel Count', 'Clusters', 'ICDR Criterion']

    doc.setFillColor(...COLORS.primary)
    doc.rect(MARGIN, y, CONTENT_W, 6.5, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')

    let cx = MARGIN + 2
    headers.forEach((h, i) => {
      doc.text(h, cx, y + 4.5)
      cx += colW[i]
    })
    y += 7.5

    // Table rows
    evidenceRows.forEach((row, ri) => {
      y = ensureSpace(doc, y, 7)
      if (ri % 2 === 0) {
        doc.setFillColor(...COLORS.bgLight)
        doc.rect(MARGIN, y - 0.5, CONTENT_W, 6.5, 'F')
      }

      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.primary)

      cx = MARGIN + 2
      // Color dot for lesion
      if (row.color) {
        const hex = row.color.replace('#', '')
        const r = parseInt(hex.substring(0, 2), 16)
        const g = parseInt(hex.substring(2, 4), 16)
        const b = parseInt(hex.substring(4, 6), 16)
        doc.setFillColor(r, g, b)
        doc.circle(cx + 1, y + 2.5, 1.5, 'F')
      }
      doc.text(row.lesion ?? '', cx + 5, y + 4)
      cx += colW[0]

      doc.setTextColor(...COLORS.secondary)
      doc.text(row.count > 0 ? row.count.toLocaleString() : '—', cx, y + 4)
      cx += colW[1]

      doc.text(row.components > 0 ? String(row.components) : '—', cx, y + 4)
      cx += colW[2]

      doc.setFontSize(6.5)
      const critLines = doc.splitTextToSize(row.icdr_criterion ?? '', colW[3] - 4)
      doc.text(critLines[0] ?? '', cx, y + 4)

      y += 7
    })

    y += 3
    y = drawSeparator(doc, y)
  }

  // ════════════════════════════════════════════════════════════
  // 6. SEGMENTATION STATISTICS
  // ════════════════════════════════════════════════════════════
  if (segmentation.available) {
    y = ensureSpace(doc, y, 40)
    doc.setTextColor(...COLORS.primary)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Retinal Structure Segmentation', MARGIN, y + 2)
    y += 9

    // Stats grid
    const stats = [
      { label: 'Optic Disc', value: segmentation.od_detected ? 'Detected' : 'Not detected',
        sub: segmentation.od_area_px ? `${segmentation.od_area_px.toLocaleString()} px area` : '' },
      { label: 'Macula / Fovea', value: segmentation.macula_point ? 'Located' : 'Not found',
        sub: segmentation.macula_point ? `(${segmentation.macula_point[0]}, ${segmentation.macula_point[1]})` : '' },
      { label: 'Vessel Coverage', value: pct(segmentation.vessel_coverage), sub: 'of canonical frame' },
    ]

    const boxW = (CONTENT_W - 6) / 3
    stats.forEach((s, i) => {
      const bx = MARGIN + i * (boxW + 3)
      doc.setFillColor(...COLORS.bgMedium)
      doc.roundedRect(bx, y, boxW, 16, 2, 2, 'F')

      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.muted)
      doc.text(s.label, bx + 4, y + 5)

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.primary)
      doc.text(s.value, bx + 4, y + 11)

      if (s.sub) {
        doc.setFontSize(6)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...COLORS.muted)
        doc.text(s.sub, bx + 4, y + 14.5)
      }
    })
    y += 21

    // Lesion counts summary
    const lesionTypes = [
      { code: 'MA',  label: 'Microaneurysms',   clr: COLORS.red },
      { code: 'EX',  label: 'Hard Exudates',    clr: COLORS.amber },
      { code: 'HE',  label: 'Haemorrhages',     clr: COLORS.violet },
      { code: 'CWS', label: 'Cotton-Wool Spots', clr: COLORS.accent },
    ]

    const lCounts = segmentation.lesion_counts ?? {}
    const lComps  = segmentation.lesion_components ?? {}
    const lNearest = segmentation.lesion_nearest_macula ?? {}

    // Mini table
    const lHeaders = ['Type', 'Pixel Count', 'Clusters', 'Nearest to Macula']
    const lColW = [48, 30, 24, CONTENT_W - 102]

    doc.setFillColor(60, 70, 90)
    doc.rect(MARGIN, y, CONTENT_W, 6, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    let cx = MARGIN + 2
    lHeaders.forEach((h, i) => {
      doc.text(h, cx, y + 4)
      cx += lColW[i]
    })
    y += 7

    lesionTypes.forEach((lt, ri) => {
      y = ensureSpace(doc, y, 7)
      if (ri % 2 === 0) {
        doc.setFillColor(...COLORS.bgLight)
        doc.rect(MARGIN, y - 0.5, CONTENT_W, 6.5, 'F')
      }

      let cx = MARGIN + 2
      doc.setFillColor(...lt.clr)
      doc.circle(cx + 1, y + 2.5, 1.5, 'F')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.primary)
      doc.text(`${lt.code}`, cx + 5, y + 4)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.secondary)
      doc.text(lt.label, cx + 14, y + 4)
      cx += lColW[0]

      const cnt = lCounts[lt.code] ?? 0
      doc.text(cnt > 0 ? cnt.toLocaleString() : '—', cx, y + 4)
      cx += lColW[1]

      const comps = lComps[lt.code] ?? 0
      doc.text(comps > 0 ? String(comps) : '—', cx, y + 4)
      cx += lColW[2]

      const near = lNearest[lt.code]
      doc.text(near != null ? `${near} px` : '—', cx, y + 4)

      y += 7
    })

    // Vessel density quadrants
    const vdq = segmentation.vessel_density_quadrants ?? {}
    if (Object.keys(vdq).length > 0) {
      y += 3
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.primary)
      doc.text('Vessel Density by Quadrant', MARGIN, y + 2)
      y += 6

      const qLabels = { TL: 'Top-Left', TR: 'Top-Right', BL: 'Bottom-Left', BR: 'Bottom-Right' }
      const quadrants = ['TL', 'TR', 'BL', 'BR']
      const qBoxW = 32
      quadrants.forEach((q, i) => {
        const qx = MARGIN + i * (qBoxW + 4)
        const val = vdq[q] ?? 0
        const qClr = val > 0.1 ? COLORS.green : val > 0.05 ? [101, 163, 13] : val > 0.02 ? COLORS.amber : COLORS.muted
        doc.setFillColor(...COLORS.bgMedium)
        doc.roundedRect(qx, y, qBoxW, 12, 2, 2, 'F')
        doc.setFontSize(6)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...COLORS.muted)
        doc.text(qLabels[q], qx + 2, y + 4)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...qClr)
        doc.text(`${(val * 100).toFixed(1)}%`, qx + 2, y + 10)
      })
      y += 16
    }

    y += 2
    y = drawSeparator(doc, y)
  }

  // ════════════════════════════════════════════════════════════
  // 7. RECOMMENDATION
  // ════════════════════════════════════════════════════════════
  if (recommendation) {
    y = ensureSpace(doc, y, 22)
    doc.setTextColor(...COLORS.primary)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Clinical Recommendation', MARGIN, y + 2)
    y += 7

    doc.setFillColor(grade.referable ? 255 : 240, grade.referable ? 245 : 253, grade.referable ? 245 : 244)
    doc.setDrawColor(...(grade.referable ? COLORS.red : COLORS.green))
    doc.setLineWidth(0.4)
    const recLines = doc.splitTextToSize(recommendation, CONTENT_W - 12)
    const recH = Math.max(12, recLines.length * 4.5 + 6)
    doc.roundedRect(MARGIN, y, CONTENT_W, recH, 2, 2, 'FD')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.primary)
    doc.text(recLines, MARGIN + 6, y + 5.5)
    y += recH + 5

    y = drawSeparator(doc, y)
  }

  // ════════════════════════════════════════════════════════════
  // 8. FUNDUS & SEGMENTATION IMAGES
  // ════════════════════════════════════════════════════════════
  // Collect all available images with labels
  const allImages = [
    { data: originalImg,     label: 'Original Fundus' },
    { data: gradcamImg,      label: 'Grad-CAM Heatmap' },
    { data: fusedOverlayImg, label: 'Fused Overlay (Lesions + Grad-CAM)' },
    { data: fusedSegImg,     label: 'Stage 2 — Fused Segmentation' },
  ].filter(img => img.data)

  if (allImages.length > 0) {
    // Start a new page for images to give them room
    doc.addPage()
    y = MARGIN

    // Section header
    doc.setFillColor(...COLORS.primary)
    doc.rect(0, 0, PAGE_W, 18, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Fundus Image Analysis & Segmentation Overlays', MARGIN, 12)
    y = 25

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    doc.text('Visual outputs from all pipeline stages — original capture, Grad-CAM activation, lesion overlay, and retinal segmentation.', MARGIN, y)
    y += 7

    // Render images in a 2-column grid
    const imgSize = 82
    const gap = 8
    const colX = [MARGIN, MARGIN + imgSize + gap]
    let col = 0
    let rowY = y

    allImages.forEach((img, idx) => {
      // Check if we need a new page (image + label + padding)
      if (col === 0) {
        rowY = ensureSpace(doc, rowY, imgSize + 14)
      }

      const ix = colX[col]

      // Image border frame
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.3)
      doc.roundedRect(ix - 1, rowY - 1, imgSize + 2, imgSize + 2, 2, 2, 'S')

      try {
        doc.addImage(img.data, 'JPEG', ix, rowY, imgSize, imgSize)
      } catch { /* skip corrupt image */ }

      // Label below image
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.secondary)
      doc.text(img.label, ix + imgSize / 2, rowY + imgSize + 5, { align: 'center' })

      col++
      if (col >= 2) {
        col = 0
        rowY += imgSize + 14
      }
    })

    // If we ended on the second column, advance y
    if (col > 0) {
      rowY += imgSize + 14
    }
    y = rowY

    // Color legend for segmentation overlays
    if (fusedOverlayImg || fusedSegImg) {
      y = ensureSpace(doc, y, 22)
      y += 2

      doc.setFillColor(...COLORS.bgLight)
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.3)
      doc.roundedRect(MARGIN, y, CONTENT_W, 18, 2, 2, 'FD')

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.primary)
      doc.text('Overlay Legend', MARGIN + 4, y + 5)

      const legendItems = [
        { color: [220, 38, 38],  label: 'MA — Microaneurysms' },
        { color: [217, 119, 6],  label: 'EX — Hard Exudates' },
        { color: [124, 58, 237], label: 'HE — Haemorrhages' },
        { color: [2, 132, 199],  label: 'CWS — Cotton-Wool Spots' },
        { color: [0, 204, 204],  label: 'Optic Disc' },
        { color: [255, 204, 0],  label: 'Macula' },
        { color: [255, 80, 80],  label: 'Vessels' },
      ]

      let lx = MARGIN + 4
      let ly = y + 10
      legendItems.forEach((item, i) => {
        if (lx + 38 > PAGE_W - MARGIN) {
          lx = MARGIN + 4
          ly += 5
        }
        doc.setFillColor(...item.color)
        doc.roundedRect(lx, ly - 1.5, 3, 3, 0.5, 0.5, 'F')
        doc.setFontSize(6)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...COLORS.secondary)
        doc.text(item.label, lx + 4.5, ly + 0.5)
        lx += 38
      })

      y = ly + 8
    }
  }

  // ════════════════════════════════════════════════════════════
  // 9. FOOTER (on every page)
  // ════════════════════════════════════════════════════════════
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)

    // Footer line
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14)

    // Disclaimer
    doc.setFontSize(6)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...COLORS.muted)
    doc.text(
      'This report is generated by an AI-assisted screening system and is intended for clinical support only. It does not constitute a medical diagnosis.',
      MARGIN, PAGE_H - 10
    )

    // Page number
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' })

    // Pipeline credit
    doc.setFontSize(5.5)
    doc.text('EyeQ DR Screening Pipeline v1.0', PAGE_W / 2, PAGE_H - 6, { align: 'center' })
  }

  // ── Save ─────────────────────────────────────────────────
  let fileName
  if (patientInfo?.patientId && patientInfo?.patientName) {
    const safeId   = patientInfo.patientId.replace(/[^a-zA-Z0-9\-]/g, '')
    const safeName = patientInfo.patientName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
    fileName = `${safeId}_${safeName}.pdf`
  } else {
    fileName = `DR_Report_${reportId.substring(0, 8)}.pdf`
  }
  doc.save(fileName)
}
