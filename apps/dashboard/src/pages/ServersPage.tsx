import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Plus, Trash2, ToggleLeft, ToggleRight, Edit2, Check, X } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  Connected: 'text-green-400',
  Unreachable: 'text-red-400',
  Disabled: 'text-slate-500',
}

interface ServersPageProps {
  role: string
}

export default function ServersPage({ role }: ServersPageProps) {
  const qc = useQueryClient()
  const isAdmin = role === 'ADMIN'

  const { data, isLoading } = useQuery({
    queryKey: ['upstreams'],
    queryFn: () => api.upstreams.list(),
    refetchInterval: 30_000,
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.upstreams.toggle(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upstreams'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.upstreams.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upstreams'] }),
  })

  const createMut = useMutation({
    mutationFn: (data: { name: string; url: string; description?: string; credential?: string }) =>
      api.upstreams.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upstreams'] })
      setAdding(false)
      setForm({ name: '', url: '', description: '', credential: '' })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.upstreams.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upstreams'] })
      setEditingId(null)
    },
  })

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', description: '', credential: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  const fromTools = Object.values(
    (toolData?.tools ?? []).reduce((acc: Record<string, any>, t: any) => {
      acc[t.upstreamId] ??= { id: t.upstreamId, name: t.upstreamName, url: '', enabled: true, status: 'Connected', toolCount: 0 }
      acc[t.upstreamId].toolCount += 1
      return acc
    }, {})
  )
  const upstreams = isAdmin ? (data?.upstreams ?? []) : fromTools

  const { data: toolData } = useQuery({
    queryKey: ['tools'],
    queryFn: () => api.tools.list(),
    refetchInterval: 30_000,
  })
  const toolsByUpstream: Record<string, any[]> = {}
  for (const t of toolData?.tools ?? []) {
    ; (toolsByUpstream[t.upstreamId] ??= []).push(t)
  }

  const startEdit = (u: any) => {
    setEditingId(u.id)
    setEditForm({ name: u.name, url: u.url, description: u.description ?? '', credential: '' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">MCP Servers</h2>
          <p className="text-slate-400 text-sm mt-1">All registered upstream MCP servers</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={16} /> Add Server
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6 p-6 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="text-white font-semibold mb-4">Register MCP Server</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'name', label: 'Name', placeholder: 'WooCommerce Store' },
              { key: 'url', label: 'URL', placeholder: 'http://woocommerce-mcp:3003/mcp' },
              { key: 'description', label: 'Description (optional)', placeholder: 'Store products and orders' },
              { key: 'credential', label: 'Bearer Token (optional)', placeholder: 'secret-token', type: 'password' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                <input
                  type={type ?? 'text'}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => createMut.mutate({ name: form.name, url: form.url, description: form.description || undefined, credential: form.credential || undefined })}
              disabled={!form.name || !form.url || createMut.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {createMut.isPending ? 'Registering…' : 'Register'}
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">
              Cancel
            </button>
          </div>
          {createMut.isError && <p className="text-red-400 text-sm mt-2">{(createMut.error as Error).message}</p>}
        </div>
      )}

      {/* Server list */}
      {isLoading ? (
        <p className="text-slate-400">Loading servers…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {upstreams.map((u: any) => (
            <div key={u.id} className="p-5 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {editingId === u.id ? (
                // Edit mode
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'url', label: 'URL' },
                    { key: 'description', label: 'Description' },
                    { key: 'credential', label: 'New Bearer Token (leave blank to keep)', type: 'password' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-400 mb-1">{label}</label>
                      <input
                        type={type ?? 'text'}
                        value={editForm[key] ?? ''}
                        onChange={e => setEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      />
                    </div>
                  ))}
                  <div className="col-span-2 flex gap-3 mt-2">
                    <button
                      onClick={() => updateMut.mutate({ id: u.id, data: editForm })}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Check size={14} /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white">{u.name}</h3>
                      <span className={`text-xs font-medium ${STATUS_COLORS[u.status] ?? 'text-slate-400'}`}>
                        ● {u.status}
                      </span>
                      {u.toolCount !== undefined && u.status === 'Connected' && (
                        <span className="text-xs text-slate-500">{u.toolCount} tools</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate">{u.url}</p>
                    {u.description && <p className="text-sm text-slate-400 mt-1">{u.description}</p>}
                    {(toolsByUpstream[u.id]?.length ?? 0) > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-indigo-400 cursor-pointer">
                          Show tools ({toolsByUpstream[u.id].length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {toolsByUpstream[u.id].map((t: any) => (
                            <li key={t.name} className="text-xs text-slate-300">
                              <code className="text-indigo-300">{t.name.split('__').slice(1).join('__')}</code>
                              {t.description ? <span className="text-slate-500"> – {t.description}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleMut.mutate({ id: u.id, enabled: !u.enabled })}
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                        title={u.enabled ? 'Disable' : 'Enable'}
                      >
                        {u.enabled
                          ? <ToggleRight size={20} className="text-green-400" />
                          : <ToggleLeft size={20} className="text-slate-500" />}
                      </button>
                      <button
                        onClick={() => startEdit(u)}
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove ${u.name}?`)) deleteMut.mutate(u.id) }}
                        className="p-2 rounded-lg hover:bg-red-900/30 transition-colors text-slate-400 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {upstreams.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              No MCP servers registered yet.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
