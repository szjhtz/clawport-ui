"use client"

import {
  ReactFlow,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  ConnectionLineType,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw, Activity, ChevronDown, MessageSquare, Trash2 } from "lucide-react"
import type { Agent, CronJob } from "@/lib/types"
import type { Pipeline } from "@/lib/cron-pipelines"
import { getAllPipelineJobNames } from "@/lib/cron-pipelines"
import { formatDuration } from "@/lib/cron-utils"
import { buildPipelineLayout, buildHealthCheckPrompt, extractJobNameFromNodeId } from "@/lib/pipeline-utils"
import { generateId } from "@/lib/id"

interface HealthChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

interface PipelineGraphProps {
  crons: CronJob[]
  agents: Agent[]
  pipelines: Pipeline[]
  onSetupClick?: () => void
  onEditClick?: () => void
  onClearClick?: () => void
  onJobSelect?: (jobName: string) => void
  selectedJob?: string | null
}

/* ─── Custom node ─────────────────────────────────────────────── */

function CronPipelineNode({ data }: NodeProps) {
  const d = data as { name: string; schedule: string; status: string; deliveryTo: string | null; color: string; selected?: boolean } & Record<string, unknown>
  const statusColor = d.status === "ok" ? "#22c55e" : d.status === "error" ? "#ef4444" : "#a1a1aa"
  const hasDelivery = d.deliveryTo !== null
  const isSelected = d.selected === true

  return (
    <div
      style={{
        background: "var(--material-regular)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderRadius: "var(--radius-md, 10px)",
        borderTop: isSelected ? "2px solid var(--accent, #6366f1)" : "1px solid var(--separator)",
        borderRight: isSelected ? "2px solid var(--accent, #6366f1)" : "1px solid var(--separator)",
        borderBottom: isSelected ? "2px solid var(--accent, #6366f1)" : "1px solid var(--separator)",
        borderLeft: `3px solid ${d.color}`,
        padding: "10px 14px",
        minWidth: 180,
        maxWidth: 220,
        boxShadow: isSelected
          ? "0 0 0 3px color-mix(in srgb, var(--accent, #6366f1) 25%, transparent), var(--shadow-card, 0 2px 8px rgba(0,0,0,0.15))"
          : "var(--shadow-card, 0 2px 8px rgba(0,0,0,0.15))",
        cursor: "pointer",
        transition: "box-shadow 150ms ease, border-color 150ms ease",
      }}
    >
      {/* Name + status dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {d.name}
        </div>
      </div>

      {/* Schedule */}
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>{d.schedule}</div>

      {/* Delivery badge */}
      {hasDelivery && (
        <div
          style={{
            display: "inline-block",
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 4,
            background: "var(--accent, #6366f1)",
            color: "#fff",
            opacity: 0.8,
            marginTop: 2,
          }}
        >
          delivered
        </div>
      )}

      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const pipelineNodeTypes = { cronPipelineNode: CronPipelineNode }

/* ─── Empty state ────────────────────────────────────────────── */

function PipelinesEmptyState({ onSetupClick }: { onSetupClick?: () => void }) {
  return (
    <div
      style={{
        background: "var(--material-regular)",
        border: "1px solid var(--separator)",
        borderRadius: "var(--radius-md, 10px)",
        padding: "32px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
        No pipelines configured
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
        Pipelines visualize file I/O dependencies between cron jobs.
      </div>

      {onSetupClick && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={onSetupClick}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: "var(--accent, #6366f1)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v1l2 9h12l2-9v-1a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
              <line x1="12" y1="12" x2="12" y2="16" />
              <line x1="10" y1="14" x2="14" y2="14" />
            </svg>
            Auto-Detect Pipelines with AI
          </button>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8, maxWidth: 360, margin: "8px auto 0", lineHeight: 1.5 }}>
            Sends your cron job list to an AI agent to analyze file dependencies and generate a pipeline config.
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 16, maxWidth: 480, margin: "16px auto 0" }}>
        Or manually create:
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 12,
          color: "var(--accent, #6366f1)",
          background: "var(--code-bg, rgba(0,0,0,0.1))",
          border: "1px solid var(--code-border, var(--separator))",
          borderRadius: 6,
          padding: "8px 16px",
          margin: "8px auto",
          display: "inline-block",
        }}
      >
        $WORKSPACE_PATH/clawport/pipelines.json
      </div>
      <pre
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          color: "var(--text-secondary)",
          background: "var(--code-bg, rgba(0,0,0,0.1))",
          border: "1px solid var(--code-border, var(--separator))",
          borderRadius: 6,
          padding: "12px 16px",
          margin: "8px auto 0",
          maxWidth: 420,
          textAlign: "left",
          whiteSpace: "pre",
          overflow: "auto",
        }}
      >{`[
  {
    "name": "Daily Report",
    "edges": [
      { "from": "data-collector", "to": "report-builder", "artifact": "raw-data.json" }
    ]
  }
]`}</pre>
    </div>
  )
}

/* ─── Crons card grid ────────────────────────────────────────── */

function CronsCardGrid({
  crons,
  agentColorMap,
  label,
}: {
  crons: CronJob[]
  agentColorMap: Map<string, string>
  label: string
}) {
  if (crons.length === 0) return null

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-secondary)",
          marginBottom: 12,
        }}
      >
        {label} ({crons.length})
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {crons.map(cron => {
          const statusColor = cron.status === "ok" ? "#22c55e" : cron.status === "error" ? "#ef4444" : "#a1a1aa"
          const color = agentColorMap.get(cron.agentId || "") || "var(--text-secondary)"

          return (
            <div
              key={cron.id}
              style={{
                background: "var(--material-regular)",
                borderRadius: "var(--radius-md, 10px)",
                border: "1px solid var(--separator)",
                borderLeft: `3px solid ${color}`,
                padding: "10px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cron.name}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {cron.scheduleDescription || "\u2014"}
              </div>
              {cron.lastDurationMs != null && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {formatDuration(cron.lastDurationMs)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Main component ──────────────────────────────────────────── */

export function PipelineGraph({ crons, agents, pipelines, onSetupClick, onEditClick, onClearClick, onJobSelect, selectedJob }: PipelineGraphProps) {
  const [healthCheckOpen, setHealthCheckOpen] = useState(false)
  const [healthCheckStreaming, setHealthCheckStreaming] = useState(false)
  const [healthCheckContent, setHealthCheckContent] = useState("")
  const healthRef = useRef<HTMLDivElement>(null)
  const healthChatEndRef = useRef<HTMLDivElement>(null)
  const healthChatTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [healthChatMessages, setHealthChatMessages] = useState<HealthChatMessage[]>([])
  const [healthChatInput, setHealthChatInput] = useState("")
  const [healthChatStreaming, setHealthChatStreaming] = useState(false)

  const agentColorMap = useMemo(
    () => new Map(agents.map(a => [a.id, a.color])),
    [agents],
  )

  // Find root orchestrator (agent with reportsTo === null)
  const rootAgent = useMemo(
    () => agents.find(a => a.reportsTo === null) || agents[0] || null,
    [agents],
  )

  const hasPipelines = pipelines.length > 0
  const pipelineJobNames = useMemo(() => getAllPipelineJobNames(pipelines), [pipelines])
  const standaloneCrons = useMemo(
    () => crons.filter(c => !pipelineJobNames.has(c.name)),
    [crons, pipelineJobNames],
  )

  const layout = useMemo(
    () => hasPipelines ? buildPipelineLayout(crons, pipelines, agentColorMap, selectedJob) : { nodes: [], edges: [] },
    [crons, pipelines, agentColorMap, hasPipelines, selectedJob],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges)

  useEffect(() => {
    if (hasPipelines) {
      const { nodes: n, edges: e } = buildPipelineLayout(crons, pipelines, agentColorMap, selectedJob)
      setNodes(n)
      setEdges(e)
    } else {
      setNodes([])
      setEdges([])
    }
  }, [crons, pipelines, agentColorMap, hasPipelines, selectedJob, setNodes, setEdges])

  // Auto-scroll health check panel
  useEffect(() => {
    if (healthRef.current) {
      healthRef.current.scrollTop = healthRef.current.scrollHeight
    }
  }, [healthCheckContent])

  // Auto-scroll health chat
  useEffect(() => {
    if (healthChatEndRef.current) {
      healthChatEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [healthChatMessages])

  // Handle node click -> extract job name
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!onJobSelect) return
    const jobName = extractJobNameFromNodeId(node.id)
    if (jobName) onJobSelect(jobName)
  }, [onJobSelect])

  // Pipeline Health Check
  const runHealthCheck = useCallback(async () => {
    if (!rootAgent || healthCheckStreaming) return

    setHealthCheckOpen(true)
    setHealthCheckStreaming(true)
    setHealthCheckContent("")
    setHealthChatMessages([])

    const prompt = buildHealthCheckPrompt(crons, pipelines, agents)

    try {
      const res = await fetch(`/api/chat/${rootAgent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      })

      if (!res.ok || !res.body) throw new Error("Stream failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const chunk = JSON.parse(line.slice(6))
              if (chunk.content) {
                fullContent += chunk.content
                setHealthCheckContent(fullContent)
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    } catch {
      setHealthCheckContent(prev => prev + "\n\n[Error: Failed to connect to agent]")
    } finally {
      setHealthCheckStreaming(false)
    }
  }, [rootAgent, healthCheckStreaming, crons, pipelines, agents])

  // Send a follow-up message in the health check chat
  const sendHealthChatMessage = useCallback(async () => {
    const text = healthChatInput.trim()
    if (!text || healthChatStreaming || !rootAgent) return

    const userMsg: HealthChatMessage = { id: generateId(), role: "user", content: text }
    const assistantMsgId = generateId()
    const assistantMsg: HealthChatMessage = { id: assistantMsgId, role: "assistant", content: "", isStreaming: true }

    setHealthChatMessages(prev => [...prev, userMsg, assistantMsg])
    setHealthChatInput("")
    setHealthChatStreaming(true)

    // Build API messages: health check context + conversation history + new message
    const prompt = buildHealthCheckPrompt(crons, pipelines, agents)
    const allMessages = [...healthChatMessages, userMsg]
    const apiMessages = [
      { role: "user" as const, content: prompt },
      { role: "assistant" as const, content: healthCheckContent },
      ...allMessages.map(m => ({ role: m.role, content: m.content })),
    ]

    try {
      const res = await fetch(`/api/chat/${rootAgent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok || !res.body) throw new Error("Stream failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const chunk = JSON.parse(line.slice(6))
              if (chunk.content) {
                fullContent += chunk.content
                const captured = fullContent
                setHealthChatMessages(prev =>
                  prev.map(m => m.id === assistantMsgId
                    ? { ...m, content: captured, isStreaming: true }
                    : m
                  )
                )
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }

      const finalContent = fullContent
      setHealthChatMessages(prev =>
        prev.map(m => m.id === assistantMsgId
          ? { ...m, content: finalContent, isStreaming: false }
          : m
        )
      )
    } catch {
      setHealthChatMessages(prev =>
        prev.map(m => m.id === assistantMsgId
          ? { ...m, content: "Error getting response. Check API connection.", isStreaming: false }
          : m
        )
      )
    } finally {
      setHealthChatStreaming(false)
      healthChatTextareaRef.current?.focus()
    }
  }, [healthChatInput, healthChatStreaming, rootAgent, healthChatMessages, healthCheckContent, crons, pipelines, agents])

  if (!hasPipelines) {
    return (
      <div>
        <PipelinesEmptyState onSetupClick={onSetupClick} />
        <CronsCardGrid crons={crons} agentColorMap={agentColorMap} label="All Crons" />
      </div>
    )
  }

  return (
    <div>
      {/* ─── Toolbar: Regenerate + Health Check ────────────── */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginBottom: 8 }}>
        {rootAgent && (
          <button
            onClick={runHealthCheck}
            disabled={healthCheckStreaming}
            className="btn-ghost focus-ring"
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--separator)",
              cursor: healthCheckStreaming ? "default" : "pointer",
              color: healthCheckStreaming ? "var(--text-tertiary)" : "var(--text-secondary)",
              background: "transparent",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Activity size={13} className={healthCheckStreaming ? "animate-pulse" : ""} />
            Pipeline Health Check
          </button>
        )}
        {onEditClick && (
          <button
            onClick={onEditClick}
            className="btn-ghost focus-ring"
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--separator)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              background: "transparent",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RefreshCw size={13} />
            Regenerate Pipelines
          </button>
        )}
        {onClearClick && (
          <button
            onClick={onClearClick}
            className="btn-ghost focus-ring"
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--separator)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              background: "transparent",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trash2 size={13} />
            Clear Pipelines
          </button>
        )}
      </div>

      {/* ─── Health Check Panel ────────────────────────────── */}
      {healthCheckOpen && (
        <div
          style={{
            background: "var(--material-regular)",
            border: "1px solid var(--separator)",
            borderRadius: "var(--radius-md, 10px)",
            marginBottom: "var(--space-3)",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setHealthCheckOpen(!healthCheckContent && !healthCheckStreaming ? false : !healthCheckOpen)}
            className="flex items-center w-full"
            style={{
              padding: "var(--space-3) var(--space-4)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              gap: "var(--space-2)",
            }}
          >
            <Activity size={14} style={{ color: healthCheckStreaming ? "var(--accent)" : healthCheckContent ? "var(--system-green)" : "var(--accent)" }} />
            <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--text-primary)", flex: 1, textAlign: "left" }}>
              Pipeline Health Check
            </span>
            {healthCheckStreaming && (
              <span style={{
                fontSize: "var(--text-caption2)",
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  animation: "blink 1s infinite",
                }} />
                Analyzing pipelines...
              </span>
            )}
            {!healthCheckStreaming && healthCheckContent && (
              <span style={{ fontSize: "var(--text-caption2)", color: "var(--system-green)" }}>
                Complete
              </span>
            )}
            <ChevronDown size={14} style={{ color: "var(--text-tertiary)", transition: "transform 200ms ease" }} />
          </button>

          {/* Streaming skeleton — before first content arrives */}
          {healthCheckStreaming && !healthCheckContent && (
            <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm, 6px)",
                background: "var(--material-thin, rgba(255,255,255,0.04))",
                border: "1px solid var(--separator)",
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "2px solid var(--separator)",
                  borderTopColor: "var(--accent)",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "var(--text-footnote)",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 4,
                  }}>
                    Analyzing system health...
                  </div>
                  <div style={{ fontSize: "var(--text-caption2)", color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                    Checking agent ownership, pipeline edges, schedules, and deliveries
                  </div>
                </div>
              </div>
              {/* Shimmer skeleton lines */}
              <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: 8 }}>
                {[0.92, 0.78, 0.85, 0.6].map((w, i) => (
                  <div key={i} style={{
                    height: 10,
                    borderRadius: 4,
                    background: "var(--fill-tertiary, rgba(255,255,255,0.06))",
                    width: `${w * 100}%`,
                    animation: `shimmer 1.5s ease-in-out ${i * 0.15}s infinite`,
                    opacity: 0.5,
                  }} />
                ))}
              </div>
              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes shimmer {
                  0%, 100% { opacity: 0.3; }
                  50% { opacity: 0.7; }
                }
              `}</style>
            </div>
          )}

          {/* Streamed content */}
          {healthCheckContent && (
            <div
              ref={healthRef}
              style={{
                padding: "0 var(--space-4) var(--space-4)",
                fontSize: "var(--text-footnote)",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                maxHeight: 300,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {healthCheckContent}
              {healthCheckStreaming && (
                <span style={{
                  display: "inline-block",
                  width: 4,
                  height: 14,
                  background: "var(--text-primary)",
                  marginLeft: 2,
                  opacity: 0.6,
                  animation: "blink 1s infinite",
                  verticalAlign: "text-bottom",
                }} />
              )}
            </div>
          )}

          {/* ─── Inline Chat ──────────────────────────────────── */}
          {healthCheckContent && !healthCheckStreaming && (
            <>
              <div style={{ height: 1, background: "var(--separator)", margin: "0 var(--space-4)" }} />

              {/* Chat messages */}
              {healthChatMessages.length > 0 && (
                <div style={{
                  maxHeight: 240,
                  overflowY: "auto",
                  padding: "var(--space-3) var(--space-4) 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}>
                  {healthChatMessages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        padding: "8px 12px",
                        borderRadius: msg.role === "user"
                          ? "var(--radius-md, 10px) var(--radius-md, 10px) 4px var(--radius-md, 10px)"
                          : "var(--radius-md, 10px) var(--radius-md, 10px) var(--radius-md, 10px) 4px",
                        background: msg.role === "user" ? "var(--accent, #6366f1)" : "var(--material-thick, rgba(255,255,255,0.08))",
                        color: msg.role === "user" ? "#fff" : "var(--text-secondary)",
                        fontSize: "var(--text-footnote)",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.content}
                      {msg.isStreaming && !msg.content && (
                        <span style={{ opacity: 0.5 }}>Thinking...</span>
                      )}
                      {msg.isStreaming && msg.content && (
                        <span style={{
                          display: "inline-block",
                          width: 4,
                          height: 14,
                          background: msg.role === "user" ? "#fff" : "var(--text-primary)",
                          marginLeft: 2,
                          opacity: 0.6,
                          animation: "blink 1s infinite",
                          verticalAlign: "text-bottom",
                        }} />
                      )}
                    </div>
                  ))}
                  <div ref={healthChatEndRef} />
                </div>
              )}

              {/* Chat input */}
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "var(--space-2)",
                padding: "var(--space-3) var(--space-4) var(--space-4)",
              }}>
                <textarea
                  ref={healthChatTextareaRef}
                  value={healthChatInput}
                  onChange={e => setHealthChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendHealthChatMessage()
                    }
                  }}
                  placeholder="Ask about the health check..."
                  disabled={healthChatStreaming}
                  rows={1}
                  style={{
                    flex: 1,
                    resize: "none",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm, 6px)",
                    border: "1px solid var(--separator)",
                    background: "var(--material-thin, rgba(255,255,255,0.04))",
                    color: "var(--text-primary)",
                    fontSize: "var(--text-footnote)",
                    lineHeight: 1.5,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={sendHealthChatMessage}
                  disabled={healthChatStreaming || !healthChatInput.trim()}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm, 6px)",
                    border: "none",
                    background: healthChatStreaming || !healthChatInput.trim()
                      ? "var(--material-thick, rgba(255,255,255,0.08))"
                      : "var(--accent, #6366f1)",
                    color: healthChatStreaming || !healthChatInput.trim()
                      ? "var(--text-tertiary)"
                      : "#fff",
                    cursor: healthChatStreaming || !healthChatInput.trim() ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <MessageSquare size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Graph ─────────────────────────────────────────── */}
      <div style={{ height: 500, border: "1px solid var(--separator)", borderRadius: "var(--radius-md, 10px)", overflow: "hidden" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={pipelineNodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Controls position="bottom-left" style={{ left: 8, bottom: 8 }} />
        </ReactFlow>
      </div>

      {/* ─── Callout ───────────────────────────────────────── */}
      <div style={{
        fontSize: "var(--text-caption2)",
        color: "var(--text-tertiary)",
        marginTop: "var(--space-2)",
        textAlign: "right",
      }}>
        Pipeline config does not auto-update. Regenerate to re-analyze with AI.
      </div>

      <CronsCardGrid crons={standaloneCrons} agentColorMap={agentColorMap} label="Standalone Crons" />
    </div>
  )
}
