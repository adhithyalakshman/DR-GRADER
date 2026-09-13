import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import UploadPage   from './pages/UploadPage.jsx'
import ReportPage   from './pages/ReportPage.jsx'
import WorklistPage from './pages/WorklistPage.jsx'

function Nav() {
  return (
    <nav className="nav">
      <NavLink to="/" className="nav-brand" style={{ textDecoration: 'none' }}>
        <div className="nav-logo">👁</div>
        <div>
          <div className="nav-title">EyeQ DR Screener</div>
          <div className="nav-subtitle">AI Fundus Analysis</div>
        </div>
      </NavLink>

      <ul className="nav-links">
        <NavLink to="/"         className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Upload</NavLink>
        <NavLink to="/worklist" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Worklist</NavLink>
      </ul>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Nav />
        <Routes>
          <Route path="/"                  element={<UploadPage />} />
          <Route path="/report/:reportId"  element={<ReportPage />} />
          <Route path="/worklist"          element={<WorklistPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
