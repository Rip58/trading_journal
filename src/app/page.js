"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { UserButton } from "@clerk/nextjs";
import { normalizeDateToYYYYMMDD, parseLocaleFloat } from "@/lib/dateUtils";

// ACCOUNT_RULES is loaded dynamically from database now


const ALL_MODULES = [
  { id: "kpis", label: "KPIs globales", icon: "📊" },
  { id: "accounts", label: "Panel cuentas DD", icon: "🏦" },
  { id: "equity", label: "Equity curve", icon: "📈" },
  { id: "calendar", label: "Calendario P&L", icon: "📅" },
  { id: "winloss", label: "Win/Loss donut", icon: "🎯" },
  { id: "dowchart", label: "P&L por día semana", icon: "📆" },
  { id: "strategies", label: "P&L por estrategia", icon: "⚙️" },
  { id: "trades", label: "Tabla de trades", icon: "📋" },
];

const DEFAULT_LAYOUT = ALL_MODULES.map(m => m.id);

const C = {
  green: "#1D9E75", red: "#D85A30", blue: "#378ADD",
  amber: "#EF9F27", gray: "#888780",
  greenBg: "#E1F5EE", redBg: "#FAECE7", blueBg: "#E6F1FB",
  greenText: "#0F6E56", redText: "#993C1D", blueText: "#185FA5",
};

const fmt = (v) => (v >= 0 ? "+$" : "-$") + Math.abs(Math.round(v)).toLocaleString();
const fmtN = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  let clean = timeStr.trim();
  
  const isPM = clean.toUpperCase().includes("PM");
  const isAM = clean.toUpperCase().includes("AM");
  clean = clean.replace(/(AM|PM)/gi, "").trim();
  
  const parts = clean.split(":");
  if (parts.length < 2) return null;
  
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parts.length > 2 ? parseInt(parts[2], 10) : 0;
  
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
  
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  
  return hours * 3600 + minutes * 60 + seconds;
}

function getTradeDurationInSeconds(trade) {
  if (!trade.entry_time || !trade.exit_time) return null;
  const entrySec = parseTimeToSeconds(trade.entry_time);
  const exitSec = parseTimeToSeconds(trade.exit_time);
  if (entrySec === null || exitSec === null) return null;
  
  let diff = exitSec - entrySec;
  if (diff < 0) {
    diff += 24 * 3600;
  }
  return diff;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
}

function calcStats(trades) {
  const n = trades.length;
  if (!n) return {};
  const wins = trades.filter(t => t.result === "Win");
  const losses = trades.filter(t => t.result === "Loss");
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wr = wins.length / n * 100;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : 0;
  const rrVals = trades.map(t => t.rr);
  const avgRR = rrVals.reduce((s, v) => s + v, 0) / rrVals.length;
  const commissions = trades.reduce((s, t) => s + t.commission, 0);
  const maxWin = wins.length ? Math.max(...wins.map(t => t.pnl)) : 0;
  const maxLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;
  const days = [...new Set(trades.map(t => t.date))].length;

  const durations = trades.map(getTradeDurationInSeconds).filter(d => d !== null);
  const avgDuration = durations.length ? durations.reduce((s, v) => s + v, 0) / durations.length : null;

  const winDurations = wins.map(getTradeDurationInSeconds).filter(d => d !== null);
  const avgWinDuration = winDurations.length ? winDurations.reduce((s, v) => s + v, 0) / winDurations.length : null;

  const lossDurations = losses.map(getTradeDurationInSeconds).filter(d => d !== null);
  const avgLossDuration = lossDurations.length ? lossDurations.reduce((s, v) => s + v, 0) / lossDurations.length : null;

  return { n, wins: wins.length, losses: losses.length, totalPnl, wr, avgWin, avgLoss, pf, avgRR, commissions, maxWin, maxLoss, days, avgDuration, avgWinDuration, avgLossDuration };
}

function calcAccountDD(trades, rules) {
  const sorted = [...trades].sort((a, b) => {
    const dateDiff = normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date));
    if (dateDiff !== 0) return dateDiff;
    const timeA = parseTimeToSeconds(a.entry_time) || 0;
    const timeB = parseTimeToSeconds(b.entry_time) || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  const n = sorted.length;
  const startSize = rules ? parseFloat(rules.size) || 50000 : 50000;
  const syncTime = rules?.brokerUpdateTime ? new Date(rules.brokerUpdateTime).getTime() : null;

  const balances = new Array(n);
  let originalStartSize = startSize;

  if (syncTime && n > 0) {
    let firstAfterIdx = n;
    for (let i = 0; i < n; i++) {
      const tradeTime = sorted[i].createdAt ? new Date(sorted[i].createdAt).getTime() : null;
      if (tradeTime && tradeTime > syncTime) {
        firstAfterIdx = i;
        break;
      }
    }

    // 1. Backwards for trades before sync
    let currentBal = startSize;
    for (let i = firstAfterIdx - 1; i >= 0; i--) {
      balances[i] = currentBal;
      currentBal -= sorted[i].pnl;
    }
    originalStartSize = currentBal;

    // 2. Forwards for trades after sync
    currentBal = startSize;
    for (let i = firstAfterIdx; i < n; i++) {
      currentBal += sorted[i].pnl;
      balances[i] = currentBal;
    }
  } else {
    let currentBal = startSize;
    for (let i = 0; i < n; i++) {
      currentBal += sorted[i].pnl;
      balances[i] = currentBal;
    }
  }

  let peak = originalStartSize;
  let maxDD = 0;
  for (let i = 0; i < n; i++) {
    const bal = balances[i];
    if (bal > peak) peak = bal;
    const dd = peak - bal;
    if (dd > maxDD) maxDD = dd;
  }

  const finalBalance = n > 0 ? balances[n - 1] : startSize;
  const netPnl = sorted.reduce((sum, t) => sum + t.pnl, 0);
  const relativePeak = peak - originalStartSize;

  return { netPnl, peak: relativePeak, maxDD: -maxDD, ddRemaining: 0, finalBalance };
}

function calcReconstructedPnlHistory(trades, filter, accountsList) {
  if (!trades || trades.length === 0) return [];

  // Group trades by account
  const tradesByAccount = {};
  trades.forEach(t => {
    if (!tradesByAccount[t.account]) {
      tradesByAccount[t.account] = [];
    }
    tradesByAccount[t.account].push(t);
  });

  const accountHistories = {};

  accountsList.forEach(acc => {
    const acctTrades = tradesByAccount[acc.name] || [];
    const sorted = [...acctTrades].sort((a, b) => {
      const dateDiff = normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date));
      if (dateDiff !== 0) return dateDiff;
      const timeA = parseTimeToSeconds(a.entry_time) || 0;
      const timeB = parseTimeToSeconds(b.entry_time) || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id - b.id;
    });

    const n = sorted.length;
    const startSize = parseFloat(acc.size) || 50000;
    const syncTime = acc.brokerUpdateTime ? new Date(acc.brokerUpdateTime).getTime() : null;

    const balances = new Array(n);
    let originalStartSize = startSize;

    if (syncTime && n > 0) {
      let firstAfterIdx = n;
      for (let i = 0; i < n; i++) {
        const tradeTime = sorted[i].createdAt ? new Date(sorted[i].createdAt).getTime() : null;
        if (tradeTime && tradeTime > syncTime) {
          firstAfterIdx = i;
          break;
        }
      }

      // 1. Backwards for trades before sync
      let currentBal = startSize;
      for (let i = firstAfterIdx - 1; i >= 0; i--) {
        balances[i] = currentBal;
        currentBal -= sorted[i].pnl;
      }
      originalStartSize = currentBal;

      // 2. Forwards for trades after sync
      currentBal = startSize;
      for (let i = firstAfterIdx; i < n; i++) {
        currentBal += sorted[i].pnl;
        balances[i] = currentBal;
      }
    } else {
      let currentBal = startSize;
      for (let i = 0; i < n; i++) {
        currentBal += sorted[i].pnl;
        balances[i] = currentBal;
      }
    }

    accountHistories[acc.name] = {
      sortedTrades: sorted,
      balances,
      originalStartSize,
    };
  });

  if (filter !== "all") {
    const hist = accountHistories[filter];
    if (!hist) return [];
    return hist.balances.map(b => b - hist.originalStartSize);
  }

  const sortedAllTrades = [...trades].sort((a, b) => {
    const dateDiff = normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date));
    if (dateDiff !== 0) return dateDiff;
    const timeA = parseTimeToSeconds(a.entry_time) || 0;
    const timeB = parseTimeToSeconds(b.entry_time) || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  const currentAcctPnl = {};
  accountsList.forEach(acc => { currentAcctPnl[acc.name] = 0; });

  const tradeIndexCounters = {};
  accountsList.forEach(acc => { tradeIndexCounters[acc.name] = 0; });

  const portfolioHistory = [];
  sortedAllTrades.forEach(t => {
    const accName = t.account;
    const hist = accountHistories[accName];
    if (hist && hist.sortedTrades.length > 0) {
      const idx = tradeIndexCounters[accName];
      if (idx < hist.balances.length) {
        currentAcctPnl[accName] = hist.balances[idx] - hist.originalStartSize;
        tradeIndexCounters[accName] = idx + 1;
      }
    }
    let totalPnl = 0;
    Object.keys(currentAcctPnl).forEach(name => { totalPnl += currentAcctPnl[name]; });
    portfolioHistory.push(totalPnl);
  });

  return portfolioHistory;
}


const EMPTY_TRADE = { date: new Date().toISOString().slice(0, 10), entry_time: "", exit_time: "", account: "BX101840-05 (50K)", instrument: "NQ Futures", direction: "Long", qty: 1, entry: 0, exit_price: 0, gross: 0, commission: -4, pnl: 0, mae: 0, mfe: 0, etd: 0, rr: 0, result: "Win", strategy: "", timeframe: "15s", notes: "", image: "" };

// ── Mini chart (SVG sparkline) ──────────────────────────────────────────────
function Sparkline({ data, color, height = 40 }) {
  if (!data || data.length < 2) return null;
  const w = 200, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const zeroY = h - ((0 - min) / range) * (h - 4) - 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={`M${pts.join("L")}L${w},${h}L0,${h}Z`} fill={`url(#sg${color.replace("#","")})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
      {min < 0 && max > 0 && <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="rgba(128,128,128,0.3)" strokeWidth="0.5" strokeDasharray="3,3" />}
    </svg>
  );
}

// ── Mini Donut ──────────────────────────────────────────────────────────────
function MiniDonut({ wins, losses, size = 30 }) {
  const total = wins + losses || 1;
  const winPct = wins / total;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const winDash = circ * winPct;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.red} strokeOpacity={0.35} strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.green} strokeWidth={stroke} strokeDasharray={`${winDash} ${circ}`} strokeDashoffset={circ * 0.25} strokeLinecap="round" />
    </svg>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, spark, rightElement }) {
  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: color || "var(--color-text-primary)" }}>{value}</div>
        </div>
        {rightElement && <div style={{ marginLeft: 8, flexShrink: 0 }}>{rightElement}</div>}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{sub}</div>}
      {spark && <div style={{ marginTop: 6 }}><Sparkline data={spark} color={color || C.blue} /></div>}
    </div>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────
function Bar({ pct, color }) {
  return (
    <div style={{ height: 7, background: "var(--color-background-secondary)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width .3s" }} />
    </div>
  );
}

// ── Account DD Card ─────────────────────────────────────────────────────────
function AccountCard({ account, rules, trades }) {
  const [expanded, setExpanded] = useState(false);
  
  const activeRules = rules || { size: 50000, target: 3000, dd_limit: 2500, daily_limit: 1100, status: "ACTIVE" };
  const isClosed = activeRules.status === "CLOSED";
  const isBurned = activeRules.status === "BURNED";

  const { netPnl, maxDD, peak, finalBalance } = calcAccountDD(trades, activeRules);
  const uniqueDays = [...new Set(trades.map(t => t.date))].length;
  const ddUsed = Math.abs(maxDD);
  const ddPct = (ddUsed / activeRules.dd_limit) * 100;
  const targetPct = Math.max(0, Math.min((netPnl / activeRules.target) * 100, 100));
  const ddRemaining = activeRules.dd_limit - ddUsed;
  const ddColor = ddPct >= 80 ? C.red : ddPct >= 50 ? C.amber : C.green;
  
  const normalBorderColor = ddPct >= 80 ? "#F5C4B3" : ddPct >= 50 ? "#FAC775" : "#9FE1CB";
  const borderColor = isClosed ? "var(--color-border-secondary)" : isBurned ? C.red : normalBorderColor;
  
  const alertColor = isClosed
    ? { bg: "var(--color-background-secondary)", text: "var(--color-text-secondary)" }
    : isBurned
      ? { bg: C.redBg, text: C.redText }
      : (ddPct >= 90 ? { bg: C.redBg, text: C.redText } : ddPct >= 60 ? { bg: "#FAEEDA", text: "#854F0B" } : { bg: C.greenBg, text: C.greenText });
      
  const alertMsg = isClosed
    ? "🔒 Cuenta Cerrada (Histórica)"
    : isBurned
      ? "💀 Cuenta Quemada (Superó DD)"
      : (ddPct >= 90 ? `⚠️ CRÍTICO — $${Math.round(ddRemaining)} restantes` : ddPct >= 60 ? `⚡ Precaución — ${fmtN(ddPct, 1)}% usado` : `✓ Saludable — ${fmtN(100 - ddPct, 0)}% DD libre`);

  return (
    <div style={{ 
      background: isClosed || isBurned ? "var(--color-background-secondary)" : "var(--color-background-primary)", 
      border: `0.5px solid ${borderColor}`, 
      borderRadius: 12, 
      overflow: "hidden",
      opacity: isClosed || isBurned ? 0.85 : 1,
      transition: "all 0.2s ease-in-out",
      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
    }}>
      {/* CABECERA (Resumen de la cuenta) */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:py-3 sm:px-4 cursor-pointer select-none gap-2.5 sm:gap-4"
        style={{
          background: expanded ? "var(--color-background-secondary)" : "transparent",
          transition: "background-color 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!expanded) e.currentTarget.style.background = "var(--color-background-secondary)";
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Fila 1: Chevron, Nombre, Tamaño, Estado, y en mobile el PnL Badge */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span style={{ 
              fontSize: 9, 
              color: "var(--color-text-secondary)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              display: "inline-block",
            }}>
              ▶
            </span>
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="font-semibold text-[13px] text-[var(--color-text-primary)] truncate">
                {account.split(" ")[0]}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2.5px 7px",
                borderRadius: 5,
                background: netPnl >= 0 ? C.greenBg : C.redBg,
                border: `0.5px solid ${netPnl >= 0 ? "#9FE1CB" : "#F5C4B3"}`,
                color: netPnl >= 0 ? C.greenText : C.redText,
              }}>
                ${Math.round(finalBalance).toLocaleString()}
              </span>
              <span style={{
                fontSize: 9,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-secondary)",
                color: "var(--color-text-secondary)",
              }}>
                Base: ${(activeRules.size / 1000).toFixed(0)}K
              </span>
              {isClosed && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 500 }}>Cerrada</span>}
              {isBurned && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: C.redBg, color: C.redText, fontWeight: 500 }}>Quemada 🔥</span>}
              {!isClosed && !isBurned && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: C.greenBg, color: C.greenText, fontWeight: 500 }}>Activa</span>}
            </div>
          </div>
          
          {/* Badge de P&L en Mobile (visible solo en móviles) */}
          <div className="sm:hidden">
            <span style={{ 
              fontSize: 11, 
              padding: "4px 10px", 
              borderRadius: 8, 
              background: netPnl >= 0 ? C.greenBg : C.redBg, 
              color: netPnl >= 0 ? C.greenText : C.redText, 
              fontWeight: 600,
              display: "inline-block",
            }}>
              {fmt(netPnl)}
            </span>
          </div>
        </div>

        {/* Fila 2: Columnas de información (Obj, DD, Días, PnL) */}
        {/* En móvil se muestra debajo, en desktop se muestra al lado en una sola fila */}
        <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
          
          {/* Valor / Objetivo */}
          <div className="flex flex-col min-w-0 sm:min-w-[100px]">
            <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px" }}>
              <span className="hidden sm:inline">Valor / Objetivo</span>
              <span className="sm:hidden">Obj.</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-primary)" }} className="sm:text-[11px] truncate">
              <span style={{ color: netPnl >= 0 ? C.green : C.red }}>{fmt(netPnl)}</span>
              <span style={{ color: "var(--color-text-tertiary)" }}> / ${activeRules.target.toLocaleString()}</span>
            </div>
            {/* Barra de progreso pequeña */}
            <div style={{ width: "100%", height: 3, background: "var(--color-border-secondary)", borderRadius: 1.5, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${targetPct}%`, height: "100%", background: C.green, borderRadius: 1.5 }} />
            </div>
          </div>

          {/* Drawdown */}
          <div className="flex flex-col min-w-0 sm:min-w-[100px]">
            <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px" }}>
              <span className="hidden sm:inline">Drawdown (DD)</span>
              <span className="sm:hidden">DD</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-primary)" }} className="sm:text-[11px] truncate">
              <span style={{ color: ddColor }}>-${Math.round(ddUsed).toLocaleString()}</span>
              <span style={{ color: "var(--color-text-tertiary)" }}> / ${activeRules.dd_limit.toLocaleString()}</span>
            </div>
            {/* Barra de progreso pequeña */}
            <div style={{ width: "100%", height: 3, background: "var(--color-border-secondary)", borderRadius: 1.5, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${ddPct}%`, height: "100%", background: ddColor, borderRadius: 1.5 }} />
            </div>
          </div>

          {/* Días de Trade */}
          <div className="flex flex-col min-w-0 sm:min-w-[60px]">
            <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px" }}>
              <span className="hidden sm:inline">Días Trade</span>
              <span className="sm:hidden">Días</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-primary)" }} className="sm:text-[11px]">
              {activeRules.activeDays ?? uniqueDays} <span style={{ fontSize: 9, color: "var(--color-text-secondary)", fontWeight: 400 }} className="sm:text-[10px]">días</span>
            </div>
          </div>

          {/* Badge de P&L en Desktop (oculto en móviles) */}
          <div className="hidden sm:block sm:min-w-[80px] sm:text-right">
            <span style={{ 
              fontSize: 11, 
              padding: "4px 10px", 
              borderRadius: 8, 
              background: netPnl >= 0 ? C.greenBg : C.redBg, 
              color: netPnl >= 0 ? C.greenText : C.redText, 
              fontWeight: 600,
              display: "inline-block",
            }}>
              {fmt(netPnl)}
            </span>
          </div>

        </div>
      </div>

      {/* CONTENIDO DESPLEGADO */}
      {expanded && (
        <div style={{ 
          padding: "16px 20px", 
          borderTop: "0.5px solid var(--color-border-secondary)", 
          background: "var(--color-background-primary)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[
              ["Saldo Estimado", `$${(activeRules.size + netPnl).toLocaleString()}`, "var(--color-text-primary)"],
              ["Pico de Cuenta", `+$${Math.round(peak).toLocaleString()}`, C.green],
              ["Max Drawdown", `-$${Math.round(ddUsed).toLocaleString()}`, C.red],
              ["Días de Operativa", `${trades.length} trades (${uniqueDays} d)`, "var(--color-text-primary)"],
              ["Drawdown Restante", `$${Math.round(ddRemaining).toLocaleString()}`, ddRemaining < 300 ? C.red : C.green],
              ["Límite Diario", activeRules.daily_limit ? `$${activeRules.daily_limit.toLocaleString()}` : "N/A", "var(--color-text-primary)"]
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: "var(--color-background-secondary)", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}>
                <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px" }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: c, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 3 }}>
              <span>Objetivo de Ganancia</span>
              <span>{fmt(netPnl)} / ${activeRules.target.toLocaleString()} · {fmtN(targetPct, 0)}%</span>
            </div>
            <Bar pct={targetPct} color={C.green} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 3 }}>
              <span>Límite de Drawdown</span>
              <span>${Math.round(ddUsed).toLocaleString()} / ${activeRules.dd_limit.toLocaleString()} · {fmtN(ddPct, 1)}%</span>
            </div>
            <Bar pct={ddPct} color={ddColor} />
          </div>

          {/* Sección de Datos de Rithmic */}
          {(activeRules.balance !== undefined && activeRules.balance !== null) && (
            <div style={{ 
              marginBottom: 16, 
              padding: "10px 14px", 
              borderRadius: 8, 
              background: "rgba(128,128,128,0.03)", 
              border: "0.5px solid var(--color-border-secondary)" 
            }}>
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8, fontWeight: 600 }}>
                Datos Reales (Rithmic Sync)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Saldo Rithmic</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-primary)", marginTop: 2 }}>
                    ${activeRules.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Umbral Liquidación</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: C.red, marginTop: 2 }}>
                    ${activeRules.threshold ? activeRules.threshold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Días Operados Broker</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-primary)", marginTop: 2 }}>
                    {activeRules.activeDays ?? "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Última Actualización</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {activeRules.updateDate || "N/A"}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ 
            fontSize: 10, 
            padding: "8px 12px", 
            borderRadius: 6, 
            background: alertColor.bg, 
            color: alertColor.text, 
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6
          }}>
            {alertMsg}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Equity SVG ──────────────────────────────────────────────────────────────
function EquityChart({ trades, accountFilter, accountsList }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(620);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.getBoundingClientRect().width);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setHoverIdx(null);
  }, [trades, accountFilter]);

  const filtered = accountFilter === "all" ? trades : trades.filter(t => t.account === accountFilter);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dateDiff = normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date));
      if (dateDiff !== 0) return dateDiff;
      const timeA = parseTimeToSeconds(a.entry_time) || 0;
      const timeB = parseTimeToSeconds(b.entry_time) || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id - b.id;
    });
  }, [filtered]);

  const pts = useMemo(() => {
    return calcReconstructedPnlHistory(filtered, accountFilter, accountsList || []);
  }, [filtered, accountFilter, accountsList]);

  if (pts.length < 2) return <div style={{ padding: 20, color: "var(--color-text-secondary)", fontSize: 13 }}>Sin datos suficientes</div>;

  const W = width || 620;
  const H = 160;
  const PAD = 45;
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
  const range = max - min || 1;
  const toX = i => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD / 2 - ((v - min) / range) * (H - PAD);
  const zeroY = toY(0);
  const polyPts = pts.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaGreenPts = `${toX(0)},${zeroY} ` + pts.map((v, i) => `${toX(i)},${Math.min(toY(v), zeroY)}`).join(" ") + ` ${toX(pts.length - 1)},${zeroY}`;
  const areaRedPts = `${toX(0)},${zeroY} ` + pts.map((v, i) => `${toX(i)},${Math.max(toY(v), zeroY)}`).join(" ") + ` ${toX(pts.length - 1)},${zeroY}`;
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => min + (i / tickCount) * range);

  const formatTick = (v) => {
    const abs = Math.abs(Math.round(v));
    if (abs === 0) return "$0";
    const sign = v >= 0 ? "+" : "-";
    return abs >= 1000
      ? `${sign}$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`
      : `${sign}$${abs}`;
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * W;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const x = toX(i);
      const diff = Math.abs(x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIdx(closestIdx);
  };

  const handleTouchMove = (e) => {
    if (!containerRef.current || !e.touches[0]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.touches[0].clientX - rect.left;
    const svgX = (mouseX / rect.width) * W;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const x = toX(i);
      const diff = Math.abs(x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIdx(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
  };

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, cursor: "crosshair", overflow: "visible" }}
        role="img"
        aria-label="Equity curve acumulada"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseLeave}
      >
        {ticks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={PAD} y1={y} x2={W - 10} y2={y} stroke={Math.abs(v) < range * 0.01 ? "rgba(128,128,128,0.4)" : "rgba(128,128,128,0.08)"} strokeWidth={Math.abs(v) < range * 0.01 ? 1 : 0.5} />
              <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={9} fill={C.gray}>{formatTick(v)}</text>
            </g>
          );
        })}
        <polygon points={areaGreenPts} fill="rgba(29,158,117,0.12)" />
        <polygon points={areaRedPts} fill="rgba(216,90,48,0.12)" />
        {pts.map((v, i) => {
          if (i === 0) return null;
          const avg = (pts[i - 1] + v) / 2;
          return <line key={i} x1={toX(i - 1)} y1={toY(pts[i - 1])} x2={toX(i)} y2={toY(v)} stroke={avg >= 0 ? C.green : C.red} strokeWidth={1.8} />;
        })}
        <line x1={PAD} y1={zeroY} x2={W - 10} y2={zeroY} stroke="rgba(128,128,128,0.5)" strokeWidth={1} />

        {hoverIdx !== null && (() => {
          const x = toX(hoverIdx);
          const y = toY(pts[hoverIdx]);
          const val = pts[hoverIdx];
          const trade = sorted[hoverIdx];
          const txt = fmt(val);
          const dateStr = trade?.date ? normalizeDateToYYYYMMDD(trade.date) : "";

          const tooltipW = 82;
          const tooltipH = 34;
          let tx = x - tooltipW / 2;
          if (tx < 5) tx = 5;
          if (tx + tooltipW > W - 5) tx = W - tooltipW - 5;

          const showBelow = y - tooltipH - 12 < 5;
          const ty = showBelow ? y + 12 : y - tooltipH - 12;
          const textCol = val >= 0 ? C.greenText : C.redText;

          return (
            <g pointerEvents="none">
              <line
                x1={x}
                y1={PAD / 2}
                x2={x}
                y2={H - PAD / 2}
                stroke="var(--color-border-primary)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <circle
                cx={x}
                cy={y}
                r={6}
                fill={val >= 0 ? C.green : C.red}
                opacity={0.3}
              />
              <circle
                cx={x}
                cy={y}
                r={3.5}
                fill={val >= 0 ? C.green : C.red}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <rect
                x={tx}
                y={ty}
                width={tooltipW}
                height={tooltipH}
                rx={6}
                fill="var(--color-background-primary)"
                stroke="var(--color-border-secondary)"
                strokeWidth={1}
                style={{ filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.06))" }}
              />
              <text
                x={tx + tooltipW / 2}
                y={ty + 14}
                textAnchor="middle"
                fontSize={10}
                fontWeight="600"
                fill={textCol}
              >
                {txt}
              </text>
              <text
                x={tx + tooltipW / 2}
                y={ty + 26}
                textAnchor="middle"
                fontSize={8}
                fill="var(--color-text-tertiary)"
              >
                {dateStr}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function CalendarWidget({ trades }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    return new Date().toISOString().slice(0, 7);
  });
  const lastTradesRef = useRef(null);

  useEffect(() => {
    if (trades && trades.length > 0 && trades !== lastTradesRef.current) {
      lastTradesRef.current = trades;
      const sorted = [...trades].sort((a, b) => {
        const dateA = normalizeDateToYYYYMMDD(a.date);
        const dateB = normalizeDateToYYYYMMDD(b.date);
        return dateB.localeCompare(dateA);
      });
      if (sorted[0]?.date) {
        const normDate = normalizeDateToYYYYMMDD(sorted[0].date);
        setCurrentMonth(normDate.slice(0, 7));
      }
    }
  }, [trades]);

  const year = parseInt(currentMonth.split("-")[0]);
  const mo = parseInt(currentMonth.split("-")[1]) - 1;

  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const handlePrevMonth = () => {
    let y = year;
    let m = mo - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    let y = year;
    let m = mo + 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`);
  };

  const handleMonthSelect = (m) => {
    setCurrentMonth(`${year}-${String(m + 1).padStart(2, "0")}`);
  };

  const handleYearSelect = (y) => {
    setCurrentMonth(`${y}-${String(mo + 1).padStart(2, "0")}`);
  };

  const monthStats = useMemo(() => {
    const monthTrades = trades.filter(t => {
      const normDate = normalizeDateToYYYYMMDD(t.date);
      return normDate.startsWith(currentMonth);
    });
    const totalGlobal = monthTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const totalWin = monthTrades.reduce((acc, t) => (t.pnl || 0) > 0 ? acc + t.pnl : acc, 0);
    const totalLose = monthTrades.reduce((acc, t) => (t.pnl || 0) < 0 ? acc + t.pnl : acc, 0);
    return { totalGlobal, totalWin, totalLose };
  }, [trades, currentMonth]);

  const byDate = {};
  trades.forEach(t => {
    const normalized = normalizeDateToYYYYMMDD(t.date);
    if (normalized.startsWith(currentMonth)) {
      if (!byDate[normalized]) byDate[normalized] = { pnl: 0, count: 0 };
      byDate[normalized].pnl += t.pnl;
      byDate[normalized].count++;
    }
  });

  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const startDow = (new Date(year, mo, 1).getDay() + 6) % 7;

  // Group days into weeks of 7 days (Monday to Sunday)
  const weeks = [];
  let currentWeek = [];

  // Empty cells at the start of the month
  for (let i = 0; i < startDow; i++) {
    currentWeek.push({ type: "empty" });
  }

  // Actual days
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentMonth}-${String(d).padStart(2, "0")}`;
    const dow = (new Date(year, mo, d).getDay() + 6) % 7;
    currentWeek.push({ type: "day", d, key, dow, info: byDate[key] });

    if (dow === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Empty cells at the end of the month
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ type: "empty" });
    }
    weeks.push(currentWeek);
  }

  const fmtPnl = (v) => {
    const abs = Math.abs(Math.round(v));
    return abs >= 1000
      ? (v < 0 ? "-" : "+") + "$" + (abs / 1000).toFixed(1) + "k"
      : (v < 0 ? "-" : "+") + "$" + abs;
  };

  const dayLabels = ["L", "M", "X", "J", "V", "S", "D", "SEMANA"];

  return (
    <div>
      {/* Navigation Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <button 
          onClick={handlePrevMonth} 
          style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", fontWeight: 600, outline: "none" }}
          title="Mes anterior"
        >
          ◀
        </button>
        
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select 
            value={mo} 
            onChange={(e) => handleMonthSelect(parseInt(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 12, cursor: "pointer", outline: "none", fontWeight: 500 }}
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={idx} value={idx}>{name}</option>
            ))}
          </select>
          
          <select 
            value={year} 
            onChange={(e) => handleYearSelect(parseInt(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 12, cursor: "pointer", outline: "none", fontWeight: 500 }}
          >
            {[2024, 2025, 2026, 2027, 2028].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        
        <button 
          onClick={handleNextMonth} 
          style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", fontWeight: 600, outline: "none" }}
          title="Mes siguiente"
        >
          ▶
        </button>
      </div>

      <div className="scroll-fade-container" style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ minWidth: 520 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 2, marginBottom: 4 }}>
            {dayLabels.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 500, color: d === "D" ? "#BA7517" : d === "SEMANA" ? "#854F0B" : "var(--color-text-tertiary)", padding: "2px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 2 }}>
            {weeks.map((week, wIdx) => {
              let weekPnl = 0;
              let weekTrades = 0;
              let weekDays = 0;

              week.forEach(day => {
                if (day.type === "day" && day.info) {
                  weekPnl += day.info.pnl;
                  weekTrades += day.info.count;
                  if (day.info.count > 0) {
                    weekDays++;
                  }
                }
              });

              const hasData = weekTrades > 0;
              const weekBg = hasData ? (weekPnl >= 0 ? "#EAF3DE" : "#FAECE7") : "var(--color-background-secondary)";
              const weekBorder = hasData ? (weekPnl >= 0 ? "#C0DD97" : "#F5C4B3") : "var(--color-border-tertiary)";
              const weekCol = weekPnl >= 0 ? "#3B6D11" : "#993C1D";

              return (
                <Fragment key={wIdx}>
                  {week.map((c, dIdx) => {
                    if (c.type === "empty") return <div key={`e-${wIdx}-${dIdx}`} style={{ background: "transparent", minHeight: 50 }} />;

                    const { info } = c;
                    const bg = info ? (info.pnl > 0 ? C.greenBg : info.pnl < 0 ? C.redBg : "var(--color-background-secondary)") : "var(--color-background-secondary)";
                    const col = info ? (info.pnl > 0 ? C.greenText : info.pnl < 0 ? C.redText : "var(--color-text-secondary)") : "var(--color-text-tertiary)";
                    const border = info ? (info.pnl > 0 ? "#9FE1CB" : info.pnl < 0 ? "#F5C4B3" : "var(--color-border-tertiary)") : "var(--color-border-tertiary)";
                    return (
                      <div key={`d-${c.d}`} style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 5, padding: "4px 3px", minHeight: 50 }}>
                        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 500 }}>{c.d}</div>
                        {info && <div style={{ fontSize: 11, fontWeight: 500, color: col }}>{fmtPnl(info.pnl)}</div>}
                        {info && <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{info.count}t</div>}
                      </div>
                    );
                  })}

                  <div key={`w-${wIdx}`} style={{ background: weekBg, border: `0.5px solid ${weekBorder}`, borderRadius: 5, padding: "4px 3px", minHeight: 50 }}>
                    <div style={{ fontSize: 9, color: "#854F0B", textTransform: "uppercase", letterSpacing: ".2px", fontWeight: 500 }}>Semana</div>
                    {hasData ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 500, color: weekCol }}>{fmtPnl(weekPnl)}</div>
                        <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{weekTrades}t · {weekDays}d</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>—</div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resumen Mensual */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        marginTop: 16,
      }}>
        {/* Total Global Card */}
        <div style={{
          background: monthStats.totalGlobal >= 0 ? C.greenBg : C.redBg,
          border: `0.5px solid ${monthStats.totalGlobal >= 0 ? "#9FE1CB" : "#F5C4B3"}`,
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          cursor: "default",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 9, color: monthStats.totalGlobal >= 0 ? C.greenText : C.redText, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>
            Total Global
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: monthStats.totalGlobal >= 0 ? C.greenText : C.redText }}>
            {fmt(monthStats.totalGlobal)}
          </div>
        </div>

        {/* Total Win Card */}
        <div style={{
          background: C.greenBg,
          border: "0.5px solid #9FE1CB",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          cursor: "default",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 9, color: C.greenText, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>
            Total Win
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.greenText }}>
            {fmt(monthStats.totalWin)}
          </div>
        </div>

        {/* Total Lose Card */}
        <div style={{
          background: C.redBg,
          border: "0.5px solid #F5C4B3",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          cursor: "default",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 9, color: C.redText, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>
            Total Lose
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.redText }}>
            {fmt(monthStats.totalLose)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Donut ────────────────────────────────────────────────────────────────────
function DonutChart({ wins, losses }) {
  const total = wins + losses || 1;
  const winPct = wins / total;
  const r = 50, cx = 70, cy = 70, stroke = 18;
  const circ = 2 * Math.PI * r;
  const winDash = circ * winPct;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={140} height={140} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.red} strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.green} strokeWidth={stroke} strokeDasharray={`${winDash} ${circ}`} strokeDashoffset={circ * 0.25} strokeLinecap="round" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={500} fill={C.green}>{fmtN(winPct * 100, 1)}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill={C.gray}>win rate</text>
      </svg>
      <div style={{ flex: 1 }}>
        {[["Wins", wins, C.green, C.greenBg], ["Losses", losses, C.red, C.redBg]].map(([label, count, color, bg]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</div>
            <span style={{ fontSize: 13, fontWeight: 500, color }}>{count}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>({fmtN(count / (wins + losses || 1) * 100, 0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bar chart generic ────────────────────────────────────────────────────────
function BarChart({ labels, values, height = 120 }) {
  if (!values.length) return null;
  const max = Math.max(...values.map(Math.abs), 1);
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, paddingBottom: 24 }}>
        {labels.map((l, i) => {
          const v = values[i];
          const h = Math.abs(v) / max * (height - 24);
          const color = v >= 0 ? C.green : C.red;
          return (
            <div key={`${l}-${i}`} style={{ flex: "1 1 0%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0 }}>
              {v >= 0 && <div style={{ width: "100%", maxWidth: 36, height: h, background: color, borderRadius: "3px 3px 0 0", opacity: 0.8 }} title={`${l}: ${fmt(v)}`} />}
              {v < 0 && <div style={{ width: "100%", maxWidth: 36, height: h, background: color, borderRadius: "0 0 3px 3px", opacity: 0.8, marginTop: "auto" }} title={`${l}: ${fmt(v)}`} />}
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l}>{l}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trade Form ───────────────────────────────────────────────────────────────
function TradeForm({ trade, onSave, onCancel, isNew, accounts = [] }) {
  const [form, setForm] = useState(() => {
    const initial = { ...EMPTY_TRADE, ...trade };
    if (initial.date && initial.date.includes("/")) {
      const parts = initial.date.split("/");
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          initial.date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        } else if (parts[0].length === 4) {
          initial.date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        }
      }
    }
    return initial;
  });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const gross = (parseLocaleFloat(form.pnl) || 0) - (parseLocaleFloat(form.commission) || 0);
    const mae = parseLocaleFloat(form.mae) || 0;
    const calculatedRR = mae > 0 ? parseFloat((gross / mae).toFixed(2)) : 0;
    if (form.rr !== calculatedRR) {
      setForm(f => ({ ...f, rr: calculatedRR }));
    }
  }, [form.pnl, form.commission, form.mae, form.rr]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const provider = localStorage.getItem("tj_ai_provider") || "gemini";
    const apiKey = localStorage.getItem("tj_ai_key") || "";

    if (!apiKey) {
      setScanError("Configura primero tu API Key en Ajustes ⚙️");
      return;
    }

    setScanning(true);
    setScanError("");
    setScanSuccess(false);

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const base64 = ev.target.result;
          const res = await fetch("/api/parse-trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64, provider, apiKey }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Error de la IA");
          }

          // Merge parsed data into form state
          setForm((prev) => ({
            ...prev,
            ...data,
            qty: parseInt(data.qty) || prev.qty,
            entry: parseFloat(data.entry) || prev.entry,
            exit_price: parseFloat(data.exit_price) || prev.exit_price,
            gross: parseFloat(data.gross) || prev.gross,
            commission: parseFloat(data.commission) || prev.commission,
            pnl: parseFloat(data.pnl) || prev.pnl,
            mae: parseFloat(data.mae) || prev.mae,
            mfe: parseFloat(data.mfe) || prev.mfe,
            etd: parseFloat(data.etd) || prev.etd,
            rr: parseFloat(data.rr) || prev.rr,
            image: base64,
          }));

          setScanSuccess(true);
        } catch (err) {
          console.error(err);
          setScanError(err.message || "Error al procesar la imagen");
        } finally {
          setScanning(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setScanError("Error al leer el archivo");
      setScanning(false);
    }
  };

  const renderField = (label, field, type = "text", opts) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</label>
      {opts ? (
        <select value={form[field] || ""} onChange={e => set(field, e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
          {opts.map(o => {
            const val = typeof o === "object" ? o.value : o;
            const lbl = typeof o === "object" ? o.label : o;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
      ) : (
        <input 
          type={type === "number" ? "text" : type} 
          inputMode={type === "number" ? "decimal" : undefined}
          value={form[field] ?? ""} 
          onChange={e => {
            const val = e.target.value;
            if (type === "number") {
              const cleaned = val.replace(/[^0-9.,-]/g, "");
              set(field, cleaned);
            } else {
              set(field, val);
            }
          }}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} 
        />
      )}
    </div>
  );

  const defaultInstruments = ["NQ Futures", "ES Futures", "MNQ Micro"];
  const instrumentOpts = defaultInstruments.includes(form.instrument)
    ? defaultInstruments
    : form.instrument 
      ? [form.instrument, ...defaultInstruments] 
      : defaultInstruments;

  const accountOpts = accounts.some(a => a.value === form.account)
    ? accounts
    : form.account 
      ? [{ value: form.account, label: form.account }, ...accounts]
      : accounts;

  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{isNew ? "Añadir operación" : `Editar trade #${form.id}`}</div>

      {isNew && (
        <div style={{
          border: "1.5px dashed var(--color-border-tertiary)",
          borderRadius: 8,
          padding: "12px",
          textAlign: "center",
          background: "var(--color-background-secondary)",
          marginBottom: 14,
          position: "relative",
          cursor: "pointer",
        }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={scanning}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
            }}
          />
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>
            {scanning ? "⏳ Procesando captura con IA..." : "📸 Arrastra o selecciona una captura para autocompletar"}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            Soporta capturas de NinjaTrader, TradingView, MetaTrader, etc.
          </div>
          {scanError && <div style={{ fontSize: 11, color: C.red, marginTop: 6, fontWeight: 500 }}>⚠️ {scanError}</div>}
          {scanSuccess && <div style={{ fontSize: 11, color: C.green, marginTop: 6, fontWeight: 500 }}>✓ Datos extraídos y completados. ¡Revisa los campos!</div>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mb-2.5">
        {renderField("Fecha", "date", "date")}
        {renderField("Hora entrada", "entry_time")}
        {renderField("Hora salida", "exit_time")}
        {renderField("Cuenta", "account", "text", accountOpts)}
        {renderField("Instrumento", "instrument", "text", instrumentOpts)}
        {renderField("Temporalidad", "timeframe", "text", ["15s", "30s", "1m", "3m", "7m"])}
        {renderField("Dirección", "direction", "text", ["Long", "Short"])}
        {renderField("Resultado", "result", "text", ["Win", "Loss", "Break Even"])}
        {renderField("Cantidad", "qty", "number")}
        {renderField("Precio entrada", "entry", "number")}
        {renderField("Precio salida", "exit_price", "number")}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px" }}>Estrategia</label>
          <select 
            value={["Estrategia 1", "Estrategia 2", "Estrategia 3"].includes(form.strategy) ? form.strategy : (form.strategy === "" ? "" : "Otra")} 
            onChange={e => {
              const val = e.target.value;
              if (val === "Otra") {
                set("strategy", "Otra");
              } else {
                set("strategy", val);
              }
            }} 
            style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", height: 30 }}
          >
            <option value="">Ninguna</option>
            <option value="Estrategia 1">Estrategia 1</option>
            <option value="Estrategia 2">Estrategia 2</option>
            <option value="Estrategia 3">Estrategia 3</option>
            <option value="Otra">Otra...</option>
          </select>
          {(!["Estrategia 1", "Estrategia 2", "Estrategia 3"].includes(form.strategy) && form.strategy !== "") && (
            <input 
              type="text" 
              value={form.strategy === "Otra" ? "" : form.strategy} 
              placeholder="Escribe la estrategia..."
              onChange={e => set("strategy", e.target.value)}
              style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", marginTop: 4 }} 
            />
          )}
        </div>
        {renderField("Net PnL ($)", "pnl", "number")}
        {renderField("Comisión ($)", "commission", "number")}
        {renderField("R múltiple", "rr", "number")}
        {renderField("MAE", "mae", "number")}
        {renderField("MFE", "mfe", "number")}
        {renderField("ETD", "etd", "number")}
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px", display: "block", marginBottom: 3 }}>Notas</label>
        <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} style={{ width: "100%", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px", display: "block", marginBottom: 5 }}>Imagen de la operativa</label>
        
        {form.image ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--color-background-secondary)", padding: 8, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}>
            <img src={form.image} alt="Operativa" style={{ height: 60, width: 80, objectFit: "cover", borderRadius: 4, border: "0.5px solid var(--color-border-tertiary)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-primary)", fontWeight: 500 }}>Captura de pantalla cargada</div>
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginTop: 2 }}>La imagen se guardará junto con el trade.</div>
            </div>
            <button 
              type="button"
              onClick={() => set("image", null)}
              style={{ padding: "4px 8px", background: "transparent", border: `0.5px solid ${C.red}`, color: C.red, borderRadius: 6, fontSize: 10, cursor: "pointer" }}
            >
              Eliminar imagen
            </button>
          </div>
        ) : (
          <div style={{
            border: "1.5px dashed var(--color-border-secondary)",
            borderRadius: 8,
            padding: "12px",
            textAlign: "center",
            background: "var(--color-background-secondary)",
            position: "relative",
            cursor: "pointer",
          }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    set("image", ev.target.result);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              📸 Cargar captura de pantalla de la operativa
            </div>
            <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              Selecciona o arrastra una imagen (PNG, JPG, JPEG)
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => {
          const pnlNum = parseLocaleFloat(form.pnl);
          const commNum = parseLocaleFloat(form.commission);
          onSave({
            ...form,
            qty: Math.round(parseLocaleFloat(form.qty)) || 1,
            entry: parseLocaleFloat(form.entry),
            exit_price: parseLocaleFloat(form.exit_price),
            commission: commNum,
            pnl: pnlNum,
            mae: parseLocaleFloat(form.mae),
            mfe: parseLocaleFloat(form.mfe),
            etd: parseLocaleFloat(form.etd),
            rr: parseLocaleFloat(form.rr),
            gross: pnlNum - commNum
          });
        }} style={{ padding: "6px 16px", background: C.green, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Guardar</button>
        <button onClick={onCancel} style={{ padding: "6px 16px", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Module wrapper ───────────────────────────────────────────────────────────
function Module({ id, label, icon, visible, onToggle, onMoveUp, onMoveDown, canUp, canDown, children, editMode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="premium-module" style={{ marginBottom: 12 }}>
      <div 
        className="premium-module-header"
        style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 8, 
          padding: "10px 14px", 
          borderBottom: collapsed ? "none" : "1px solid var(--glass-border)", 
          cursor: "pointer", 
          userSelect: "none" 
        }}
        onClick={() => !editMode && setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{label}</span>
        {editMode && (
          <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onMoveUp(id)} disabled={!canUp} style={{ padding: "2px 7px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "transparent", cursor: canUp ? "pointer" : "not-allowed", opacity: canUp ? 1 : 0.4 }}>↑</button>
            <button onClick={() => onMoveDown(id)} disabled={!canDown} style={{ padding: "2px 7px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "transparent", cursor: canDown ? "pointer" : "not-allowed", opacity: canDown ? 1 : 0.4 }}>↓</button>
            <button onClick={() => onToggle(id)} style={{ padding: "2px 8px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: visible ? C.redBg : C.greenBg, color: visible ? C.redText : C.greenText, cursor: "pointer" }}>{visible ? "Ocultar" : "Mostrar"}</button>
          </div>
        )}
        {!editMode && (
          <span
            style={{
              fontSize: 12,
              cursor: "pointer",
              userSelect: "none",
              filter: collapsed ? "grayscale(100%)" : "none",
              opacity: collapsed ? 0.35 : 1,
              transition: "all 0.2s ease",
            }}
            title={collapsed ? "Mostrar módulo" : "Ocultar módulo"}
          >
            ✅
          </span>
        ) }
      </div>
      {!collapsed && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}



// ── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({
  accountsList,
  fetchAccounts,
  fetchTrades,
  theme,
  onChangeTheme,
  aiProvider,
  setAiProvider,
  aiKey,
  setAiKey,
  trades = [],
}) {
  const [newAcct, setNewAcct] = useState({ name: "", size: 50000, target: 3000, dd_limit: 2500, daily_limit: 1100, balance: "", threshold: "", updateDate: "", activeDays: "" });
  const [editingAcctId, setEditingAcctId] = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [acctError, setAcctError] = useState("");
  const [saveKeySuccess, setSaveKeySuccess] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [brokerSyncModal, setBrokerSyncModal] = useState(null); // { id, balance, acctName }

  const handleSyncBase = async () => {
    if (!brokerSyncModal) return;
    const { id, balance } = brokerSyncModal;
    const acct = accountsList.find(a => a.id === id);
    if (!acct) return;
    try {
      const { _bypassDiffCheck, ...acctData } = acct;
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...acctData, size: parseFloat(balance), balance: null, updateDate: null }),
      });
      if (res.ok) {
        setBrokerSyncModal(null);
        setEditingAcctId(null);
        setEditAcct(null);
        await fetchAccounts();
        setAcctError("✓ Saldo base actualizado a $" + parseFloat(balance).toLocaleString());
        setTimeout(() => setAcctError(""), 4000);
      } else {
        const data = await res.json();
        setAcctError(data.error || "Error al sincronizar el saldo base");
      }
    } catch (err) {
      setAcctError("Error de red al sincronizar");
    }
  };

  // Vercel deployment version checking
  const [vercelStatus, setVercelStatus] = useState("idle"); // 'idle' | 'loading' | 'up-to-date' | 'new-version' | 'error'
  const [serverVersion, setServerVersion] = useState({ commitSha: "", deploymentId: "" });
  
  const clientCommit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'development';
  const clientDeployId = process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID || 'local';

  const checkVercelVersion = async (silent = false) => {
    if (!silent) setVercelStatus("loading");
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setServerVersion({
          commitSha: data.commitSha,
          deploymentId: data.deploymentId
        });

        // Determine if there is a new version
        const hasNewCommit = data.commitSha !== 'development' && clientCommit !== 'development' && data.commitSha !== clientCommit;
        const hasNewDeploy = data.deploymentId !== 'local' && clientDeployId !== 'local' && data.deploymentId !== clientDeployId;

        if (hasNewCommit || hasNewDeploy) {
          setVercelStatus("new-version");
        } else {
          setVercelStatus("up-to-date");
        }
      } else {
        if (!silent) setVercelStatus("error");
      }
    } catch (e) {
      console.error(e);
      if (!silent) setVercelStatus("error");
    }
  };

  useEffect(() => {
    checkVercelVersion(true); // Silent check on mount
  }, []);

  const handleWipeDatabase = async () => {
    if (!confirm("⚠️ ¿ESTÁS COMPLETAMENTE SEGURO?\n\nEsta acción eliminará permanentemente todas las cuentas de trading y todas las operaciones (trades) guardadas en la base de datos. Esta operación es irreversible.")) {
      return;
    }
    
    const confirmPhrase = prompt("Para confirmar la eliminación completa de la base de datos, escribe la palabra VACIAR en mayúsculas:");
    if (confirmPhrase !== "VACIAR") {
      alert("Confirmación incorrecta. Operación cancelada.");
      return;
    }

    try {
      setWipeLoading(true);
      const res = await fetch("/api/db-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clean_database" }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("✓ Base de datos vaciada con éxito. La aplicación se reiniciará limpia.");
        await fetchAccounts();
        await fetchTrades();
        await fetchDbStatus();
      } else {
        alert(`⚠️ Error: ${data.error}`);
      }
    } catch (e) {
      alert("⚠️ Error de red al intentar vaciar la base de datos.");
    } finally {
      setWipeLoading(false);
    }
  };

  // Database Integrity and Structure states
  const [dbStatus, setDbStatus] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [repairMsg, setRepairMsg] = useState("");
  const [selectedRelinkTargets, setSelectedRelinkTargets] = useState({});
  const [structureTab, setStructureTab] = useState("Trade");

  const fetchDbStatus = async () => {
    try {
      setDbLoading(true);
      setDbError("");
      const res = await fetch("/api/db-status");
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      } else {
        setDbError("No se pudo obtener el estado de la base de datos");
      }
    } catch (e) {
      setDbError("Error de conexión");
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const handleCreateMissing = async (missingAccountName) => {
    try {
      setRepairMsg("Creando cuenta...");
      const res = await fetch("/api/db-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_missing", missingAccountName }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepairMsg(`✓ ${data.message}`);
        await fetchAccounts();
        await fetchTrades();
        await fetchDbStatus();
      } else {
        setRepairMsg(`⚠️ ${data.error}`);
      }
    } catch (e) {
      setRepairMsg("⚠️ Error de conexión");
    } finally {
      setTimeout(() => setRepairMsg(""), 4000);
    }
  };

  const handleRelinkAll = async (missingAccountName, targetAccount) => {
    if (!targetAccount) {
      alert("Seleccione una cuenta de destino");
      return;
    }
    try {
      setRepairMsg("Vinculando trades...");
      const res = await fetch("/api/db-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relink_all", missingAccountName, targetAccount }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepairMsg(`✓ ${data.message}`);
        await fetchAccounts();
        await fetchTrades();
        await fetchDbStatus();
      } else {
        setRepairMsg(`⚠️ ${data.error}`);
      }
    } catch (e) {
      setRepairMsg("⚠️ Error de conexión");
    } finally {
      setTimeout(() => setRepairMsg(""), 4000);
    }
  };

  const handleAddAccount = async () => {
    if (!newAcct.name) {
      setAcctError("El nombre de la cuenta es requerido");
      return;
    }
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAcct),
      });
      if (res.ok) {
        setNewAcct({ name: "", size: 50000, target: 3000, dd_limit: 2500, daily_limit: 1100, balance: "", threshold: "", updateDate: "", activeDays: "" });
        setAcctError("");
        fetchAccounts();
      } else {
        const data = await res.json();
        setAcctError(data.error || "Error al crear la cuenta");
      }
    } catch (e) {
      setAcctError("Error de red al crear la cuenta");
    }
  };

  const handleUpdateAccount = async (id) => {
    if (!editAcct.name) {
      setAcctError("El nombre de la cuenta es requerido");
      return;
    }

    try {
      const { _bypassDiffCheck, ...acctToSave } = editAcct;

      const res = await fetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acctToSave),
      });
      if (res.ok) {
        setEditingAcctId(null);
        setEditAcct(null);
        setAcctError("");
        setBrokerDiffModal(null);
        fetchAccounts();
        fetchTrades();
      } else {
        const data = await res.json();
        setAcctError(data.error || "Error al actualizar la cuenta");
      }
    } catch (e) {
      setAcctError("Error de red al actualizar la cuenta");
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar esta cuenta? Los trades asociados seguirán existiendo.")) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchAccounts();
        fetchTrades();
      }
    } catch (e) {
      setAcctError("Error de red al eliminar la cuenta");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Theme Configuration */}
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>🌓</span> Tema visual
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "light", label: "☀️ Claro" },
            { id: "dark", label: "🌙 Oscuro" }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onChangeTheme(t.id)}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 8,
                border: theme === t.id ? `1px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)",
                background: theme === t.id ? C.blueBg : "var(--color-background-secondary)",
                color: theme === t.id ? C.blueText : "var(--color-text-secondary)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. AI Credentials Configuration */}
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>🤖</span> Configuración de IA (Escaneo de Capturas)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px" }}>Proveedor de IA</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
            >
              <option value="gemini">Gemini (2.5 Flash - Recomendado 🆓)</option>
              <option value="deepseek">DeepSeek (solo texto, sin visión de imágenes)</option>
              <option value="openai">OpenAI (GPT-4o-mini)</option>
              <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px" }}>API Key / Token</label>
            <input
              type="password"
              placeholder="Pega tu token de API aquí..."
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <button
              onClick={async () => {
                localStorage.setItem("tj_ai_provider", aiProvider);
                localStorage.setItem("tj_ai_key", aiKey);
                try {
                  await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aiProvider, aiKey })
                  });
                } catch (err) {
                  console.error("Error al guardar credenciales en BD:", err);
                }
                setSaveKeySuccess(true);
                setTimeout(() => setSaveKeySuccess(false), 3000);
              }}
              style={{ padding: "6px 14px", background: C.green, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}
            >
              Guardar Credenciales
            </button>
            {saveKeySuccess && <span style={{ fontSize: 11, color: C.green }}>✓ Credenciales guardadas</span>}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            Las claves se guardan de forma segura en tu base de datos y localmente en tu navegador.
          </div>
        </div>
      </div>

      {/* 3. Account Management */}
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>🏦</span> Cuentas de Trading
        </div>
        
        {acctError && (
          <div style={{ padding: "8px 12px", background: C.redBg, color: C.redText, borderRadius: 6, fontSize: 11, marginBottom: 12 }}>
            {acctError}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {accountsList.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "var(--color-background-secondary)", flexWrap: "wrap", gap: 8 }}>
              {editingAcctId === a.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
                  <input type="text" value={editAcct.name} onChange={e => setEditAcct({...editAcct, name: e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Nombre" />
                  <input type="number" value={editAcct.size} onChange={e => setEditAcct({...editAcct, size: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Balance" />
                  <input type="number" value={editAcct.target} onChange={e => setEditAcct({...editAcct, target: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Objetivo" />
                  <input type="number" value={editAcct.dd_limit} onChange={e => setEditAcct({...editAcct, dd_limit: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Max DD" />
                  <input type="number" value={editAcct.daily_limit} onChange={e => setEditAcct({...editAcct, daily_limit: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Límite Diario" />
                  <select value={editAcct.status || "ACTIVE"} onChange={e => setEditAcct({...editAcct, status: e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}>
                    <option value="ACTIVE">Activa</option>
                    <option value="CLOSED">Cerrada</option>
                    <option value="BURNED">Quemada 🔥</option>
                  </select>
                  <input type="number" value={editAcct.balance !== undefined && editAcct.balance !== null ? editAcct.balance : ""} onChange={e => setEditAcct({...editAcct, balance: e.target.value === "" ? null : parseFloat(e.target.value)})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: `0.5px solid ${C.blue}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="📋 Saldo Broker (referencia)" />
                  <input type="number" value={editAcct.threshold !== undefined && editAcct.threshold !== null ? editAcct.threshold : ""} onChange={e => setEditAcct({...editAcct, threshold: e.target.value === "" ? null : parseFloat(e.target.value)})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Umbral Liq." />
                  <input type="text" value={editAcct.updateDate !== undefined && editAcct.updateDate !== null ? editAcct.updateDate : ""} onChange={e => setEditAcct({...editAcct, updateDate: e.target.value === "" ? null : e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Fecha ref. broker" />
                  <input type="number" value={editAcct.activeDays !== undefined && editAcct.activeDays !== null ? editAcct.activeDays : ""} onChange={e => setEditAcct({...editAcct, activeDays: e.target.value === "" ? null : parseInt(e.target.value)})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Días Operados" />
                  {editAcct.balance !== null && editAcct.balance !== undefined && editAcct.balance !== "" && !isNaN(parseFloat(editAcct.balance)) && (
                    <button
                      onClick={() => setBrokerSyncModal({ id: a.id, balance: parseFloat(editAcct.balance), acctName: editAcct.name })}
                      style={{ padding: "4px 8px", background: C.blueBg, color: C.blueText, border: `0.5px solid ${C.blue}`, borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                      title="Usar el saldo del broker como nuevo punto de partida para los cálculos"
                    >
                      🔄 Sincronizar Base (${ parseFloat(editAcct.balance).toLocaleString() })
                    </button>
                  )}
                  <div className="flex gap-1.5 col-span-1 sm:col-span-2">
                    <button onClick={() => handleUpdateAccount(a.id)} style={{ flex: 1, padding: "4px 8px", background: C.green, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>Guardar</button>
                    <button onClick={() => { setEditingAcctId(null); setEditAcct(null); }} style={{ flex: 1, padding: "4px 8px", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {a.name}
                      {a.status === "CLOSED" && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 500 }}>Cerrada</span>}
                      {a.status === "BURNED" && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: C.redBg, color: C.redText, fontWeight: 500 }}>Quemada 🔥</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      Saldo: ${a.size.toLocaleString()} · Obj: ${a.target.toLocaleString()} · DD: ${a.dd_limit.toLocaleString()} · Diario: ${a.daily_limit.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => { setEditingAcctId(a.id); setEditAcct(a); }} style={{ fontSize: 10, padding: "3px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>✏️ Editar</button>
                    <button onClick={() => handleDeleteAccount(a.id)} style={{ fontSize: 10, padding: "3px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "var(--color-background-primary)", color: C.red, cursor: "pointer" }}>✕ Borrar</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Nueva Cuenta</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Nombre de Cuenta</label>
              <input type="text" placeholder="Ej: BX101840-06 (100K)" value={newAcct.name} onChange={e => setNewAcct({...newAcct, name: e.target.value})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Saldo Inicial ($)</label>
              <input type="number" placeholder="Ej: 50000" value={newAcct.size} onChange={e => setNewAcct({...newAcct, size: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Objetivo de Ganancia ($)</label>
              <input type="number" placeholder="Ej: 3000" value={newAcct.target} onChange={e => setNewAcct({...newAcct, target: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Límite de Drawdown ($)</label>
              <input type="number" placeholder="Ej: 2500" value={newAcct.dd_limit} onChange={e => setNewAcct({...newAcct, dd_limit: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div className="flex flex-col gap-0.5 col-span-1 sm:col-span-2">
               <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Límite de Pérdida Diaria ($)</label>
               <input type="number" placeholder="Ej: 1100" value={newAcct.daily_limit} onChange={e => setNewAcct({...newAcct, daily_limit: parseFloat(e.target.value) || 0})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Saldo Rithmic ($ · Opcional)</label>
              <input type="number" placeholder="Ej: 25105.66" value={newAcct.balance} onChange={e => setNewAcct({...newAcct, balance: e.target.value === "" ? "" : parseFloat(e.target.value)})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Umbral Liq. ($ · Opcional)</label>
              <input type="number" placeholder="Ej: 23797.83" value={newAcct.threshold} onChange={e => setNewAcct({...newAcct, threshold: e.target.value === "" ? "" : parseFloat(e.target.value)})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Fecha Act. (MM/DD/AA · Opcional)</label>
              <input type="text" placeholder="Ej: 05/22/26" value={newAcct.updateDate} onChange={e => setNewAcct({...newAcct, updateDate: e.target.value})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Días Operados (Opcional)</label>
              <input type="number" placeholder="Ej: 2" value={newAcct.activeDays} onChange={e => setNewAcct({...newAcct, activeDays: e.target.value === "" ? "" : parseInt(e.target.value)})} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
          </div>
          <button onClick={handleAddAccount} style={{ width: "100%", padding: "6px 12px", background: C.blue, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
            + Crear Cuenta
          </button>
        </div>
      </div>

      {/* 4. Database Structure & Integrity */}
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>⚙️ Integridad de Base de Datos</span>
          <button 
            onClick={fetchDbStatus} 
            disabled={dbLoading}
            style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}
          >
            {dbLoading ? "Analizando..." : "Re-analizar"}
          </button>
        </div>

        {dbError && <div style={{ fontSize: 11, color: C.red, marginBottom: 12 }}>⚠️ {dbError}</div>}
        {repairMsg && <div style={{ fontSize: 11, color: C.blue, marginBottom: 12, fontWeight: 500 }}>{repairMsg}</div>}

        {dbStatus && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: dbStatus.integrity.status === "healthy" ? C.greenBg : C.redBg, color: dbStatus.integrity.status === "healthy" ? C.greenText : C.redText, fontSize: 12, fontWeight: 500 }}>
              {dbStatus.integrity.status === "healthy" ? "✓ Base de datos íntegra" : "⚠️ Problemas de vinculación detectados"}
              <div style={{ fontWeight: 400, fontSize: 11, marginTop: 4 }}>
                {dbStatus.integrity.message}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
                <span style={{ color: "var(--color-text-tertiary)" }}>Total de Cuentas:</span> <strong>{dbStatus.integrity.totalAccounts}</strong>
              </div>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
                <span style={{ color: "var(--color-text-tertiary)" }}>Total de Trades:</span> <strong>{dbStatus.integrity.totalTrades}</strong>
              </div>
            </div>

            {dbStatus.integrity.orphans.length > 0 && (
              <div style={{ border: `1px solid ${C.red}`, borderRadius: 8, padding: 12, background: "var(--color-background-secondary)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.red, marginBottom: 8 }}>Trades huérfanos detectados:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dbStatus.integrity.orphans.map((o) => (
                    <div key={o.accountName} style={{ fontSize: 11, borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 8 }}>
                      <div>• Cuenta <strong>"{o.accountName}"</strong> tiene <strong>{o.tradeCount} trades</strong> pero no existe.</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button 
                          onClick={() => handleCreateMissing(o.accountName)} 
                          style={{ padding: "3px 8px", background: C.green, color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}
                        >
                          Crear cuenta "{o.accountName}"
                        </button>
                        <span style={{ color: "var(--color-text-tertiary)" }}>o migrar a:</span>
                        <select 
                          value={selectedRelinkTargets[o.accountName] || ""} 
                          onChange={(e) => setSelectedRelinkTargets({ ...selectedRelinkTargets, [o.accountName]: e.target.value })}
                          style={{ fontSize: 10, padding: "3px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                        >
                          <option value="">Selecciona...</option>
                          {accountsList.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                        <button 
                          onClick={() => handleRelinkAll(o.accountName, selectedRelinkTargets[o.accountName])}
                          style={{ padding: "3px 8px", background: C.blue, color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}
                        >
                          Migrar trades
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structure Inspector */}
            <div style={{ marginTop: 8, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Estructura de Tablas (Prisma)</span>
                <div style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 6, padding: 2 }}>
                  {["Trade", "Account"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setStructureTab(tab)}
                      style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "none", background: structureTab === tab ? "var(--color-background-primary)" : "transparent", color: "var(--color-text-primary)", cursor: "pointer" }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ maxHeight: 200, overflowY: "auto", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, background: "var(--color-background-secondary)" }}>
                <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-secondary)" }}>
                      <th style={{ padding: "5px 8px", fontWeight: 600 }}>Campo</th>
                      <th style={{ padding: "5px 8px", fontWeight: 600 }}>Tipo</th>
                      <th style={{ padding: "5px 8px", fontWeight: 600 }}>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbStatus.structure[structureTab].map((col) => (
                      <tr key={col.name} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        <td style={{ padding: "4px 8px", fontFamily: "monospace", fontWeight: 600 }}>{col.name}</td>
                        <td style={{ padding: "4px 8px", color: C.blue, fontFamily: "monospace" }}>{col.type}</td>
                        <td style={{ padding: "4px 8px", color: "var(--color-text-secondary)" }}>{col.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Version & Updates Configuration */}
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>🚀</span> Versión y Actualizaciones
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Version details table */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", fontWeight: 500 }}>Versión de la App</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 4 }}>v3.0</div>
            </div>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", fontWeight: 500 }}>Despliegue en Vercel</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 4, fontFamily: "monospace" }}>
                {serverVersion.commitSha ? (
                  serverVersion.commitSha === 'development' ? 'Local' : serverVersion.commitSha.slice(0, 7)
                ) : 'Desconocido'}
              </div>
            </div>
          </div>

          {/* Details on current client and server shas */}
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Build local (Cliente):</span>
              <strong style={{ fontFamily: "monospace" }}>{clientCommit === 'development' ? 'Local Dev' : clientCommit.slice(0, 7)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Build Vercel (Servidor):</span>
              <strong style={{ fontFamily: "monospace" }}>{serverVersion.commitSha === 'development' ? 'Local Dev' : (serverVersion.commitSha ? serverVersion.commitSha.slice(0, 7) : '—')}</strong>
            </div>
          </div>

          {/* Warning banner or status badge */}
          {vercelStatus === "loading" && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}} />
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>🔄</span> Buscando actualizaciones en Vercel...
            </div>
          )}
          
          {vercelStatus === "up-to-date" && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: C.greenBg, color: C.greenText, fontSize: 12, fontWeight: 500 }}>
              ✓ La aplicación está actualizada y ejecutando la última versión.
            </div>
          )}

          {vercelStatus === "new-version" && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: C.redBg, color: C.redText, border: `0.5px solid ${C.red}`, fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚠️</span> Nueva versión disponible
              </div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9 }}>
                Hay una nueva versión de la aplicación desplegada en Vercel. Por favor, actualiza para asegurarte de tener las últimas características y correcciones de errores.
              </div>
              <button
                onClick={() => window.location.reload()}
                style={{
                  alignSelf: "flex-start",
                  padding: "5px 12px",
                  background: C.red,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                Actualizar ahora
              </button>
            </div>
          )}

          {vercelStatus === "error" && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: C.redBg, color: C.redText, fontSize: 12 }}>
              ⚠️ No se pudo comprobar la versión de Vercel. Verifica tu conexión de red.
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={() => checkVercelVersion(false)}
              disabled={vercelStatus === "loading"}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 8,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-secondary)",
                fontSize: 12,
                fontWeight: 500,
                cursor: vercelStatus === "loading" ? "not-allowed" : "pointer",
              }}
            >
              Buscar actualizaciones
            </button>
            <button
              onClick={() => {
                if (confirm("¿Estás seguro de que deseas recargar la aplicación para forzar la actualización?")) {
                  window.location.reload();
                }
              }}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 8,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-secondary)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Actualizar manualmente
            </button>
          </div>
        </div>
      </div>


      {/* 6. Danger Zone */}
      <div style={{ background: "var(--color-background-primary)", border: `0.5px solid ${C.red}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.red, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span>⚠️</span> Zona de Peligro
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 12 }}>
          Acciones irreversibles sobre la base de datos. Por favor, procede con cautela.
        </p>
        <button
          onClick={handleWipeDatabase}
          disabled={wipeLoading}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: C.redBg,
            color: C.redText,
            border: `0.5px solid ${C.red}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: wipeLoading ? "not-allowed" : "pointer",
            transition: "all 0.2s ease"
          }}
        >
          {wipeLoading ? "Eliminando datos..." : "Vaciar Base de Datos (Cuentas y Trades)"}
        </button>
      </div>

      {brokerSyncModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 2000, padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 420,
            background: "var(--color-background-primary)",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 16, padding: 24,
            boxShadow: "0 20px 40px -5px rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                🔄 Sincronizar Saldo Base
              </h3>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6, marginBottom: 0 }}>
                Cuenta: <strong>{brokerSyncModal.acctName}</strong>
              </p>
            </div>
            <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Nuevo saldo base:</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
                  ${brokerSyncModal.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
              📅 Los cálculos del dashboard (Net P&L, equity, drawdown) partirán de este saldo. El campo "Saldo Broker" quedará limpio para la próxima semana.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setBrokerSyncModal(null)} style={{ fontSize: 11, padding: "8px 14px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontWeight: 500 }}>Cancelar</button>
              <button onClick={handleSyncBase} style={{ fontSize: 11, padding: "8px 18px", borderRadius: 6, border: "none", background: C.blue, color: "#fff", cursor: "pointer", fontWeight: 600 }}>✓ Confirmar Sync</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [trades, setTrades] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [visibility, setVisibility] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [acctFilter, setAcctFilter] = useState("all");
  const [accountsPanelFilter, setAccountsPanelFilter] = useState("all");
  const [editingTrade, setEditingTrade] = useState(null);
  const [addingTrade, setAddingTrade] = useState(false);
  const [page, setPage] = useState(1);
  const [importMsg, setImportMsg] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [wizardStatus, setWizardStatus] = useState("");
  const [wizardError, setWizardError] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const [bulkStrategy, setBulkStrategy] = useState("");
  const [bulkAccount, setBulkAccount] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [theme, setTheme] = useState("light");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiKey, setAiKey] = useState("");
  const [selectedTradeImage, setSelectedTradeImage] = useState(null);
  const [imageImportLoading, setImageImportLoading] = useState(false);
  const [deployId, setDeployId] = useState("");

  const PER_PAGE = 20;
  const isSettingsLoaded = useRef(false);

  // Load clientside options on mount
  useEffect(() => {
    // 1. Initial local cache/fallback values from LocalStorage
    try {
      const savedLayout = localStorage.getItem("tj_layout");
      if (savedLayout) {
        const parsed = JSON.parse(savedLayout);
        const validParsed = parsed.filter(id => ALL_MODULES.some(m => m.id === id));
        const missingIds = ALL_MODULES.map(m => m.id).filter(id => !validParsed.includes(id));
        setLayout([...validParsed, ...missingIds]);
      }
    } catch {}
    try {
      const savedVisibility = localStorage.getItem("tj_visibility");
      const defaultVisibility = Object.fromEntries(ALL_MODULES.map(m => [m.id, true]));
      if (savedVisibility) {
        setVisibility({ ...defaultVisibility, ...JSON.parse(savedVisibility) });
      } else {
        setVisibility(defaultVisibility);
      }
    } catch {
      setVisibility(Object.fromEntries(ALL_MODULES.map(m => [m.id, true])));
    }
    try {
      const savedTheme = localStorage.getItem("tj_theme");
      if (savedTheme) {
        setTheme(savedTheme);
        if (savedTheme === "dark") {
          document.documentElement.classList.add("dark");
          document.documentElement.classList.remove("light");
        } else {
          document.documentElement.classList.add("light");
          document.documentElement.classList.remove("dark");
        }
      }
    } catch {}
    try {
      const savedProvider = localStorage.getItem("tj_ai_provider");
      const savedKey = localStorage.getItem("tj_ai_key");
      if (savedProvider) setAiProvider(savedProvider);
      if (savedKey) setAiKey(savedKey);
    } catch {}
    try {
      const savedAcctFilter = localStorage.getItem("tj_acct_filter");
      const savedAccountsPanelFilter = localStorage.getItem("tj_accounts_panel_filter");
      if (savedAcctFilter) setAcctFilter(savedAcctFilter);
      if (savedAccountsPanelFilter) setAccountsPanelFilter(savedAccountsPanelFilter);
    } catch {}

    // 2. Fetch authoritative preferences from Database and override
    const loadDbSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const dbSettings = await res.json();
          if (dbSettings && dbSettings.clerkUserId) {
            if (dbSettings.layout) {
              try {
                const parsed = JSON.parse(dbSettings.layout);
                const validParsed = parsed.filter(id => ALL_MODULES.some(m => m.id === id));
                const missingIds = ALL_MODULES.map(m => m.id).filter(id => !validParsed.includes(id));
                setLayout([...validParsed, ...missingIds]);
              } catch {}
            }
            if (dbSettings.visibility) {
              try {
                const parsed = JSON.parse(dbSettings.visibility);
                const defaultVisibility = Object.fromEntries(ALL_MODULES.map(m => [m.id, true]));
                setVisibility({ ...defaultVisibility, ...parsed });
              } catch {}
            }
            if (dbSettings.theme) {
              setTheme(dbSettings.theme);
              if (dbSettings.theme === "dark") {
                document.documentElement.classList.add("dark");
                document.documentElement.classList.remove("light");
              } else {
                document.documentElement.classList.add("light");
                document.documentElement.classList.remove("dark");
              }
            }
            if (dbSettings.acctFilter) {
              setAcctFilter(dbSettings.acctFilter);
            }
            if (dbSettings.accountsPanelFilter) {
              setAccountsPanelFilter(dbSettings.accountsPanelFilter);
            }
            if (dbSettings.aiProvider) {
              setAiProvider(dbSettings.aiProvider);
            }
            if (dbSettings.aiKey) {
              setAiKey(dbSettings.aiKey);
            }
          }
        }
      } catch (err) {
        console.error("Error loading DB settings:", err);
      } finally {
        isSettingsLoaded.current = true;
      }
    };

    loadDbSettings();
    fetchAccounts();
    fetchTrades();

    const fetchVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          const sha = data.commitSha === 'development' ? 'Local' : (data.commitSha ? data.commitSha.slice(0, 7) : 'Local');
          setDeployId(sha);
        }
      } catch {}
    };
    fetchVersion();
  }, []);

  // Sync state changes to LocalStorage and Database
  useEffect(() => {
    // Sync to LocalStorage (instant cache)
    try {
      localStorage.setItem("tj_layout", JSON.stringify(layout));
      localStorage.setItem("tj_visibility", JSON.stringify(visibility));
      localStorage.setItem("tj_acct_filter", acctFilter);
      localStorage.setItem("tj_accounts_panel_filter", accountsPanelFilter);
      localStorage.setItem("tj_theme", theme);
      localStorage.setItem("tj_ai_provider", aiProvider);
      localStorage.setItem("tj_ai_key", aiKey);
    } catch {}

    // Only save to DB if loading has finished (prevents initial state from overwriting DB settings)
    if (!isSettingsLoaded.current) return;

    const syncToDb = async () => {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            layout: JSON.stringify(layout),
            visibility: JSON.stringify(visibility),
            theme,
            acctFilter,
            accountsPanelFilter,
            aiProvider,
            aiKey,
          }),
        });
      } catch (err) {
        console.error("Error syncing settings to DB:", err);
      }
    };

    const timer = setTimeout(syncToDb, 1000);
    return () => clearTimeout(timer);
  }, [layout, visibility, theme, acctFilter, accountsPanelFilter, aiProvider, aiKey]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccountsList(data);
      }
    } catch (err) {
      console.error("Error cargando cuentas:", err);
    }
  };

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/trades');
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
      }
    } catch (err) {
      console.error("Error cargando trades:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveTrade = async (t) => {
    try {
      if (addingTrade) {
        const res = await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        if (res.ok) {
          setAddingTrade(false);
          await fetchTrades();
          await fetchAccounts();
        } else {
          alert('Error al guardar el trade en la base de datos');
        }
      } else {
        const res = await fetch(`/api/trades/${t.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        if (res.ok) {
          setEditingTrade(null);
          await fetchTrades();
          await fetchAccounts();
        } else {
          alert('Error al actualizar el trade en la base de datos');
        }
      }
    } catch (err) {
      console.error("Error guardando trade:", err);
      alert('Error de conexión con el servidor');
    }
  };

  const deleteTrade = async (id) => {
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeleteConfirm(null);
        await fetchTrades();
        await fetchAccounts();
      } else {
        alert('Error al eliminar el trade de la base de datos');
      }
    } catch (err) {
      console.error("Error eliminando trade:", err);
      alert('Error de conexión con el servidor');
    }
  };

  const onChangeTheme = (newTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem("tj_theme", newTheme);
      if (newTheme === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
    } catch {}
  };

  const handleTradeFieldChange = (index, field, value) => {
    setPendingImport(prev => {
      if (!prev) return prev;
      const updated = [...prev.trades];
      
      let item = { ...updated[index], [field]: value };
      
      if (field === "result") {
        item.result = value;
      }
      
      if (field === "pnl" || field === "commission") {
        const pnlVal = parseLocaleFloat(field === "pnl" ? value : item.pnl);
        const commVal = parseLocaleFloat(field === "commission" ? value : item.commission);
        item.gross = pnlVal - commVal;
        
        if (pnlVal > 0) item.result = "Win";
        else if (pnlVal < 0) item.result = "Loss";
        else item.result = "Break Even";
      }

      if (field === "gross") {
        const grossVal = parseLocaleFloat(value);
        const commVal = parseLocaleFloat(item.commission);
        item.pnl = grossVal + commVal;
        
        if (item.pnl > 0) item.result = "Win";
        else if (item.pnl < 0) item.result = "Loss";
        else item.result = "Break Even";
      }

      const grossVal = parseLocaleFloat(item.gross);
      const maeVal = parseLocaleFloat(item.mae);
      if (maeVal > 0) {
        item.rr = parseFloat((grossVal / maeVal).toFixed(2));
      } else {
        item.rr = 0;
      }

      const dupResult = checkDuplicate(item, trades);
      item.isDuplicate = dupResult.isDuplicate;
      item.duplicatePct = dupResult.duplicatePct;
      item.duplicateOf = dupResult.duplicateOf;
      
      updated[index] = item;
      return { ...prev, trades: updated };
    });
  };

  const handleRemoveTradeFromImport = (index) => {
    setPendingImport(prev => {
      if (!prev) return prev;
      const updated = prev.trades.filter((_, i) => i !== index);
      return { ...prev, trades: updated };
    });
  };

  const applyBulkStrategy = () => {
    if (!bulkStrategy || !pendingImport) return;
    setPendingImport(prev => {
      const updated = prev.trades.map(t => ({ ...t, strategy: bulkStrategy }));
      return { ...prev, trades: updated };
    });
    setBulkStrategy("");
  };

  const applyBulkAccount = () => {
    if (!bulkAccount || !pendingImport) return;
    setPendingImport(prev => {
      const updated = prev.trades.map(t => {
        const updatedTrade = { ...t, account: bulkAccount };
        const dupResult = checkDuplicate(updatedTrade, trades);
        return {
          ...updatedTrade,
          isDuplicate: dupResult.isDuplicate,
          duplicatePct: dupResult.duplicatePct,
          duplicateOf: dupResult.duplicateOf,
          isExcluded: dupResult.isDuplicate, // Exclude by default if duplicate
        };
      });
      return { ...prev, trades: updated };
    });
    setBulkAccount("");
  };

  const selectAllTrades = (exclude) => {
    setPendingImport(prev => {
      if (!prev) return prev;
      const updated = prev.trades.map(t => ({ ...t, isExcluded: exclude }));
      return { ...prev, trades: updated };
    });
  };

  const handleFieldChange = (index, field, value) => {
    setPendingImport(prev => {
      if (!prev) return prev;
      const updated = [...prev.missingAccounts];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, missingAccounts: updated };
    });
  };

  const handleWizardSubmit = () => {
    if (wizardStep === 1) {
      handleCreateMissingAccounts();
    } else if (wizardStep === 2) {
      handleImportTrades();
    }
  };

  const handleCreateMissingAccounts = async () => {
    if (!pendingImport) return;
    try {
      setWizardStatus("creando_cuentas");
      setWizardError("");

      // 1. Create missing accounts that are marked as "create"
      for (const acct of pendingImport.missingAccounts) {
        if (acct.action === "link") continue; // Skip database creation!

        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: acct.name,
            size: acct.size,
            target: acct.target,
            dd_limit: acct.dd_limit,
            daily_limit: acct.daily_limit,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Error creando la cuenta "${acct.name}": ${errData.error || "Error de red"}`);
        }
      }

      setWizardStatus("cargando_cuentas");
      await fetchAccounts();

      // 2. Map trade accounts for those marked as "link"
      const mapping = {};
      pendingImport.missingAccounts.forEach(acct => {
        if (acct.action === "link" && acct.linkTo) {
          mapping[acct.name] = acct.linkTo;
        }
      });

      const updatedTrades = pendingImport.trades.map(t => {
        let mappedAccount = t.account;
        if (mapping[t.account]) {
          mappedAccount = mapping[t.account];
        }
        const updatedTrade = { ...t, account: mappedAccount };
        const dupResult = checkDuplicate(updatedTrade, trades);
        return {
          ...updatedTrade,
          isDuplicate: dupResult.isDuplicate,
          duplicatePct: dupResult.duplicatePct,
          duplicateOf: dupResult.duplicateOf,
          isExcluded: dupResult.isDuplicate, // Exclude by default if duplicate
        };
      });

      setPendingImport(prev => ({
        ...prev,
        trades: updatedTrades,
        missingAccounts: [],
      }));
      setWizardStep(2);
      setWizardStatus("");
    } catch (err) {
      console.error(err);
      setWizardError(err.message || "Error al crear las cuentas");
      setWizardStatus("error");
    }
  };

  const handleImportTrades = async () => {
    if (!pendingImport) return;
    try {
      setWizardStatus("importando_trades");
      setWizardError("");

      let importedCount = 0;
      let firstError = null;
      const savedTrades = [];
      const tradesToImport = pendingImport.trades.filter(t => !t.isExcluded);
      const totalTrades = tradesToImport.length;

      if (totalTrades === 0) {
        setImportMsg("No hay trades seleccionados para importar");
        setTimeout(() => setImportMsg(""), 3000);
        setPendingImport(null);
        setWizardStatus("");
        return;
      }

      for (let i = 0; i < totalTrades; i++) {
        setWizardStatus(`importando_trades_progress:${i + 1}:${totalTrades}`);
        const res = await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradesToImport[i]),
        });
        if (res.ok) {
          const saved = await res.json();
          savedTrades.push(saved);
          importedCount++;
        } else {
          try {
            const errData = await res.json();
            firstError = errData.error || `HTTP ${res.status}: ${res.statusText}`;
          } catch {
            firstError = `HTTP ${res.status}: ${res.statusText}`;
          }
          console.error(`Error al importar trade index ${i}:`, firstError);
        }
      }

      if (importedCount > 0) {
        await fetchTrades();
        await fetchAccounts();
        if (importedCount < totalTrades) {
          setImportMsg(`✓ ${importedCount} importados, ${totalTrades - importedCount} fallaron (Error: ${firstError})`);
        } else {
          setImportMsg(`✓ ${importedCount} trades importados con éxito`);
        }
      } else {
        setImportMsg(`No se pudieron importar trades. Error: ${firstError || "Desconocido"}`);
      }
      setTimeout(() => setImportMsg(""), 6000);

      setPendingImport(null);
      setWizardStatus("");
    } catch (err) {
      console.error(err);
      setWizardError(err.message || "Error durante el proceso de importación");
      setWizardStatus("error");
    }
  };

  const checkDuplicate = (newTrade, existingTrades) => {
    let bestMatch = null;
    let highestPct = 0;

    for (const ext of existingTrades) {
      let matches = 0;

      // 1. date
      if (normalizeDateToYYYYMMDD(newTrade.date) === normalizeDateToYYYYMMDD(ext.date)) matches++;

      // 2. entry_time
      const et1 = (newTrade.entry_time || "").trim();
      const et2 = (ext.entry_time || "").trim();
      if (et1 && et2 && et1 === et2) matches++;

      // 3. exit_time
      const xt1 = (newTrade.exit_time || "").trim();
      const xt2 = (ext.exit_time || "").trim();
      if (xt1 && xt2 && xt1 === xt2) matches++;

      // 4. account
      const ac1 = (newTrade.account || "").trim().toLowerCase();
      const ac2 = (ext.account || "").trim().toLowerCase();
      if (ac1 && ac2 && ac1 === ac2) matches++;

      // 5. instrument
      const inst1 = (newTrade.instrument || "").trim().toLowerCase();
      const inst2 = (ext.instrument || "").trim().toLowerCase();
      if (inst1 && inst2 && inst1 === inst2) matches++;

      // 6. direction
      const dir1 = (newTrade.direction || "").trim().toLowerCase();
      const dir2 = (ext.direction || "").trim().toLowerCase();
      if (dir1 && dir2 && dir1 === dir2) matches++;

      // 7. qty
      if (parseInt(newTrade.qty) === parseInt(ext.qty)) matches++;

      // 8. entry
      const p1 = parseFloat(newTrade.entry) || 0;
      const p2 = parseFloat(ext.entry) || 0;
      if (Math.abs(p1 - p2) < 0.01) matches++;

      // 9. exit_price
      const ep1 = parseFloat(newTrade.exit_price) || 0;
      const ep2 = parseFloat(ext.exit_price) || 0;
      if (Math.abs(ep1 - ep2) < 0.01) matches++;

      // 10. pnl
      const pnl1 = parseFloat(newTrade.pnl) || 0;
      const pnl2 = parseFloat(ext.pnl) || 0;
      if (Math.abs(pnl1 - pnl2) < 0.01) matches++;

      const pct = (matches / 10) * 100;
      if (pct > highestPct) {
        highestPct = pct;
        bestMatch = ext;
      }
    }

    return {
      isDuplicate: highestPct >= 50,
      duplicatePct: Math.round(highestPct),
      duplicateOf: bestMatch
    };
  };

  const handleImageImportAI = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const provider = localStorage.getItem("tj_ai_provider") || "gemini";
    const apiKey = localStorage.getItem("tj_ai_key") || "";

    if (!apiKey) {
      setImportMsg("⚠️ Configura tu API Key en Ajustes ⚙️ antes de importar por imagen");
      setTimeout(() => setImportMsg(""), 4000);
      return;
    }

    setImageImportLoading(true);
    setImportMsg("🤖 Procesando imagen con IA...");

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const base64 = ev.target.result;
          const res = await fetch("/api/parse-trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64, provider, apiKey, multiple: true }),
          });

          const resData = await res.json();
          if (!res.ok) throw new Error(resData.error || "Error de la IA");

          // The API returns { trades: [...] } when multiple=true
          const rawTrades = Array.isArray(resData.trades) ? resData.trades : (resData.trades ? [resData.trades] : [resData]);

          if (rawTrades.length === 0) {
            setImportMsg("⚠️ La IA no encontró operaciones en la imagen");
            setTimeout(() => setImportMsg(""), 4000);
            return;
          }

          const today = new Date().toISOString().slice(0, 10);

          const newTradesData = rawTrades.map((t) => {
            // Normalize date
            let dateVal = t.date || today;
            if (dateVal && !dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
              dateVal = normalizeDateToYYYYMMDD(dateVal);
            }

            const grossVal = parseLocaleFloat(t.gross) || 0;
            const commissionVal = parseLocaleFloat(t.commission) || 0;
            const pnlVal = parseLocaleFloat(t.pnl) || (grossVal + commissionVal);
            const maeVal = parseLocaleFloat(t.mae) || 0;
            const mfeVal = parseLocaleFloat(t.mfe) || 0;
            const etdVal = parseLocaleFloat(t.etd) || 0;
            let rrVal = parseLocaleFloat(t.rr) || 0;
            if (rrVal === 0 && maeVal > 0) rrVal = parseFloat((grossVal / maeVal).toFixed(2));
            let resultVal = t.result || (pnlVal > 0 ? "Win" : pnlVal < 0 ? "Loss" : "Break Even");

            const tradeCandidate = {
              date: dateVal,
              entry_time: t.entry_time || "",
              exit_time: t.exit_time || "",
              account: t.account || (accountsList[0]?.name || ""),
              instrument: t.instrument || "NQ Futures",
              direction: t.direction || "Long",
              qty: Math.round(parseLocaleFloat(t.qty)) || 1,
              entry: parseLocaleFloat(t.entry) || 0,
              exit_price: parseLocaleFloat(t.exit_price) || 0,
              gross: grossVal,
              commission: commissionVal,
              pnl: pnlVal,
              mae: maeVal,
              mfe: mfeVal,
              etd: etdVal,
              rr: rrVal,
              result: resultVal,
              strategy: t.strategy || "",
              timeframe: t.timeframe || "15s",
              notes: t.notes || "",
            };

            const dupResult = checkDuplicate(tradeCandidate, trades);
            return {
              ...tradeCandidate,
              isDuplicate: dupResult.isDuplicate,
              duplicatePct: dupResult.duplicatePct,
              duplicateOf: dupResult.duplicateOf,
              isExcluded: dupResult.isDuplicate,
            };
          }).filter(t => !isNaN(t.pnl));

          if (newTradesData.length === 0) {
            setImportMsg("⚠️ No se pudieron procesar las operaciones de la imagen");
            setTimeout(() => setImportMsg(""), 4000);
            return;
          }

          setImportMsg("");

          // Check for missing accounts (same flow as CSV import)
          const imgAccounts = [...new Set(newTradesData.map(t => t.account))].filter(Boolean);
          const existingNames = accountsList.map(a => a.name);
          const missingNames = imgAccounts.filter(name => !existingNames.includes(name));

          if (missingNames.length > 0) {
            setPendingImport({
              trades: newTradesData,
              missingAccounts: missingNames.map(name => ({
                name,
                action: "create",
                linkTo: accountsList[0]?.name || "",
                size: 50000,
                target: 3000,
                dd_limit: 2500,
                daily_limit: 1100,
              })),
            });
            setWizardStep(1);
          } else {
            setPendingImport({
              trades: newTradesData,
              missingAccounts: [],
            });
            setWizardStep(2);
          }
        } catch (err) {
          console.error(err);
          setImportMsg(`⚠️ ${err.message || "Error al procesar la imagen"}`);
          setTimeout(() => setImportMsg(""), 5000);
        } finally {
          setImageImportLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setImportMsg("⚠️ Error al leer el archivo de imagen");
      setTimeout(() => setImportMsg(""), 4000);
      setImageImportLoading(false);
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split("\n").filter(Boolean);
        if (lines.length === 0) return;

        const firstLine = lines[0];
        const delimiter = firstLine.includes(";") ? ";" : ",";

        const splitCSVLine = (lineText, delim) => {
          const result = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < lineText.length; i++) {
            const char = lineText[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === delim && !inQuotes) {
              result.push(current.trim().replace(/"/g, ""));
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current.trim().replace(/"/g, ""));
          return result;
        };

        const headers = splitCSVLine(firstLine, delimiter).map(h => h.toLowerCase().trim());
        
        const extractDateOnly = (val) => {
          if (!val) return new Date().toISOString().slice(0, 10);
          const cleaned = String(val).trim();
          if (cleaned.includes(" ")) return cleaned.split(" ")[0];
          if (cleaned.includes("T")) return cleaned.split("T")[0];
          return cleaned;
        };

        const extractTimeOnly = (val) => {
          if (!val) return "";
          const cleaned = String(val).trim();
          if (cleaned.includes(" ")) return cleaned.split(" ")[1];
          if (cleaned.includes("T")) {
            const timePart = cleaned.split("T")[1];
            return timePart.includes(".") ? timePart.split(".")[0] : timePart;
          }
          return cleaned;
        };

        const newTradesData = lines.slice(1).map((line) => {
          const vals = splitCSVLine(line, delimiter);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ""; });

          const getVal = (aliases, defaultVal = "") => {
            for (const alias of aliases) {
              const lowerAlias = alias.toLowerCase().trim();
              if (obj[lowerAlias] !== undefined) return obj[lowerAlias];
            }
            return defaultVal;
          };

          const rawEntryTime = getVal(["entry_time", "hora_entrada", "hora entrada", "entry time", "fecha", "date"], "");
          const rawExitTime = getVal(["exit_time", "hora_salida", "hora salida", "exit time"], "");

          const dateVal = normalizeDateToYYYYMMDD(extractDateOnly(rawEntryTime));
          const entryTimeVal = extractTimeOnly(rawEntryTime);
          const exitTimeVal = extractTimeOnly(rawExitTime);

          const accountName = getVal(["account", "cuenta"], "BX101840-05 (50K)");

          const grossVal = parseLocaleFloat(getVal(["gross", "bruto", "profit", "ganancia"], "0"));
          const rawComm = getVal(["commission", "comisión", "comision", "comisiones"], null);
          const commissionVal = rawComm !== null ? parseLocaleFloat(rawComm) : -4;
          const rawPnl = getVal(["pnl", "net profit", "neto", "p&l", "resultado", "net_profit"], null);
          const pnlVal = rawPnl !== null ? parseLocaleFloat(rawPnl) : (grossVal + commissionVal);

          const maeVal = parseLocaleFloat(getVal(["mae", "MAE"], "0"));
          const mfeVal = parseLocaleFloat(getVal(["mfe", "MFE"], "0"));
          const etdVal = parseLocaleFloat(getVal(["etd", "ETD"], "0"));

          let rrVal = parseLocaleFloat(getVal(["rr", "r multiple", "ratio", "r", "r_multiple"], "0"));
          if (rrVal === 0 && maeVal > 0) {
            rrVal = parseFloat((grossVal / maeVal).toFixed(2));
          }

          let resultVal = getVal(["result", "win/loss", "res", "resultado_op", "win_loss"], "");
          if (!resultVal) {
            resultVal = pnlVal > 0 ? "Win" : pnlVal < 0 ? "Loss" : "Break Even";
          }

          const entryPrice = parseLocaleFloat(getVal(["entry pr", "entry_price", "precio_entrada", "precio entrada", "entry price", "entry"], "0"));
          const exitPrice = parseLocaleFloat(getVal(["exit pric", "exit_price", "precio_salida", "precio salida", "exit price", "exit"], "0"));
          const directionVal = getVal(["direction", "dirección", "direccion", "dir", "market pos.", "market pos", "market p"], "Long");
          const qtyVal = Math.round(parseLocaleFloat(getVal(["qty", "cantidad", "contratos"], "1"))) || 1;

          const tradeCandidate = {
            date: dateVal,
            account: accountName,
            instrument: getVal(["instrument", "instrumento", "instr"], "NQ Futures"),
            direction: directionVal,
            qty: qtyVal,
            entry: entryPrice,
            exit_price: exitPrice,
            gross: grossVal,
            commission: commissionVal,
            pnl: pnlVal,
            mae: maeVal,
            mfe: mfeVal,
            etd: etdVal,
            rr: rrVal,
            result: resultVal,
            strategy: getVal(["strategy", "estrategia"], ""),
            timeframe: getVal(["timeframe", "temporalidad"], "15s"),
            notes: getVal(["notes", "notas", "comentarios"], ""),
            entry_time: entryTimeVal,
            exit_time: exitTimeVal,
          };

          const dupResult = checkDuplicate(tradeCandidate, trades);

          return {
            ...tradeCandidate,
            isDuplicate: dupResult.isDuplicate,
            duplicatePct: dupResult.duplicatePct,
            duplicateOf: dupResult.duplicateOf,
            isExcluded: dupResult.isDuplicate, // Exclude by default if >= 50% match
          };
        }).filter(t => !isNaN(t.pnl));

        // Check if there are missing accounts
        const csvAccounts = [...new Set(newTradesData.map(t => t.account))].filter(Boolean);
        const existingNames = accountsList.map(a => a.name);
        const missingNames = csvAccounts.filter(name => !existingNames.includes(name));

        if (missingNames.length > 0) {
          setPendingImport({
            trades: newTradesData,
            missingAccounts: missingNames.map(name => ({
              name,
              action: "create",
              linkTo: accountsList[0]?.name || "",
              size: 50000,
              target: 3000,
              dd_limit: 2500,
              daily_limit: 1100,
            })),
          });
          setWizardStep(1);
        } else {
          setPendingImport({
            trades: newTradesData,
            missingAccounts: [],
          });
          setWizardStep(2);
        }
      } catch (err) {
        console.error(err);
        setImportMsg("Error al importar CSV");
        setTimeout(() => setImportMsg(""), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = useMemo(() => {
    const base = acctFilter === "all" ? trades : trades.filter(t => t.account === acctFilter);
    return base.filter(t => t.instrument !== "Ajuste de Broker");
  }, [trades, acctFilter]);
  const stats = useMemo(() => calcStats(filtered), [filtered]);
  
  const accounts = useMemo(() => accountsList.map(a => a.name), [accountsList]);

  const activeAccountsForForm = useMemo(() => {
    return accountsList
      .filter(a => a.status === "ACTIVE" || !a.status)
      .map(a => ({ value: a.name, label: a.name }));
  }, [accountsList]);

  const allAccountsForForm = useMemo(() => {
    return accountsList.map(a => {
      let label = a.name;
      if (a.status === "CLOSED") label += " (Cerrada)";
      else if (a.status === "BURNED") label += " (Quemada 🔥)";
      return { value: a.name, label };
    });
  }, [accountsList]);

  const accountsButtons = useMemo(() => {
    return [
      ["all", "Todas"],
      ...accountsList.map(a => {
        let label = a.name.split(" ")[0];
        if (a.status === "CLOSED") label += " 🔒";
        else if (a.status === "BURNED") label += " 🔥";
        return [a.name, label];
      })
    ];
  }, [accountsList]);

  const trueNetPnl = useMemo(() => {
    if (acctFilter === "all") {
      return accountsList.reduce((acc, a) => {
        const acctTrades = filtered.filter(t => t.account === a.name);
        const { netPnl } = calcAccountDD(acctTrades, a);
        return acc + netPnl;
      }, 0);
    } else {
      const selectedAcct = accountsList.find(a => a.name === acctFilter);
      return calcAccountDD(filtered, selectedAcct).netPnl;
    }
  }, [filtered, acctFilter, accountsList]);

  const equitySpark = useMemo(() => {
    return calcReconstructedPnlHistory(filtered, acctFilter, accountsList);
  }, [filtered, acctFilter, accountsList]);

  const dowData = useMemo(() => {
    const map = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    filtered.forEach(t => {
      const d = new Date(t.date).getDay();
      const idx = d === 1 ? 0 : d === 2 ? 1 : d === 3 ? 2 : d === 4 ? 3 : d === 5 ? 4 : -1;
      if (idx >= 0) map[idx] += t.pnl;
    });
    return { labels: ["Lun", "Mar", "Mié", "Jue", "Vie"], values: [0, 1, 2, 3, 4].map(i => Math.round(map[i])) };
  }, [filtered]);

  const stratData = useMemo(() => {
    const map = {};
    filtered.forEach(t => { const s = t.strategy || "Sin estrategia"; map[s] = (map[s] || 0) + t.pnl; });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { labels: sorted.map(([k]) => k.replace("ATM ", "")), values: sorted.map(([, v]) => Math.round(v)) };
  }, [filtered]);

  const paginatedTrades = useMemo(() => {
    const s = [...filtered].sort((a, b) => b.id - a.id);
    return s.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const toggleModule = (id) => setVisibility(v => ({ ...v, [id]: !v[id] }));
  const moveModule = (id, dir) => {
    setLayout(prev => {
      const i = prev.indexOf(id);
      if (i === -1) return prev;
      const next = [...prev];
      const swap = i + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[i], next[swap]] = [next[swap], next[i]];
      return next;
    });
  };

  const orderedModules = layout.map(id => ALL_MODULES.find(m => m.id === id)).filter(Boolean);

  const renderModule = (mod, idx) => {
    if (!visibility[mod.id] && !editMode) return null;
    const props = {
      id: mod.id, label: mod.label, icon: mod.icon,
      visible: visibility[mod.id], onToggle: toggleModule,
      onMoveUp: (id) => moveModule(id, -1), onMoveDown: (id) => moveModule(id, 1),
      canUp: idx > 0, canDown: idx < orderedModules.length - 1, editMode,
    };
    if (!visibility[mod.id] && editMode) {
      return (
        <div key={mod.id} style={{ border: "0.5px dashed var(--color-border-tertiary)", borderRadius: 12, marginBottom: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
          <span style={{ fontSize: 14 }}>{mod.icon}</span>
          <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-tertiary)" }}>{mod.label} (oculto)</span>
          <button onClick={() => toggleModule(mod.id)} style={{ padding: "2px 8px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: C.greenBg, color: C.greenText, cursor: "pointer" }}>Mostrar</button>
          <button onClick={() => moveModule(mod.id, -1)} disabled={idx === 0} style={{ padding: "2px 7px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "transparent", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
          <button onClick={() => moveModule(mod.id, 1)} disabled={idx === orderedModules.length - 1} style={{ padding: "2px 7px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "transparent", cursor: idx === orderedModules.length - 1 ? "not-allowed" : "pointer", opacity: idx === orderedModules.length - 1 ? 0.4 : 1 }}>↓</button>
        </div>
      );
    }
    if (mod.id === "kpis") return (
      <Module key={mod.id} {...props}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-2.5">
          <KpiCard label="Net P&L" value={fmt(Math.round(trueNetPnl))} color={trueNetPnl >= 0 ? C.green : C.red} spark={equitySpark} />
          <KpiCard label="Win rate" value={`${fmtN(stats.wr || 0, 1)}%`} sub={`${stats.wins || 0}W / ${stats.losses || 0}L`} color={(stats.wr || 0) >= 50 ? C.green : C.red} rightElement={<MiniDonut wins={stats.wins || 0} losses={stats.losses || 0} />} />
          <KpiCard label="Profit factor" value={fmtN(stats.pf || 0, 2)} color={(stats.pf || 0) >= 1 ? C.green : C.red} />
          <KpiCard label="Avg RR" value={`${fmtN(stats.avgRR || 0, 2)}R`} color={(stats.avgRR || 0) > 0 ? C.green : C.red} />
          <KpiCard label="Mejor trade" value={fmt(Math.round(stats.maxWin || 0))} color={C.green} />
          <KpiCard label="Peor trade" value={fmt(Math.round(stats.maxLoss || 0))} color={C.red} />
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Media Win</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.green, marginBottom: 8 }}>{fmt(stats.avgWin || 0)}</div>
              
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Media Lose</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.red, marginBottom: 6 }}>{fmt(-(stats.avgLoss || 0))}</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", borderTop: "0.5px solid var(--color-border-secondary)", paddingTop: 4, marginTop: 4 }}>
              Ratio: {stats.avgLoss > 0 ? fmtN((stats.avgWin || 0) / stats.avgLoss, 2) : "N/A"}
            </div>
          </div>
          <KpiCard label="Duración media" value={formatDuration(stats.avgDuration)} sub={stats.avgDuration !== null && stats.avgDuration !== undefined ? `W: ${formatDuration(stats.avgWinDuration)} / L: ${formatDuration(stats.avgLossDuration)}` : "Sin datos de tiempo"} color="var(--color-text-primary)" />
          <KpiCard label="Comisiones" value={fmt(Math.round(stats.commissions || 0))} color={C.red} sub={`${stats.days || 0} días`} />
          <KpiCard label="Trades" value={stats.n || 0} color="var(--color-text-primary)" />
        </div>
      </Module>
    );
    if (mod.id === "accounts") {
      const activeCount = accountsList.filter(a => (a.status || "ACTIVE").toUpperCase() === "ACTIVE").length;
      const burnedCount = accountsList.filter(a => (a.status || "ACTIVE").toUpperCase() === "BURNED").length;
      const closedCount = accountsList.filter(a => (a.status || "ACTIVE").toUpperCase() === "CLOSED").length;
      const totalCount = accountsList.length;

      const filteredAccounts = accountsList.filter(a => {
        const status = a.status || "ACTIVE";
        if (accountsPanelFilter === "all") return true;
        return status.toUpperCase() === accountsPanelFilter.toUpperCase();
      });

      return (
        <Module key={mod.id} {...props}>
          {/* Barra de Filtros */}
          <div style={{ 
            display: "flex", 
            gap: 8, 
            marginBottom: 14, 
            flexWrap: "wrap",
            borderBottom: "0.5px solid var(--color-border-secondary)",
            paddingBottom: 12
          }}>
            {[
              { id: "all", label: "Todas", count: totalCount },
              { id: "ACTIVE", label: "Activas", count: activeCount },
              { id: "BURNED", label: "Quemadas 🔥", count: burnedCount },
              { id: "CLOSED", label: "Cerradas 🔒", count: closedCount },
            ].map(f => (
              <button 
                key={f.id} 
                onClick={() => setAccountsPanelFilter(f.id)} 
                style={{ 
                  fontSize: 11, 
                  padding: "6px 12px", 
                  borderRadius: 16, 
                  border: accountsPanelFilter === f.id ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)", 
                  background: accountsPanelFilter === f.id ? C.blueBg : "var(--color-background-primary)", 
                  color: accountsPanelFilter === f.id ? C.blueText : "var(--color-text-secondary)", 
                  cursor: "pointer", 
                  fontWeight: accountsPanelFilter === f.id ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{f.label}</span>
                <span style={{ 
                  fontSize: 9, 
                  padding: "1px 5px", 
                  borderRadius: 8, 
                  background: accountsPanelFilter === f.id ? C.blue : "var(--color-background-secondary)",
                  color: accountsPanelFilter === f.id ? "#fff" : "var(--color-text-secondary)",
                  fontWeight: 600
                }}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Lista de cuentas en fila vertical */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredAccounts.length === 0 ? (
              <div style={{ 
                padding: "24px 16px", 
                textAlign: "center", 
                color: "var(--color-text-tertiary)", 
                fontSize: 12,
                background: "var(--color-background-secondary)",
                borderRadius: 8,
                border: "0.5px dashed var(--color-border-secondary)"
              }}>
                No hay cuentas en esta categoría.
              </div>
            ) : (
              filteredAccounts.map(a => (
                <AccountCard key={a.id} account={a.name} rules={a} trades={trades.filter(t => t.account === a.name && t.instrument !== "Ajuste de Broker")} />
              ))
            )}
          </div>
        </Module>
      );
    }
    if (mod.id === "equity") return (
      <Module key={mod.id} {...props}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {accountsButtons.map(([v, l]) => (
              <button key={v} onClick={() => setAcctFilter(v)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 16, border: acctFilter === v ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)", background: acctFilter === v ? C.blueBg : "var(--color-background-primary)", color: acctFilter === v ? C.blueText : "var(--color-text-secondary)", cursor: "pointer", fontWeight: acctFilter === v ? 500 : 400 }}>{l}</button>
            ))}
          </div>
        </div>
        <EquityChart trades={filtered} accountFilter={acctFilter} accountsList={accountsList} />
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.green, display: "inline-block" }} />Zona positiva</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.red, display: "inline-block" }} />Zona negativa</span>
        </div>
      </Module>
    );
    if (mod.id === "calendar") return (
      <Module key={mod.id} {...props}>
        <CalendarWidget trades={filtered} />
      </Module>
    );
    if (mod.id === "winloss") return (
      <Module key={mod.id} {...props}>
        <DonutChart wins={stats.wins || 0} losses={stats.losses || 0} />
      </Module>
    );
    if (mod.id === "dowchart") return (
      <Module key={mod.id} {...props}>
        <BarChart labels={dowData.labels} values={dowData.values} />
      </Module>
    );
    if (mod.id === "strategies") return (
      <Module key={mod.id} {...props}>
        <BarChart labels={stratData.labels} values={stratData.values} height={140} />
      </Module>
    );
    if (mod.id === "trades") return (
      <Module key={mod.id} {...props}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => { setAddingTrade(true); setEditingTrade(null); }} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.green}`, background: C.greenBg, color: C.greenText, cursor: "pointer", fontWeight: 500 }}>+ Añadir trade</button>
          <label style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            Importar CSV <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
          </label>
          <label style={{
            fontSize: 12,
            padding: "5px 12px",
            borderRadius: 6,
            border: `0.5px solid ${C.blue}`,
            background: C.blueBg,
            color: imageImportLoading ? "var(--color-text-tertiary)" : C.blueText,
            cursor: imageImportLoading ? "not-allowed" : "pointer",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 5,
            opacity: imageImportLoading ? 0.7 : 1,
            transition: "opacity 0.2s",
          }}>
            {imageImportLoading ? (
              <><span style={{ display: "inline-block", animation: "wizard-spin 1s linear infinite" }}>⏳</span> Procesando...</>
            ) : (
              <>📸 Importar Imagen (IA)</>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageImportAI}
              disabled={imageImportLoading}
              style={{ display: "none" }}
            />
          </label>
          {importMsg && (
            <span style={{
              fontSize: 12,
              color: importMsg.startsWith("⚠️") ? C.red : C.green,
              fontWeight: 500,
            }}>
              {importMsg}
            </span>
          )}
        </div>
        {addingTrade && <TradeForm trade={EMPTY_TRADE} onSave={saveTrade} onCancel={() => setAddingTrade(false)} isNew accounts={activeAccountsForForm} />}
        <div className="scroll-fade-container" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", minWidth: 1050 }}>
            <thead>
              <tr>
                {["#", "Fecha", "Hora", "Temp.", "Cuenta", "Dir", "Instr", "Entrada", "Salida", "PnL", "RR", "Estrategia", "Res.", "Captura", ""].map(h => (
                   <th key={h} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)", textAlign: "left", padding: "5px 6px", borderBottom: "0.5px solid var(--color-border-tertiary)", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedTrades.map(t => (
                <tr key={t.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <td style={{ padding: "5px 6px", color: "var(--color-text-secondary)" }}>{t.id}</td>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{t.entry_time || "—"}</td>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{t.timeframe || "—"}</td>
                  <td style={{ padding: "5px 6px", fontSize: 10, whiteSpace: "nowrap" }}>{t.account.split(" ")[0]}</td>
                  <td style={{ padding: "5px 6px", color: t.direction === "Long" ? C.green : C.red, fontWeight: 500 }}>{t.direction}</td>
                  <td style={{ padding: "5px 6px", fontSize: 10 }}>
                    {(t.instrument || "").includes("NQ") ? "NQ" : (t.instrument || "").includes("ES") ? "ES" : t.instrument}
                  </td>
                  <td style={{ padding: "5px 6px" }}>{t.entry}</td>
                  <td style={{ padding: "5px 6px" }}>{t.exit_price}</td>
                  <td style={{ padding: "5px 6px", color: t.pnl > 0 ? C.green : t.pnl < 0 ? C.red : "inherit", fontWeight: 500 }}>{fmt(t.pnl)}</td>
                  <td style={{ padding: "5px 6px" }}>{fmtN(t.rr, 2)}R</td>
                  <td style={{ padding: "5px 6px", fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{t.strategy || "—"}</td>
                  <td style={{ padding: "5px 6px" }}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: t.result === "Win" ? C.greenBg : C.redBg, color: t.result === "Win" ? C.greenText : C.redText }}>{t.result}</span></td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>
                    {t.image ? (
                      <button 
                        onClick={() => setSelectedTradeImage(t.image)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 12, padding: 0 }}
                        title="Ver captura de pantalla"
                      >
                        🖼️
                      </button>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>
                    <button onClick={() => { setEditingTrade(t); setAddingTrade(false); }} style={{ fontSize: 10, padding: "2px 7px", marginRight: 4, border: "0.5px solid var(--color-border-secondary)", borderRadius: 3, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>✏️</button>
                    <button onClick={() => setDeleteConfirm(t.id)} style={{ fontSize: 10, padding: "2px 7px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 3, background: "transparent", cursor: "pointer", color: C.red }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingTrade && (
          <div style={{ marginTop: 12 }}>
            <TradeForm trade={editingTrade} onSave={saveTrade} onCancel={() => setEditingTrade(null)} isNew={false} accounts={allAccountsForForm} />
          </div>
        )}
        {deleteConfirm && (
          <div style={{ padding: "10px 14px", background: C.redBg, borderRadius: 8, marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: C.redText }}>¿Seguro que deseas eliminar el trade #{deleteConfirm}?</span>
            <button onClick={() => deleteTrade(deleteConfirm)} style={{ fontSize: 11, padding: "4px 12px", background: C.red, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Confirmar</button>
            <button onClick={() => setDeleteConfirm(null)} style={{ fontSize: 11, padding: "4px 12px", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancelar</button>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "3px 10px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "transparent", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1 }}>‹</button>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "3px 10px", fontSize: 11, border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "transparent", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.5 : 1 }}>›</button>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 8 }}>{filtered.length} trades total</span>
          </div>
        )}
      </Module>
    );
    return null;
  };




  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem", fontFamily: "var(--font-sans)" }}>
      <h2 className="sr-only">Trading Journal Dashboard — NQ Futures Bulenox</h2>
      <div className="flex flex-col md:flex-row justify-between gap-4 items-center md:items-center mb-5">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <h1 className="flex items-center justify-center md:justify-start gap-1.5" style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
            <span>📈 Trading Journal</span>
            <span style={{ fontSize: 10, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", padding: "2px 6px", borderRadius: 6, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              v3.0 {deployId && `(${deployId})`}
            </span>
            <button
              onClick={async () => {
                setLoading(true);
                await Promise.all([fetchAccounts(), fetchTrades()]);
                setLoading(false);
              }}
              title="Sincronizar con Neon"
              style={{
                background: "transparent",
                border: "none",
                fontSize: 14,
                cursor: "pointer",
                padding: "2px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              🔄
            </button>
          </h1>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>NQ Futures · Bulenox · {trades.length} trades</div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2.5 w-full md:w-auto">
          {/* Botones de control (Dashboard, Ajustes, Editar layout, Login) encima en móvil, a la derecha en desktop */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-center md:justify-end order-1 md:order-2">
            <div style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 8, padding: 3, border: "0.5px solid var(--color-border-secondary)" }}>
              <button
                onClick={() => setCurrentTab("dashboard")}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: currentTab === "dashboard" ? "var(--color-background-primary)" : "transparent",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  fontWeight: currentTab === "dashboard" ? 500 : 400,
                }}
              >
                📊 Dashboard
              </button>
              <button
                onClick={() => setCurrentTab("settings")}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: currentTab === "settings" ? "var(--color-background-primary)" : "transparent",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  fontWeight: currentTab === "settings" ? 500 : 400,
                }}
              >
                ⚙️ Ajustes
              </button>
            </div>
            {currentTab === "dashboard" && (
              <button onClick={() => setEditMode(e => !e)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: editMode ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)", background: editMode ? C.blueBg : "var(--color-background-primary)", color: editMode ? C.blueText : "var(--color-text-secondary)", cursor: "pointer", fontWeight: editMode ? 500 : 400 }}>
                {editMode ? "✓ Guardar layout" : "⚙️ Editar layout"}
              </button>
            )}
            <UserButton />
          </div>

          {/* Selector de cuentas debajo de los botones en móvil, a la izquierda en desktop */}
          {currentTab === "dashboard" && (
            <div className="w-full md:w-auto order-2 md:order-1 flex justify-center">
              <select 
                value={acctFilter} 
                onChange={e => setAcctFilter(e.target.value)} 
                className="w-full md:w-auto max-w-xs"
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}
              >
                <option value="all">Todas las cuentas</option>
                {accountsList.map(a => {
                  let label = a.name;
                  if (a.status === "CLOSED") label += " (Cerrada)";
                  else if (a.status === "BURNED") label += " (Quemada 🔥)";
                  return <option key={a.name} value={a.name}>{label}</option>;
                })}
              </select>
            </div>
          )}
        </div>
      </div>
      
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12 }}>
          Cargando trades de Neon...
        </div>
      ) : (
        <>
          {currentTab === "settings" ? (
            <SettingsPanel
              accountsList={accountsList}
              fetchAccounts={fetchAccounts}
              fetchTrades={fetchTrades}
              theme={theme}
              onChangeTheme={onChangeTheme}
              aiProvider={aiProvider}
              setAiProvider={setAiProvider}
              aiKey={aiKey}
              setAiKey={setAiKey}
              trades={trades}
            />
          ) : (
            <>
              {editMode && (
                <div style={{ background: C.blueBg, border: `0.5px solid #B5D4F4`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: C.blueText }}>
                  Modo edición activo — reordena módulos con ↑↓ y actívalos o desactívalos
                </div>
              )}
              {orderedModules.map((mod, idx) => renderModule(mod, idx))}
            </>
          )}
        </>
      )}
      
      {selectedTradeImage && (
        <div 
          onClick={() => setSelectedTradeImage(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(8px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            cursor: "zoom-out",
            padding: 20,
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: 12,
              overflow: "hidden",
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <img 
              src={selectedTradeImage} 
              alt="Captura de pantalla de la operativa" 
              style={{ maxWidth: "100%", maxHeight: "calc(90vh - 40px)", objectFit: "contain" }} 
            />
            <button 
              onClick={() => setSelectedTradeImage(null)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(0, 0, 0, 0.5)",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 28,
                height: 28,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(8px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          padding: 20,
        }}>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes wizard-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .wizard-spinner {
              display: inline-block;
              animation: wizard-spin 1s linear infinite;
            }
          `}} />
          <div style={{
            width: "100%",
            maxWidth: wizardStep === 2 ? 850 : 600,
            maxHeight: "90vh",
            overflowY: "auto",
            background: "var(--color-background-primary)",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            transition: "max-width 0.2s ease",
          }}>
            {wizardStep === 1 ? (
              // STEP 1: Configurar Cuentas Faltantes
              <>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
                    🏦 Configurar Cuentas Faltantes
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6, marginBottom: 0 }}>
                    El archivo CSV contiene trades asociados a cuentas que no existen en tu base de datos.
                    Por favor, define los parámetros para crearlas automáticamente antes de importar.
                  </p>
                </div>

                {wizardError && (
                  <div style={{ padding: "10px 14px", background: C.redBg, color: C.redText, borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                    ⚠️ {wizardError}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", paddingRight: 4 }}>
                  {pendingImport.missingAccounts.map((acct, index) => {
                    const isLink = acct.action === "link";
                    return (
                      <div key={acct.name} style={{
                        padding: 14,
                        background: "var(--color-background-secondary)",
                        border: "0.5px solid var(--color-border-secondary)",
                        borderRadius: 10,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                            🏦 Cuenta en CSV: <code style={{ background: "rgba(128,128,128,0.1)", padding: "2px 6px", borderRadius: 4, fontStyle: "normal" }}>{acct.name}</code>
                          </span>
                          
                          {/* Segment control */}
                          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "0.5px solid var(--color-border-tertiary)" }}>
                            <button
                              type="button"
                              onClick={() => handleFieldChange(index, "action", "create")}
                              style={{
                                fontSize: 10,
                                padding: "4px 10px",
                                border: "none",
                                cursor: "pointer",
                                fontWeight: 600,
                                background: acct.action === "create" ? C.blue : "transparent",
                                color: acct.action === "create" ? "#fff" : "var(--color-text-secondary)",
                              }}
                            >
                              Crear Nueva
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFieldChange(index, "action", "link")}
                              style={{
                                fontSize: 10,
                                padding: "4px 10px",
                                border: "none",
                                cursor: "pointer",
                                fontWeight: 600,
                                background: acct.action === "link" ? C.blue : "transparent",
                                color: acct.action === "link" ? "#fff" : "var(--color-text-secondary)",
                              }}
                            >
                              Vincular Existente
                            </button>
                          </div>
                        </div>
                        
                        {!isLink ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label style={{ display: "block", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4, fontWeight: 500 }}>IMPORTE (SIZE)</label>
                              <input 
                                type="number" 
                                value={acct.size} 
                                onChange={(e) => handleFieldChange(index, "size", parseFloat(e.target.value) || 0)}
                                disabled={wizardStatus.startsWith("creando") || wizardStatus.startsWith("importando") || wizardStatus === "cargando_cuentas"}
                                style={{ width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4, fontWeight: 500 }}>OBJETIVO (TARGET)</label>
                              <input 
                                type="number" 
                                value={acct.target} 
                                onChange={(e) => handleFieldChange(index, "target", parseFloat(e.target.value) || 0)}
                                disabled={wizardStatus.startsWith("creando") || wizardStatus.startsWith("importando") || wizardStatus === "cargando_cuentas"}
                                style={{ width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4, fontWeight: 500 }}>LÍMITE DIARIO (DAILY LIMIT)</label>
                              <input 
                                type="number" 
                                value={acct.daily_limit} 
                                onChange={(e) => handleFieldChange(index, "daily_limit", parseFloat(e.target.value) || 0)}
                                disabled={wizardStatus.startsWith("creando") || wizardStatus.startsWith("importando") || wizardStatus === "cargando_cuentas"}
                                style={{ width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4, fontWeight: 500 }}>LÍMITE DRAWDOWN (DD LIMIT)</label>
                              <input 
                                type="number" 
                                value={acct.dd_limit} 
                                onChange={(e) => handleFieldChange(index, "dd_limit", parseFloat(e.target.value) || 0)}
                                disabled={wizardStatus.startsWith("creando") || wizardStatus.startsWith("importando") || wizardStatus === "cargando_cuentas"}
                                style={{ width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label style={{ display: "block", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 6, fontWeight: 500 }}>SELECCIONAR CUENTA EXISTENTE A VINCULAR</label>
                            <select
                              value={acct.linkTo || ""}
                              onChange={(e) => handleFieldChange(index, "linkTo", e.target.value)}
                              disabled={wizardStatus.startsWith("creando") || wizardStatus.startsWith("importando") || wizardStatus === "cargando_cuentas"}
                              style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}
                            >
                              <option value="">Seleccionar cuenta...</option>
                              {accountsList.map(a => (
                                <option key={a.id} value={a.name}>{a.name} ({a.status})</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              // STEP 2: Validar Trades
              <>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
                    ⚙️ Validar Trades a Importar
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6, marginBottom: 0 }}>
                    Revisa los trades del archivo CSV. Si se detectó un posible duplicado con un trade existente, estará desmarcado (No Importar) por defecto.
                  </p>
                </div>

                {wizardError && (
                  <div style={{ padding: "10px 14px", background: C.redBg, color: C.redText, borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                    ⚠️ {wizardError}
                  </div>
                )}

                {/* Acciones Masivas */}
                <div style={{
                  padding: 12,
                  background: "var(--color-background-secondary)",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: 10,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Estrategia:</span>
                      <input
                        type="text"
                        placeholder="Ej: ATM 200"
                        value={bulkStrategy}
                        onChange={(e) => setBulkStrategy(e.target.value)}
                        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: 110 }}
                      />
                      <button
                        onClick={applyBulkStrategy}
                        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none", background: C.blue, color: "#fff", cursor: "pointer" }}
                      >
                        Aplicar
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Cuenta:</span>
                      <select
                        value={bulkAccount}
                        onChange={(e) => setBulkAccount(e.target.value)}
                        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: 110 }}
                      >
                        <option value="">Seleccionar...</option>
                        {allAccountsForForm.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={applyBulkAccount}
                        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none", background: C.blue, color: "#fff", cursor: "pointer" }}
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => selectAllTrades(false)}
                      style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}
                    >
                      Marcar todos (Importar)
                    </button>
                    <button
                      onClick={() => selectAllTrades(true)}
                      style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>

                {/* Lista de Trades */}
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  maxHeight: "50vh",
                  overflowY: "auto",
                  paddingRight: 6,
                }}>
                  {pendingImport.trades.map((trade, index) => (
                    <div key={index} style={{
                      padding: 12,
                      background: "var(--color-background-secondary)",
                      border: trade.isDuplicate ? "1px solid #d97706" : "0.5px solid var(--color-border-secondary)",
                      borderRadius: 10,
                      opacity: trade.isExcluded ? 0.65 : 1,
                      transition: "opacity 0.2s ease, border-color 0.2s ease",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                          Trade #{index + 1} {trade.instrument && `- ${trade.instrument}`} {trade.direction && `(${trade.direction})`}
                        </span>
                        
                        {/* Selector Importar / No importar */}
                        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "0.5px solid var(--color-border-tertiary)" }}>
                          <button
                            type="button"
                            onClick={() => handleTradeFieldChange(index, "isExcluded", false)}
                            style={{
                              fontSize: 10,
                              padding: "4px 10px",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 600,
                              background: !trade.isExcluded ? C.green : "transparent",
                              color: !trade.isExcluded ? "#fff" : "var(--color-text-secondary)",
                            }}
                          >
                            Importar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTradeFieldChange(index, "isExcluded", true)}
                            style={{
                              fontSize: 10,
                              padding: "4px 10px",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 600,
                              background: trade.isExcluded ? (theme === "dark" ? "rgba(255,255,255,0.1)" : "#e5e7eb") : "transparent",
                              color: trade.isExcluded ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                            }}
                          >
                            No Importar
                          </button>
                        </div>
                      </div>

                      {/* Advertencia de duplicado */}
                      {trade.isDuplicate && (
                        <div style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: theme === "dark" ? "rgba(239, 159, 39, 0.12)" : "#FEF3C7",
                          color: theme === "dark" ? "#FBBF24" : "#92400E",
                          border: theme === "dark" ? "1px solid rgba(239, 159, 39, 0.25)" : "1px solid #FDE68A",
                          fontSize: 11,
                          fontWeight: 500,
                        }}>
                          ⚠️ <strong>Posible duplicado ({trade.duplicatePct}%):</strong> coincide con trade #{trade.duplicateOf?.id} ({trade.duplicateOf?.date} {trade.duplicateOf?.entry_time} | {trade.duplicateOf?.account} | PnL: {trade.duplicateOf?.pnl})
                        </div>
                      )}

                      {/* Inputs de edición */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                        gap: 10,
                      }}>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Fecha</label>
                          <input
                            type="date"
                            value={trade.date}
                            onChange={(e) => handleTradeFieldChange(index, "date", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Hora Ent.</label>
                          <input
                            type="text"
                            value={trade.entry_time}
                            onChange={(e) => handleTradeFieldChange(index, "entry_time", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Hora Sal.</label>
                          <input
                            type="text"
                            value={trade.exit_time}
                            onChange={(e) => handleTradeFieldChange(index, "exit_time", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Cuenta</label>
                          <select
                            value={trade.account}
                            onChange={(e) => handleTradeFieldChange(index, "account", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          >
                            {allAccountsForForm.map(a => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Contratos (Qty)</label>
                          <input
                            type="number"
                            value={trade.qty}
                            onChange={(e) => handleTradeFieldChange(index, "qty", parseInt(e.target.value) || 1)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Precio Ent.</label>
                          <input
                            type="number"
                            step="any"
                            value={trade.entry}
                            onChange={(e) => handleTradeFieldChange(index, "entry", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Precio Sal.</label>
                          <input
                            type="number"
                            step="any"
                            value={trade.exit_price}
                            onChange={(e) => handleTradeFieldChange(index, "exit_price", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Net PnL</label>
                          <input
                            type="number"
                            step="any"
                            value={trade.pnl}
                            onChange={(e) => handleTradeFieldChange(index, "pnl", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Estrategia</label>
                          <input
                            type="text"
                            value={trade.strategy}
                            onChange={(e) => handleTradeFieldChange(index, "strategy", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Notas</label>
                          <input
                            type="text"
                            value={trade.notes}
                            onChange={(e) => handleTradeFieldChange(index, "notes", e.target.value)}
                            disabled={wizardStatus !== "" && wizardStatus !== "error"}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Footer Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, alignItems: "center", borderTop: "0.5px solid var(--color-border-secondary)", paddingTop: 16 }}>
              {wizardStatus && (
                <div style={{ flex: 1, fontSize: 12, color: C.blue, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="wizard-spinner">🔄</span>
                  {wizardStatus === "creando_cuentas" && "Creando cuentas..."}
                  {wizardStatus === "cargando_cuentas" && "Actualizando panel..."}
                  {wizardStatus.startsWith("importando_trades_progress") && (
                    `Importando: ${wizardStatus.split(":")[1] || ""} de ${wizardStatus.split(":")[2] || ""} trades...`
                  )}
                  {wizardStatus === "importando_trades" && "Importando trades..."}
                </div>
              )}
              
              <button 
                onClick={() => { setPendingImport(null); setWizardStatus(""); setWizardError(""); }}
                disabled={wizardStatus !== "" && wizardStatus !== "error"}
                style={{
                  fontSize: 12,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "transparent",
                  color: "var(--color-text-secondary)",
                  cursor: (wizardStatus !== "" && wizardStatus !== "error") ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleWizardSubmit}
                disabled={wizardStatus !== "" && wizardStatus !== "error" || (wizardStep === 2 && pendingImport.trades.filter(t => !t.isExcluded).length === 0) || (wizardStep === 1 && pendingImport.missingAccounts.some(acct => acct.action === "link" && !acct.linkTo))}
                style={{
                  fontSize: 12,
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: C.green,
                  color: "#fff",
                  cursor: (wizardStatus !== "" && wizardStatus !== "error" || (wizardStep === 2 && pendingImport.trades.filter(t => !t.isExcluded).length === 0) || (wizardStep === 1 && pendingImport.missingAccounts.some(acct => acct.action === "link" && !acct.linkTo))) ? "not-allowed" : "pointer",
                  opacity: (wizardStep === 2 && pendingImport.trades.filter(t => !t.isExcluded).length === 0) || (wizardStep === 1 && pendingImport.missingAccounts.some(acct => acct.action === "link" && !acct.linkTo)) ? 0.6 : 1,
                  fontWeight: 500,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                {wizardStep === 1 
                  ? "Confirmar y Continuar" 
                  : `Importar ${pendingImport.trades.filter(t => !t.isExcluded).length} Trades`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

