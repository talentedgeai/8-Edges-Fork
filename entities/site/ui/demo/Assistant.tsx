'use client'

import { useEffect, useRef } from 'react'
import type { Prompt } from './prompts'
import type { Message } from './types'

type Props = {
  open: boolean
  messages: Message[]
  typing: boolean
  input: string
  prompts: Prompt[]
  onToggle: () => void
  onInput: (v: string) => void
  onAsk: (q: string, answer?: string, action?: Prompt['action']) => void
}

export default function Assistant({ open, messages, typing, input, prompts, onToggle, onInput, onAsk }: Props) {
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing, open])

  return (
    <>
      <button type="button" className={`e8d-chat-fab${open ? ' e8d-chat-fab--on' : ''}`} onClick={onToggle} aria-expanded={open} aria-controls="e8d-chat">
        ✦ Ask the assistant
      </button>
      {open && (
        <section id="e8d-chat" className="e8d-chat" aria-label="Data assistant">
          <div className="e8d-chat-head">
            <span className="e8d-avatar e8d-avatar--agent" aria-hidden>✦</span>
            <div>
              <div className="e8d-strong">Data assistant</div>
              <div className="e8d-small">Reads and writes the company database</div>
            </div>
            <button type="button" className="e8d-icon-btn" aria-label="Close assistant" onClick={onToggle}>✕</button>
          </div>
          <div className="e8d-chat-log" ref={log}>
            {messages.map((m, i) => (
              <div key={i} className={`e8d-msg e8d-msg--${m.role === 'u' ? 'user' : 'agent'}`}>
                <div className="e8d-msg-text">{m.text}</div>
                {m.action && m.run && (
                  <button type="button" className="e8d-tour-action" onClick={m.run}>▸ {m.action}</button>
                )}
              </div>
            ))}
            {typing && <div className="e8d-msg e8d-msg--agent e8d-msg--typing" aria-label="Assistant is typing"><span /><span /><span /></div>}
          </div>
          <div className="e8d-chat-prompts">
            {prompts.map((p) => (
              <button key={p.q} type="button" className="e8d-prompt" onClick={() => onAsk(p.q, p.a(), p.action)}>{p.q}</button>
            ))}
          </div>
          <form className="e8d-chat-input" onSubmit={(e) => { e.preventDefault(); onAsk(input) }}>
            <input
              className="e8d-input"
              value={input}
              onChange={(e) => onInput(e.target.value)}
              placeholder="Ask about jobs, quotes, crews, leave, invoices…"
              aria-label="Ask the assistant"
            />
            <button type="submit" className="e8d-btn e8d-btn--primary" disabled={!input.trim()}>Send</button>
          </form>
        </section>
      )}
    </>
  )
}
