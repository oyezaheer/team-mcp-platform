import { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import { Send, Bot, User, Wrench, Sparkles, AlertCircle } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: Array<{
    tool: string
    arguments: any
    result: any
  }>
}

const SAMPLE_PROMPTS = [
  'List recent orders from our store',
  'Create a new product named "Noise Cancelling Headphones" with price 129.99',
  'Show store products and current inventory levels',
  'Check support tickets and customer questions',
]

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am your Team MCP AI Assistant. I can interact directly with your WooCommerce store, warehouse inventory, and customer support upstreams via the Team Gateway. How can I help you today?',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const handleSend = async (textToSend?: string) => {
    const userPrompt = textToSend || input
    if (!userPrompt.trim() || isLoading) return

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userPrompt }]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      // Send conversation to gateway chat endpoint
      const payload = newMessages.map((m) => ({ role: m.role, content: m.content }))
      const res = await api.chat.send(payload)

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply || 'Task completed.',
          toolCalls: res.toolCallsLog,
        },
      ])
    } catch (err: any) {
      console.error('Chat error:', err)
      setError(err.message || 'Failed to communicate with chat agent.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles size={20} className="text-indigo-400" />
            Team MCP Chat Agent
          </h2>
          <p className="text-xs text-slate-400">
            Calls upstream tools dynamically via Gateway Streamable HTTP as the authenticated user.
          </p>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role !== 'user' && (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0 text-indigo-300">
                <Bot size={18} />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl p-4 text-sm space-y-3 ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>

              {/* Tool Execution Logs */}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                  <div className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                    <Wrench size={13} />
                    Tool Executions ({m.toolCalls.length}):
                  </div>
                  {m.toolCalls.map((tc, tcIdx) => (
                    <div
                      key={tcIdx}
                      className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-800 text-xs font-mono space-y-1.5"
                    >
                      <div className="text-amber-400 font-semibold">{tc.tool}</div>
                      {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                        <div className="text-[11px] text-slate-400">
                          Args: {JSON.stringify(tc.arguments)}
                        </div>
                      )}
                      {tc.result && (
                        <div className="text-[11px] text-emerald-400 truncate">
                          Result: {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 text-slate-300">
                <User size={18} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 items-center text-slate-400 text-sm italic">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 animate-pulse">
              <Bot size={18} />
            </div>
            Thinking and querying upstream tools...
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800/60 text-red-300 text-sm rounded-lg flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length <= 2 && (
        <div className="grid grid-cols-2 gap-2">
          {SAMPLE_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="text-left text-xs p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 transition"
            >
              &ldquo;{prompt}&rdquo;
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent to create a product, inspect orders, check stock..."
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-40 transition"
        >
          <Send size={16} />
          Send
        </button>
      </form>
    </div>
  )
}
