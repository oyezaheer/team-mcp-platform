import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { ScrollText, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react'

interface AuditItem {
  id: string
  toolName: string
  inputArgs?: any
  result?: any
  details?: any
  status: string
  durationMs: number
  createdAt: string
  user?: {
    id: string
    email: string
    name?: string
  }
  upstream?: {
    id: string
    name: string
  }
}

export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const limit = 25
  const [selectedLog, setSelectedLog] = useState<AuditItem | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery<{
    logs: AuditItem[]
    total: number
    page: number
    limit: number
  }>({
    queryKey: ['audit', page, statusFilter],
    queryFn: () => api.audit.list(page, limit, statusFilter),
    refetchInterval: 15_000,
  })

  const totalPages = Math.ceil((data?.total || 0) / limit) || 1

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ScrollText size={20} className="text-indigo-400" />
            Security & Audit Logs
          </h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Filter status:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="ALL">All events</option>
              <option value="DENIED">Denied</option>
              <option value="ERROR">Errors</option>
              <option value="SUCCESS">Successful</option>
            </select>
          </div>
          <p className="text-sm text-slate-400">
            Immutable log of all upstream MCP tool invocations with caller attribution and latency.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading audit logs...</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Target Upstream</th>
                <th className="px-6 py-4">Tool Invocated</th>
                <th className="px-6 py-4">Status / Latency</th>
                <th className="px-6 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {data?.logs && data.logs.length > 0 ? (
                data.logs
                  // .filter((log) => statusFilter === 'ALL' || log.status === statusFilter)
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-slate-700/20 transition">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {new Date(log.createdAt).toLocaleTimeString()}
                        <div className="text-[11px] text-slate-500">{new Date(log.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{log.user?.name || log.user?.email || 'Anonymous'}</div>
                        <div className="text-xs text-slate-400">{log.user?.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-200">
                          {log.upstream?.name || 'Gateway Direct'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-xs font-mono text-indigo-300 bg-indigo-950/40 px-2 py-1 rounded border border-indigo-800/30">
                          {log.toolName}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          {log.status === 'SUCCESS' ? (
                            <CheckCircle2 size={15} className="text-emerald-400" />
                          ) : (
                            <AlertCircle size={15} className="text-rose-400" />
                          )}
                          <span
                            className={`text-xs font-mono font-semibold ${log.status === 'SUCCESS'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                              }`}
                          >
                            {log.status}
                          </span>
                          <span className="text-xs font-mono text-slate-300">
                            {log.durationMs || 0} ms
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                    No audit records recorded yet. Tool executions through the gateway or chat agent will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination controls */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-900/60 border-t border-slate-700/60 text-xs text-slate-400">
          <div>
            Showing Page <span className="text-white font-medium">{page}</span> of{' '}
            <span className="text-white font-medium">{totalPages}</span> ({data?.total || 0} total events)
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">Tool Invocation Inspection</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedLog.toolName}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              <div>
                <span className="text-xs text-slate-400 block mb-1">Details:</span>
                <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto border border-slate-800">
                  {JSON.stringify(selectedLog.details ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
