import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Plus, Key, ShieldAlert, Check, Copy } from 'lucide-react'

interface UserItem {
  id: string
  email: string
  name?: string
  role: string
  createdAt: string
  apiKeys: Array<{
    id: string
    name: string
    keyPrefix: string
    lastUsedAt?: string
    createdAt: string
  }>
}

export default function UsersPage() {
  const qc = useQueryClient()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [newKeyDisplay, setNewKeyDisplay] = useState<{ user: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery<{ users: UserItem[] }>({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  })

  const createMut = useMutation({
    mutationFn: (userData: { email: string; name?: string }) => api.users.create(userData),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowInviteModal(false)
      setEmail('')
      setName('')
      if (res.apiKey) {
        setNewKeyDisplay({ user: res.user?.email || 'User', key: res.apiKey })
      }
    },
  })

  const rotateMut = useMutation({
    mutationFn: (userId: string) => api.users.rotateKey(userId),
    onSuccess: (res: any, userId: string) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      const u = data?.users.find((u) => u.id === userId)
      if (res.apiKey) {
        setNewKeyDisplay({ user: u?.email || 'User', key: res.apiKey })
      }
    },
  })

  const revokeMut = useMutation({
    mutationFn: (userId: string) => api.users.revokeKeys(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleCopy = (keyText: string) => {
    navigator.clipboard.writeText(keyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Team & API Key Management</h2>
          <p className="text-sm text-slate-400">Manage team members, roles, and rotate or revoke API credentials.</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
        >
          <Plus size={16} />
          Invite Member
        </button>
      </div>

      {newKeyDisplay && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-xl space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-emerald-400">New API Key Generated for {newKeyDisplay.user}</p>
              <p className="text-xs text-slate-300">Copy this key now. You will not be able to see it again!</p>
            </div>
            <button
              onClick={() => setNewKeyDisplay(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-700">
            <code className="text-xs font-mono text-emerald-300 flex-1 break-all">{newKeyDisplay.key}</code>
            <button
              onClick={() => handleCopy(newKeyDisplay.key)}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading users...</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Active Keys</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {data?.users?.map((user) => (
                <tr key={user.id} className="hover:bg-slate-700/20 transition">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{user.name || 'Unnamed'}</div>
                    <div className="text-xs text-slate-400">{user.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        user.role === 'ADMIN'
                          ? 'bg-purple-900/40 text-purple-300 border border-purple-600/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.apiKeys?.length > 0 ? (
                      <div className="space-y-1">
                        {user.apiKeys.map((k) => (
                          <div key={k.id} className="text-xs text-slate-400">
                            <span className="font-mono text-indigo-400">{k.keyPrefix}...</span>
                            {k.lastUsedAt && (
                              <span className="ml-2 text-slate-500">
                                (Used {new Date(k.lastUsedAt).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-red-400 italic">No active keys</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => rotateMut.mutate(user.id)}
                      disabled={rotateMut.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 rounded font-medium transition"
                      title="Rotate and issue new API key"
                    >
                      <Key size={13} />
                      Rotate Key
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Revoke all active keys for ${user.email}?`)) {
                          revokeMut.mutate(user.id)
                        }
                      }}
                      disabled={revokeMut.isPending || user.apiKeys?.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-xs text-red-300 border border-red-800/40 rounded font-medium transition disabled:opacity-40"
                      title="Revoke active keys"
                    >
                      <ShieldAlert size={13} />
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white">Invite Team Member</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@company.com"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => createMut.mutate({ email, name: name || undefined })}
                disabled={!email || createMut.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {createMut.isPending ? 'Inviting...' : 'Create & Generate Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
