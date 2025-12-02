"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react"
import { decodeBinaryMessage } from "@/lib/decodeBinary"
import { inflateBase64ToBuffer } from "@/lib/inflateBinary"

export default function OtpForm() {
  const [otp, setOtp] = useState("")
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const waitTimer = useRef<NodeJS.Timeout | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => {
    setLogs((p) => [...p.slice(-300), msg])
  }

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [logs])

  const resetWaitTimer = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current)
    waitTimer.current = setTimeout(() => {
      addLog("⏳ No data received in 10 seconds, continuing to wait...")
      addLog("📥 Waiting for data...")
      resetWaitTimer()
    }, 10000)
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const authRaw = sessionStorage.getItem("authData")
    if (!authRaw || !otp.trim()) {
      setError("Please enter the OTP code")
      return
    }

    setLoading(true)
    const { baseUrl, apiKey, userId, txnId } = JSON.parse(authRaw)

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, userId, txnId, otp }),
      })

      const data = await res.json()

      if (!data.success || !data.accessToken) {
        setError("❌ OTP verification failed")
        addLog("❌ OTP verification failed")
        return
      }

      addLog("✅ OTP Verified Successfully")
      startBrowserSocket(baseUrl, data.accessToken, apiKey)
    } catch (err: any) {
      const errorMsg = err?.message || "OTP verification error"
      setError(errorMsg)
      addLog("❌ " + errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const startBrowserSocket = (baseUrl: string, token: string, apiKey: string) => {
    if (wsRef.current) wsRef.current.close()

    const ws = new WebSocket(`wss://${baseUrl}.arihantplus.com/market-stream?token=${token}&apikey=${apiKey}`)

    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      addLog("✅ Connected to TradeBridge WebSocket")

      const subMsg = {
        request: {
          streaming_type: "quote",
          request_type: "subscribe",
          data: {
            symbols: [{ "symbol": "11536_NSE" }, { "symbol": "466029_MCX" }]
          },
        },
      }

      ws.send(JSON.stringify(subMsg) + "\n")
      addLog("📨 Subscription message sent")
      addLog("📥 Waiting for market data...")
      resetWaitTimer()
    }

    ws.onmessage = (event) => {
      resetWaitTimer()

      try {
        // ✅ Case 1: Raw binary frame
        if (event.data instanceof ArrayBuffer) {
          decodeBinaryMessage(event.data, 1, addLog) // ✅ pktType = 1 (QUOTE)
          addLog("📥 Waiting for data...")
        }

        // ✅ Case 2: Base64 + compressed frame
        else if (typeof event.data === "string") {
          
          // Inflate base64 → ArrayBuffer
          const buffer = inflateBase64ToBuffer(event.data)
          console.log(buffer.toString("utf8"));
          
          // ✅ (Optional) debug – keep only if needed
          /*
          const bytes = new Uint8Array(buffer)
          addLog(
            "🔎 First 16 bytes: " +
            Array.from(bytes.slice(0, 16))
              .map(b => b.toString(16).padStart(2, "0"))
              .join(" ")
          )
          */

          decodeBinaryMessage(buffer, 1, addLog) // ✅ pktType = 1 (QUOTE)
          addLog("📥 Waiting for data...")
        }

        // ✅ Fallback
        else {
          addLog("⚠️ Server response: " + String(event.data))
        }
      } catch (err) {
        addLog("❌ Decode error: " + String(err))
      }
    }





    ws.onerror = () => {
      setConnected(false)
      addLog("❌ WebSocket error occurred")
    }

    ws.onclose = () => {
      setConnected(false)
      addLog("🛑 WebSocket connection closed")
      if (waitTimer.current) clearTimeout(waitTimer.current)
    }
  }

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      if (waitTimer.current) clearTimeout(waitTimer.current)
    }
  }, [])

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Verify OTP</h1>
        <p className="text-muted-foreground">Enter the one-time password to access the market stream</p>
      </div>

      <form onSubmit={verifyOtp} className="space-y-4">
        {error && (
          <div className="flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="otp" className="text-sm font-medium text-foreground">
            One-Time Password
          </label>
          <input
            id="otp"
            type="text"
            placeholder="Enter 4-digit OTP/6-digit TOTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            disabled={loading || connected}
            maxLength={6}
            className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-secondary-darker text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed text-center text-lg tracking-widest"
          />
        </div>

        <button
          type="submit"
          disabled={loading || connected}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : connected ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Connected
            </>
          ) : (
            "Verify OTP"
          )}
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${connected ? "bg-green-500" : "bg-red-600"}`} />
          <span className="text-sm font-medium text-foreground">
            {connected ? "Connected to market stream" : "Not connected"}
          </span>
        </div>

        <div className="rounded-lg bg-background border border-secondary-darker overflow-hidden flex flex-col">
          <div className="bg-secondary-darker px-4 py-3 border-b border-secondary-darker">
            <h3 className="text-sm font-semibold text-foreground">Event Logs</h3>
          </div>
          <pre className="flex-1 overflow-auto p-4 text-xs font-mono bg-background text-muted-foreground max-h-96">
            {logs.length ? logs.join("\n") : "Logs will appear here..."}
            <div ref={logsEndRef} />
          </pre>
        </div>
      </div>
    </div>
  )
}
