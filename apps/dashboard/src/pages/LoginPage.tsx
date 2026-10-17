import { useState } from 'react'
import { api, setApiKey } from '../api'

interface LoginPageProps {
  onLogin: (key: string, role: string) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return

    setLoading(true)
    setError('')

    try {
      setApiKey(key.trim())
      const data = await api.me()
      onLogin(key.trim(), data.user?.role ?? '')
    } catch (err: any) {
      setError(err.message ?? 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md p-8 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h1 className="text-2xl font-bold text-white mb-2">Team MCP Gateway</h1>
        <p className="text-slate-400 text-sm mb-8">Enter your API key to access the dashboard</p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">API Key</label>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="tmcp_..."
              className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 px-4 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: loading ? 'var(--accent-hover)' : 'var(--accent)' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
