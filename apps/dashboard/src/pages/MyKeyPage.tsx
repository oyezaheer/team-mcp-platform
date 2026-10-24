import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { KeyRound, Copy, Check } from 'lucide-react'

export default function MyKeyPage() {
  const [copied, setCopied] = useState(false)
  const gatewayUrl = `${window.location.origin.replace('dashboard.', 'gateway.')}/mcp`

  const gen = useMutation({ mutationFn: () => api.users.generateMyKey() })
  const newKey: string | undefined = gen.data?.key ?? gen.data?.apiKey

  const copy = async () => {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <KeyRound size={22} className="text-indigo-400" /> My API Key
      </h2>
      <p className="text-slate-400 text-sm mt-1 mb-6">
        Use this key with the gateway URL in Claude Code, Cursor or MCP Inspector.
      </p>

      <div className="p-5 rounded-xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-xs text-slate-400 mb-1">Gateway MCP URL (Streamable HTTP)</p>
        <code className="text-sm text-indigo-300 break-all">{gatewayUrl}</code>
      </div>

      <button
        onClick={() => gen.mutate()}
        disabled={gen.isPending}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--accent)' }}
      >
        {gen.isPending ? 'Generating…' : 'Generate new key'}
      </button>

      {gen.isError && <p className="text-red-400 text-sm mt-3">{(gen.error as Error).message}</p>}

      {newKey && (
        <div className="mt-5 p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs text-amber-400 mb-2">Copy it now. It is shown only once and stored hashed.</p>
          <div className="flex items-center gap-3">
            <code className="text-xs text-emerald-300 break-all flex-1">{newKey}</code>
            <button onClick={copy} className="p-2 rounded-lg hover:bg-slate-700 text-slate-300">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}