import { NavLink } from 'react-router-dom'
import { Server, Users, ScrollText, MessageSquare, LogOut } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
  onLogout: () => void
  role: string
}

export default function Layout({ children, onLogout, role }: LayoutProps) {
  const navItem = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:text-white hover:bg-slate-700'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  )

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside className="w-64 flex flex-col p-4 gap-2" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        <div className="px-4 py-4 mb-2">
          <h1 className="text-lg font-bold text-white">Team MCP</h1>
          <p className="text-xs text-slate-400 mt-0.5">Gateway Dashboard</p>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItem('/servers', <Server size={16} />, 'MCP Servers')}
          {navItem('/chat', <MessageSquare size={16} />, 'Chat Agent')}
          {role === 'ADMIN' && navItem('/users', <Users size={16} />, 'Team')}
          {role === 'ADMIN' && navItem('/audit', <ScrollText size={16} />, 'Audit Log')}
        </nav>

        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
