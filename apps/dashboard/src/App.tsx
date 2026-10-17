import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ServersPage from './pages/ServersPage'
import UsersPage from './pages/UsersPage'
import AuditPage from './pages/AuditPage'
import ChatPage from './pages/ChatPage'
import { setApiKey, clearApiKey } from './api'

function App() {
  const [apiKey, setKey] = useState<string>(() => localStorage.getItem('apiKey') ?? '')
  const [role, setRole] = useState<string>('')

  useEffect(() => {
    if (apiKey) setApiKey(apiKey)
  }, [apiKey])

  const handleLogin = (key: string, userRole: string) => {
    setApiKey(key)
    setKey(key)
    setRole(userRole)
  }

  const handleLogout = () => {
    clearApiKey()
    setKey('')
    setRole('')
  }

  if (!apiKey) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout} role={role}>
        <Routes>
          <Route path="/" element={<Navigate to="/servers" replace />} />
          <Route path="/servers" element={<ServersPage role={role} />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
