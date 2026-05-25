"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { UserButton } from "@clerk/nextjs";

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
  return { n, wins: wins.length, losses: losses.length, totalPnl, wr, avgWin, avgLoss, pf, avgRR, commissions, maxWin, maxLoss, days };
}

function calcAccountDD(trades) {
  const sorted = [...trades].sort((a, b) => a.id - b.id);
  let cum = 0, peak = 0, maxDD = 0;
  sorted.forEach(t => {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  });
  return { netPnl: cum, peak, maxDD: -maxDD, ddRemaining: 0 };
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
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.redBg} strokeWidth={stroke} />
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
  const activeRules = rules || { size: 50000, target: 3000, dd_limit: 2500, daily_limit: 1100, status: "ACTIVE" };
  const isClosed = activeRules.status === "CLOSED";
  const isBurned = activeRules.status === "BURNED";

  const { netPnl, maxDD, peak } = calcAccountDD(trades);
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
      padding: 14,
      opacity: isClosed || isBurned ? 0.75 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
            {account.split(" ")[0]}
            {isClosed && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 4, background: "var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 500 }}>Cerrada</span>}
            {isBurned && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 4, background: C.redBg, color: C.redText, fontWeight: 500 }}>Quemada 🔥</span>}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>${(activeRules.size / 1000).toFixed(0)}K · obj ${ activeRules.target.toLocaleString()}</div>
        </div>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: netPnl >= 0 ? C.greenBg : C.redBg, color: netPnl >= 0 ? C.greenText : C.redText, fontWeight: 500 }}>
          {fmt(netPnl)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[["Pico", `+$${Math.round(peak).toLocaleString()}`, C.green], ["Max DD", `-$${Math.round(ddUsed).toLocaleString()}`, C.red], ["Trades", `${trades.length} (${uniqueDays} d)`, "var(--color-text-primary)"], ["DD libre", `$${Math.round(ddRemaining).toLocaleString()}`, ddRemaining < 300 ? C.red : C.green]].map(([l, v, c]) => (
          <div key={l}>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px" }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 3 }}>
          <span>Objetivo</span><span>{fmt(netPnl)} / ${activeRules.target.toLocaleString()} · {fmtN(targetPct, 0)}%</span>
        </div>
        <Bar pct={targetPct} color={C.green} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 3 }}>
          <span>Drawdown usado</span><span>${Math.round(ddUsed).toLocaleString()} / ${activeRules.dd_limit.toLocaleString()} · {fmtN(ddPct, 1)}%</span>
        </div>
        <Bar pct={ddPct} color={ddColor} />
      </div>
      {/* Rithmic section */}
      {(activeRules.balance !== undefined && activeRules.balance !== null) && (
        <div style={{ 
          marginBottom: 8, 
          padding: "8px 10px", 
          borderRadius: 8, 
          background: "rgba(128,128,128,0.05)", 
          border: "0.5px solid var(--color-border-tertiary)" 
        }}>
          <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6, fontWeight: 600 }}>
            Datos Reales (Rithmic)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 8px" }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Saldo Rithmic</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-primary)" }}>
                ${activeRules.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Umbral Liq.</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.red }}>
                ${activeRules.threshold ? activeRules.threshold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Días Operados</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-primary)" }}>
                {activeRules.activeDays ?? "N/A"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Actualizado</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                {activeRules.updateDate || "N/A"}
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, padding: "4px 8px", borderRadius: 4, background: alertColor.bg, color: alertColor.text }}>{alertMsg}</div>
    </div>
  );
}


// ── Equity SVG ──────────────────────────────────────────────────────────────
function EquityChart({ trades, accountFilter }) {
  const filtered = accountFilter === "all" ? trades : trades.filter(t => t.account === accountFilter);
  const sorted = [...filtered].sort((a, b) => a.id - b.id);
  let cum = 0;
  const pts = sorted.map(t => { cum += t.pnl; return cum; });
  if (pts.length < 2) return <div style={{ padding: 20, color: "var(--color-text-secondary)", fontSize: 13 }}>Sin datos suficientes</div>;
  const W = 620, H = 160, PAD = 40;
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} role="img" aria-label="Equity curve acumulada">
      {ticks.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line x1={PAD} y1={y} x2={W - 10} y2={y} stroke={Math.abs(v) < range * 0.01 ? "rgba(128,128,128,0.4)" : "rgba(128,128,128,0.08)"} strokeWidth={Math.abs(v) < range * 0.01 ? 1 : 0.5} />
            <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={9} fill={C.gray}>{v >= 0 ? "+" : ""}{Math.round(v / 1000) !== 0 ? Math.round(v / 1000) + "k" : "0"}</text>
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
    </svg>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function CalendarWidget({ trades }) {
  const [currentMonth, setCurrentMonth] = useState("2026-05");
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (trades && trades.length > 0 && !hasInitialized) {
      const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted[0]?.date) {
        setCurrentMonth(sorted[0].date.slice(0, 7));
        setHasInitialized(true);
      }
    }
  }, [trades, hasInitialized]);

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

  const byDate = {};
  trades.filter(t => t.date.startsWith(currentMonth)).forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = { pnl: 0, count: 0 };
    byDate[t.date].pnl += t.pnl;
    byDate[t.date].count++;
  });

  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const startDow = (new Date(year, mo, 1).getDay() + 6) % 7;

  const fmtPnl = (v) => {
    const abs = Math.abs(Math.round(v));
    return abs >= 1000
      ? (v < 0 ? "-" : "+") + "$" + (abs / 1000).toFixed(1) + "k"
      : (v < 0 ? "-" : "+") + "$" + abs;
  };

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ type: "empty" });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentMonth}-${String(d).padStart(2, "0")}`;
    const dow = (new Date(year, mo, d).getDay() + 6) % 7;
    cells.push({ type: "day", d, key, dow, info: byDate[key] });
  }
  while (cells.length % 7 !== 0) cells.push({ type: "empty" });

  const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {dayLabels.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 500, color: i === 6 ? "#BA7517" : "var(--color-text-tertiary)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((c, i) => {
          if (c.type === "empty") return <div key={`e${i}`} />;

          if (c.dow === 6) {
            const weekStart = i - 5;
            let weekPnl = 0, weekTrades = 0, weekDays = 0;
            for (let j = Math.max(0, weekStart); j < i; j++) {
              const wc = cells[j];
              if (wc?.type === "day" && wc.info) {
                weekPnl += wc.info.pnl;
                weekTrades += wc.info.count;
                weekDays++;
              }
            }
            const hasData = weekTrades > 0;
            const bg = hasData ? (weekPnl >= 0 ? "#EAF3DE" : "#FAECE7") : "var(--color-background-secondary)";
            const border = hasData ? (weekPnl >= 0 ? "#C0DD97" : "#F5C4B3") : "var(--color-border-tertiary)";
            const col = weekPnl >= 0 ? "#3B6D11" : "#993C1D";
            return (
              <div key={`w${i}`} style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 5, padding: "4px 3px", minHeight: 50 }}>
                <div style={{ fontSize: 9, color: "#854F0B", textTransform: "uppercase", letterSpacing: ".2px", fontWeight: 500 }}>Semana</div>
                {hasData ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 500, color: col }}>{fmtPnl(weekPnl)}</div>
                    <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{weekTrades}t · {weekDays}d</div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>—</div>
                )}
              </div>
            );
          }

          const { info } = c;
          const bg = info ? (info.pnl > 0 ? C.greenBg : info.pnl < 0 ? C.redBg : "var(--color-background-secondary)") : "var(--color-background-secondary)";
          const col = info ? (info.pnl > 0 ? C.greenText : info.pnl < 0 ? C.redText : "var(--color-text-secondary)") : "var(--color-text-tertiary)";
          const border = info ? (info.pnl > 0 ? "#9FE1CB" : info.pnl < 0 ? "#F5C4B3" : "var(--color-border-tertiary)") : "var(--color-border-tertiary)";
          return (
            <div key={`d${c.d}`} style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 5, padding: "4px 3px", minHeight: 50 }}>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 500 }}>{c.d}</div>
              {info && <div style={{ fontSize: 11, fontWeight: 500, color: col }}>{fmtPnl(info.pnl)}</div>}
              {info && <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{info.count}t</div>}
            </div>
          );
        })}
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
  const barW = Math.floor(560 / labels.length) - 4;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, paddingBottom: 24, minWidth: labels.length * (barW + 4) }}>
        {labels.map((l, i) => {
          const v = values[i];
          const h = Math.abs(v) / max * (height - 24);
          const color = v >= 0 ? C.green : C.red;
          return (
            <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {v >= 0 && <div style={{ width: barW, height: h, background: color, borderRadius: "3px 3px 0 0", opacity: 0.8 }} title={`${l}: ${fmt(v)}`} />}
              {v < 0 && <div style={{ width: barW, height: Math.abs(v) / max * (height - 24), background: color, borderRadius: "0 0 3px 3px", opacity: 0.8, marginTop: "auto" }} title={`${l}: ${fmt(v)}`} />}
              <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", textAlign: "center", width: barW, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trade Form ───────────────────────────────────────────────────────────────
function TradeForm({ trade, onSave, onCancel, isNew, accounts = [] }) {
  const [form, setForm] = useState({ ...EMPTY_TRADE, ...trade });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  const F = ({ label, field, type = "text", opts }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</label>
      {opts ? (
        <select value={form[field]} onChange={e => set(field, e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
          {opts.map(o => {
            const val = typeof o === "object" ? o.value : o;
            const lbl = typeof o === "object" ? o.label : o;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
      ) : (
        <input type={type} value={form[field]} onChange={e => set(field, type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
      )}
    </div>
  );

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 10 }}>
        <F label="Fecha" field="date" type="date" />
        <F label="Cuenta" field="account" opts={accounts} />
        <F label="Instrumento" field="instrument" opts={["NQ Futures", "ES Futures", "MNQ Micro"]} />
        <F label="Dirección" field="direction" opts={["Long", "Short"]} />
        <F label="Resultado" field="result" opts={["Win", "Loss", "Break Even"]} />
        <F label="Cantidad" field="qty" type="number" />
        <F label="Precio entrada" field="entry" type="number" />
        <F label="Precio salida" field="exit_price" type="number" />
        <F label="Estrategia" field="strategy" />
        <F label="Net PnL ($)" field="pnl" type="number" />
        <F label="Comisión ($)" field="commission" type="number" />
        <F label="R múltiple" field="rr" type="number" />
        <F label="MAE" field="mae" type="number" />
        <F label="MFE" field="mfe" type="number" />
        <F label="ETD" field="etd" type="number" />
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
        <button onClick={() => onSave(form)} style={{ padding: "6px 16px", background: C.green, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Guardar</button>
        <button onClick={onCancel} style={{ padding: "6px 16px", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Module wrapper ───────────────────────────────────────────────────────────
function Module({ id, label, icon, visible, onToggle, onMoveUp, onMoveDown, canUp, canDown, children, editMode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: collapsed ? "none" : "0.5px solid var(--color-border-tertiary)", cursor: "pointer", userSelect: "none" }}
        onClick={() => !editMode && setCollapsed(c => !c)}>
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
}) {
  const [newAcct, setNewAcct] = useState({ name: "", size: 50000, target: 3000, dd_limit: 2500, daily_limit: 1100, balance: "", threshold: "", updateDate: "", activeDays: "" });
  const [editingAcctId, setEditingAcctId] = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [acctError, setAcctError] = useState("");
  const [saveKeySuccess, setSaveKeySuccess] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);

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
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editAcct),
      });
      if (res.ok) {
        setEditingAcctId(null);
        setEditAcct(null);
        setAcctError("");
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
              <option value="gemini">Gemini (1.5 Flash - Recomendado)</option>
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
              onClick={() => {
                localStorage.setItem("tj_ai_provider", aiProvider);
                localStorage.setItem("tj_ai_key", aiKey);
                setSaveKeySuccess(true);
                setTimeout(() => setSaveKeySuccess(false), 3000);
              }}
              style={{ padding: "6px 14px", background: C.green, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}
            >
              Guardar Credenciales
            </button>
            {saveKeySuccess && <span style={{ fontSize: 11, color: C.green }}>✓ Credenciales guardadas en local</span>}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            Las claves se guardan solo en tu navegador (localStorage) y nunca viajan a bases de datos de terceros.
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, width: "100%" }}>
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
                  <input type="number" value={editAcct.balance !== undefined && editAcct.balance !== null ? editAcct.balance : ""} onChange={e => setEditAcct({...editAcct, balance: e.target.value === "" ? null : parseFloat(e.target.value)})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Saldo Broker" />
                  <input type="number" value={editAcct.threshold !== undefined && editAcct.threshold !== null ? editAcct.threshold : ""} onChange={e => setEditAcct({...editAcct, threshold: e.target.value === "" ? null : parseFloat(e.target.value)})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Umbral Liq." />
                  <input type="text" value={editAcct.updateDate !== undefined && editAcct.updateDate !== null ? editAcct.updateDate : ""} onChange={e => setEditAcct({...editAcct, updateDate: e.target.value === "" ? null : e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Fecha Act. (MM/DD/AA)" />
                  <input type="number" value={editAcct.activeDays !== undefined && editAcct.activeDays !== null ? editAcct.activeDays : ""} onChange={e => setEditAcct({...editAcct, activeDays: e.target.value === "" ? null : parseInt(e.target.value)})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Días Operados" />
                  <div style={{ display: "flex", gap: 4, gridColumn: "span 2" }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: "span 2" }}>
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
  const [editingTrade, setEditingTrade] = useState(null);
  const [addingTrade, setAddingTrade] = useState(false);
  const [page, setPage] = useState(1);
  const [importMsg, setImportMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [theme, setTheme] = useState("light");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiKey, setAiKey] = useState("");
  const [selectedTradeImage, setSelectedTradeImage] = useState(null);

  const PER_PAGE = 20;

  // Load clientside options on mount
  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem("tj_layout");
      if (savedLayout) setLayout(JSON.parse(savedLayout));
    } catch {}
    try {
      const savedVisibility = localStorage.getItem("tj_visibility");
      if (savedVisibility) {
        setVisibility(JSON.parse(savedVisibility));
      } else {
        setVisibility(Object.fromEntries(ALL_MODULES.map(m => [m.id, true])));
      }
    } catch {
      setVisibility(Object.fromEntries(ALL_MODULES.map(m => [m.id, true])));
    }
    
    // Read and initialize Theme
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

    // Read AI configurations
    try {
      const savedProvider = localStorage.getItem("tj_ai_provider");
      const savedKey = localStorage.getItem("tj_ai_key");
      if (savedProvider) setAiProvider(savedProvider);
      if (savedKey) setAiKey(savedKey);
    } catch {}



    fetchAccounts();
    fetchTrades();
  }, []);

  // Sync layout and visibility changes to localStorage
  useEffect(() => {
    try { localStorage.setItem("tj_layout", JSON.stringify(layout)); } catch {}
  }, [layout]);

  useEffect(() => {
    try { localStorage.setItem("tj_visibility", JSON.stringify(visibility)); } catch {}
  }, [visibility]);

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

  const saveTrade = async (t) => {
    try {
      if (addingTrade) {
        const res = await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        if (res.ok) {
          const newTrade = await res.json();
          setTrades(prev => [...prev, newTrade]);
          setAddingTrade(false);
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
          const updatedTrade = await res.json();
          setTrades(prev => prev.map(x => x.id === t.id ? updatedTrade : x));
          setEditingTrade(null);
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
        setTrades(prev => prev.filter(t => t.id !== id));
        setDeleteConfirm(null);
      } else {
        alert('Error al eliminar el trade de la base de datos');
      }
    } catch (err) {
      console.error("Error eliminando trade:", err);
      alert('Error de conexión con el servidor');
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
        const newTradesData = lines.slice(1).map((line) => {
          const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
          return {
            date: obj.date || obj.Date || new Date().toISOString().slice(0, 10),
            account: obj.account || obj.Account || "BX101840-05 (50K)",
            instrument: obj.instrument || obj.Instrument || "NQ Futures",
            direction: obj.direction || obj.Direction || "Long",
            qty: parseInt(obj.qty || obj.Qty || 1),
            entry: parseFloat(obj.entry || obj.Entry || 0),
            exit_price: parseFloat(obj.exit_price || obj.Exit || 0),
            gross: parseFloat(obj.gross || obj.Gross || 0),
            commission: parseFloat(obj.commission || obj.Commission || -4),
            pnl: parseFloat(obj.pnl || obj.PnL || obj["Net Profit"] || 0),
            mae: parseFloat(obj.mae || obj.MAE || 0),
            mfe: parseFloat(obj.mfe || obj.MFE || 0),
            etd: parseFloat(obj.etd || obj.ETD || 0),
            rr: parseFloat(obj.rr || obj.RR || obj["R Multiple"] || 0),
            result: obj.result || obj.Result || obj["Win/Loss"] || "Win",
            strategy: obj.strategy || obj.Strategy || "",
            timeframe: obj.timeframe || "15s",
            notes: obj.notes || "",
            entry_time: obj.entry_time || "",
            exit_time: obj.exit_time || "",
          };
        }).filter(t => !isNaN(t.pnl));

        setImportMsg("Importando...");
        let importedCount = 0;
        const savedTrades = [];
        
        for (const t of newTradesData) {
          const res = await fetch('/api/trades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          if (res.ok) {
            const saved = await res.json();
            savedTrades.push(saved);
            importedCount++;
          }
        }
        
        if (importedCount > 0) {
          setTrades(prev => [...prev, ...savedTrades]);
          setImportMsg(`✓ ${importedCount} trades importados`);
        } else {
          setImportMsg("No se pudieron importar trades");
        }
        setTimeout(() => setImportMsg(""), 3000);
      } catch (err) {
        console.error(err);
        setImportMsg("Error al importar CSV");
        setTimeout(() => setImportMsg(""), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = useMemo(() => acctFilter === "all" ? trades : trades.filter(t => t.account === acctFilter), [trades, acctFilter]);
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

  const equitySpark = useMemo(() => {
    let cum = 0;
    return [...filtered].sort((a, b) => a.id - b.id).map(t => { cum += t.pnl; return cum; });
  }, [filtered]);

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
      key: mod.id, id: mod.id, label: mod.label, icon: mod.icon,
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
      <Module {...props}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
          <KpiCard label="Net P&L" value={fmt(Math.round(stats.totalPnl || 0))} color={stats.totalPnl >= 0 ? C.green : C.red} spark={equitySpark} />
          <KpiCard label="Win rate" value={`${fmtN(stats.wr || 0, 1)}%`} sub={`${stats.wins || 0}W / ${stats.losses || 0}L`} color={(stats.wr || 0) >= 50 ? C.green : C.red} rightElement={<MiniDonut wins={stats.wins || 0} losses={stats.losses || 0} />} />
          <KpiCard label="Profit factor" value={fmtN(stats.pf || 0, 2)} color={(stats.pf || 0) >= 1 ? C.green : C.red} />
          <KpiCard label="Avg RR" value={`${fmtN(stats.avgRR || 0, 2)}R`} color={(stats.avgRR || 0) > 0 ? C.green : C.red} />
          <KpiCard label="Mejor trade" value={fmt(Math.round(stats.maxWin || 0))} color={C.green} />
          <KpiCard label="Peor trade" value={fmt(Math.round(stats.maxLoss || 0))} color={C.red} />
          <KpiCard label="Comisiones" value={fmt(Math.round(stats.commissions || 0))} color={C.red} sub={`${stats.days || 0} días`} />
          <KpiCard label="Trades" value={stats.n || 0} color="var(--color-text-primary)" />
        </div>
      </Module>
    );
    if (mod.id === "accounts") return (
      <Module {...props}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {accountsList.map(a => (
            <AccountCard key={a.id} account={a.name} rules={a} trades={trades.filter(t => t.account === a.name)} />
          ))}
        </div>
      </Module>
    );
    if (mod.id === "equity") return (
      <Module {...props}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {accountsButtons.map(([v, l]) => (
              <button key={v} onClick={() => setAcctFilter(v)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 16, border: acctFilter === v ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)", background: acctFilter === v ? C.blueBg : "var(--color-background-primary)", color: acctFilter === v ? C.blueText : "var(--color-text-secondary)", cursor: "pointer", fontWeight: acctFilter === v ? 500 : 400 }}>{l}</button>
            ))}
          </div>
        </div>
        <EquityChart trades={trades} accountFilter={acctFilter} />
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.green, display: "inline-block" }} />Zona positiva</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.red, display: "inline-block" }} />Zona negativa</span>
        </div>
      </Module>
    );
    if (mod.id === "calendar") return (
      <Module {...props}>
        <CalendarWidget trades={filtered} />
      </Module>
    );
    if (mod.id === "winloss") return (
      <Module {...props}>
        <DonutChart wins={stats.wins || 0} losses={stats.losses || 0} />
      </Module>
    );
    if (mod.id === "dowchart") return (
      <Module {...props}>
        <BarChart labels={dowData.labels} values={dowData.values} />
      </Module>
    );
    if (mod.id === "strategies") return (
      <Module {...props}>
        <BarChart labels={stratData.labels} values={stratData.values} height={140} />
      </Module>
    );
    if (mod.id === "trades") return (
      <Module {...props}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => { setAddingTrade(true); setEditingTrade(null); }} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.green}`, background: C.greenBg, color: C.greenText, cursor: "pointer", fontWeight: 500 }}>+ Añadir trade</button>
          <label style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            Importar CSV <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
          </label>
          {importMsg && <span style={{ fontSize: 12, color: C.green }}>{importMsg}</span>}
        </div>
        {addingTrade && <TradeForm trade={EMPTY_TRADE} onSave={saveTrade} onCancel={() => setAddingTrade(false)} isNew accounts={activeAccountsForForm} />}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", minWidth: 950 }}>
            <thead>
              <tr>
                {["#", "Fecha", "Cuenta", "Dir", "Instr", "Entrada", "Salida", "PnL", "RR", "Estrategia", "Res.", "Captura", ""].map(h => (
                   <th key={h} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)", textAlign: "left", padding: "5px 6px", borderBottom: "0.5px solid var(--color-border-tertiary)", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedTrades.map(t => (
                <tr key={t.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <td style={{ padding: "5px 6px", color: "var(--color-text-secondary)" }}>{t.id}</td>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{t.date.slice(5)}</td>
                  <td style={{ padding: "5px 6px", fontSize: 10, whiteSpace: "nowrap" }}>{t.account.split(" ")[0]}</td>
                  <td style={{ padding: "5px 6px", color: t.direction === "Long" ? C.green : C.red, fontWeight: 500 }}>{t.direction}</td>
                  <td style={{ padding: "5px 6px", fontSize: 10 }}>{t.instrument === "NQ Futures" ? "NQ" : "ES"}</td>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span>📈 Trading Journal</span>
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentTab === "dashboard" && (
            <select value={acctFilter} onChange={e => setAcctFilter(e.target.value)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}>
              <option value="all">Todas las cuentas</option>
              {accountsList.map(a => {
                let label = a.name;
                if (a.status === "CLOSED") label += " (Cerrada)";
                else if (a.status === "BURNED") label += " (Quemada 🔥)";
                return <option key={a.name} value={a.name}>{label}</option>;
              })}
            </select>
          )}
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
    </div>
  );
}

