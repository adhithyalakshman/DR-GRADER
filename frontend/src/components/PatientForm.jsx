import { useState } from 'react'

const TREATMENT_OPTIONS = ['None', 'Laser', 'Injection', 'Eye surgery', 'Other']

function generatePatientId() {
  const now = new Date()
  const date = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(16).substring(2, 6).toUpperCase()
  return `PT-${date}-${rand}`
}

const INITIAL = {
  patientId: generatePatientId(),
  patientName: '',
  age: '',
  gender: '',
  diabetesDuration: '',
  hba1c: '',
  previousTreatment: '',
  visionSymptoms: '',
}

export default function PatientForm({ onSubmit }) {
  const [form, setForm] = useState(INITIAL)
  const [errors, setErrors] = useState({})

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const validate = () => {
    const e = {}
    if (!form.patientName.trim())     e.patientName = 'Patient Name is required'
    if (!form.age || Number(form.age) < 1 || Number(form.age) > 120)
      e.age = 'Valid age (1–120) is required'
    if (!form.gender)                 e.gender = 'Gender is required'
    if (!form.diabetesDuration && form.diabetesDuration !== '0')
      e.diabetesDuration = 'Duration of diabetes is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev) => {
    ev.preventDefault()
    if (validate()) {
      onSubmit({
        ...form,
        age: Number(form.age),
        diabetesDuration: Number(form.diabetesDuration),
        hba1c: form.hba1c ? Number(form.hba1c) : null,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="patient-form card anim-fade">
      <div className="card-header">
        <div className="card-icon cyan">🏥</div>
        <div>
          <h3>Patient Information</h3>
          <p style={{ fontSize: '0.8rem' }}>Enter patient details before uploading the fundus image</p>
        </div>
      </div>

      {/* Row 1: Patient ID + Name */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            Patient ID <span className="form-optional">Auto-generated</span>
          </label>
          <input
            id="patient-id-input"
            className="form-input"
            type="text"
            value={form.patientId}
            readOnly
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'default' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            Patient Name <span className="form-required">*</span>
          </label>
          <input
            id="patient-name-input"
            className={`form-input ${errors.patientName ? 'form-input-error' : ''}`}
            type="text"
            placeholder="Full name"
            value={form.patientName}
            onChange={e => set('patientName', e.target.value)}
          />
          {errors.patientName && <span className="form-error">{errors.patientName}</span>}
        </div>
      </div>

      {/* Row 2: Age + Gender */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            Age <span className="form-required">*</span>
          </label>
          <input
            id="patient-age-input"
            className={`form-input ${errors.age ? 'form-input-error' : ''}`}
            type="number"
            min="1"
            max="120"
            placeholder="Years"
            value={form.age}
            onChange={e => set('age', e.target.value)}
          />
          {errors.age && <span className="form-error">{errors.age}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">
            Gender <span className="form-required">*</span>
          </label>
          <div className="form-radio-group">
            {['Male', 'Female', 'Other'].map(g => (
              <label key={g} className={`form-radio-label ${form.gender === g ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  checked={form.gender === g}
                  onChange={() => set('gender', g)}
                />
                {g}
              </label>
            ))}
          </div>
          {errors.gender && <span className="form-error">{errors.gender}</span>}
        </div>
      </div>

      {/* Row 3: Diabetes Duration + HbA1c */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            Duration of Diabetes <span className="form-required">*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="patient-diabetes-duration"
              className={`form-input ${errors.diabetesDuration ? 'form-input-error' : ''}`}
              type="number"
              min="0"
              max="80"
              placeholder="In years"
              value={form.diabetesDuration}
              onChange={e => set('diabetesDuration', e.target.value)}
            />
            <span className="form-input-suffix">years</span>
          </div>
          {errors.diabetesDuration && <span className="form-error">{errors.diabetesDuration}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">
            HbA1c (%) <span className="form-optional">Optional</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="patient-hba1c"
              className="form-input"
              type="number"
              step="0.1"
              min="3"
              max="20"
              placeholder="e.g. 7.5"
              value={form.hba1c}
              onChange={e => set('hba1c', e.target.value)}
            />
            <span className="form-input-suffix">%</span>
          </div>
        </div>
      </div>

      {/* Row 4: Previous Treatment */}
      <div className="form-group">
        <label className="form-label">
          Previous Eye Treatment <span className="form-optional">Optional</span>
        </label>
        <div className="form-radio-group" style={{ flexWrap: 'wrap' }}>
          {TREATMENT_OPTIONS.map(t => (
            <label key={t} className={`form-radio-label ${form.previousTreatment === t ? 'active' : ''}`}>
              <input
                type="radio"
                name="treatment"
                value={t}
                checked={form.previousTreatment === t}
                onChange={() => set('previousTreatment', t)}
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      {/* Row 5: Symptoms */}
      <div className="form-group">
        <label className="form-label">
          Current Vision / Eye Symptoms <span className="form-optional">Optional</span>
        </label>
        <textarea
          id="patient-symptoms"
          className="form-input form-textarea"
          placeholder="e.g. Blurred vision, floaters, difficulty reading..."
          rows={3}
          value={form.visionSymptoms}
          onChange={e => set('visionSymptoms', e.target.value)}
        />
      </div>

      <div className="divider" />

      <button
        id="patient-form-submit"
        type="submit"
        className="btn btn-primary btn-lg"
        style={{ width: '100%', justifyContent: 'center' }}
      >
        Continue to Fundus Image Upload →
      </button>
    </form>
  )
}
