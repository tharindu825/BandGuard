import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard   from './pages/Dashboard.jsx'
import DeviceDetail from './pages/DeviceDetail.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"             element={<Dashboard />} />
        <Route path="/device/:name" element={<DeviceDetail />} />
      </Routes>
    </BrowserRouter>
  )
}
