import { useRef, useState } from 'react'

export default function UploadZone({ onFile, disabled }) {
  const inputRef  = useRef(null)
  const [dragging, setDragging] = useState(false)

  function pick(files) {
    if (!files || !files[0]) return
    const f = files[0]
    if (!f.type.startsWith('image/')) return
    onFile(f)
  }

  return (
    <div
      id="upload-dropzone"
      className={`upload-zone ${dragging ? 'dragging' : ''}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files) }}
    >
      <span className="upload-icon">🔬</span>
      <h2>Drop a Fundus Image</h2>
      <p style={{ marginBottom: '1.25rem' }}>
        JPEG / PNG · Max 20 MB · Any retinal camera output
      </p>
      <button
        id="upload-browse-btn"
        className="btn btn-primary btn-lg"
        disabled={disabled}
        onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
      >
        Browse Files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => pick(e.target.files)}
      />
    </div>
  )
}
