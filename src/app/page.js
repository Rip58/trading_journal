"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import { UserButton } from "@clerk/nextjs";
import { normalizeDateToYYYYMMDD, parseLocaleFloat } from "@/lib/dateUtils";

// ── Helper: serialize/deserialize account filter Set ──────────────────────────
function serializeAcctFilter(set) {
  return set.size === 0 ? "all" : JSON.stringify([...set]);
}
function deserializeAcctFilter(raw) {
  if (!raw || raw === "all") return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed);
  } catch {}
  // Legacy: single account name string
  if (typeof raw === "string" && raw !== "all") return new Set([raw]);
  return new Set();
}

// ── Option A: Multi-Chip Drawer ───────────────────────────────────────────────
function AccountFilterA({ accountsList, selectedAccounts, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Set(selectedAccounts));
  const ref = useRef(null);

  // Sync draft when external selection changes
  useEffect(() => { setDraft(new Set(selectedAccounts)); }, [selectedAccounts]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const groups = useMemo(() => [
    { label: "Activas Examen 📝", status: "ACTIVE_EXAMEN", accounts: accountsList.filter(a => (a.status === "ACTIVE" || !a.status) && a.type === "EXAMEN") },
    { label: "Activas Reales 💼", status: "ACTIVE_REAL", accounts: accountsList.filter(a => (a.status === "ACTIVE" || !a.status) && a.type === "REAL") },
    { label: "Cerradas 🔒", status: "CLOSED", accounts: accountsList.filter(a => isClosedAcct(a)) },
  ].filter(g => g.accounts.length > 0), [accountsList]);

  const toggleDraft = (name) => {
    const next = new Set(draft);
    if (next.has(name)) next.delete(name); else next.add(name);
    setDraft(next);
  };

  const toggleGroup = (accounts) => {
    const names = accounts.map(a => a.name);
    const allIn = names.every(n => draft.has(n));
    const next = new Set(draft);
    if (allIn) { names.forEach(n => next.delete(n)); } else { names.forEach(n => next.add(n)); }
    setDraft(next);
  };

  const apply = () => { onChange(draft); setOpen(false); };
  const reset = () => { const empty = new Set(); setDraft(empty); onChange(empty); setOpen(false); };

  const activeCount = selectedAccounts.size;
  const label = activeCount === 0 ? "Todas las cuentas" : `${activeCount} cuenta${activeCount > 1 ? "s" : ""} seleccionada${activeCount > 1 ? "s" : ""}`;

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 50 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, padding: "5px 10px", borderRadius: 8,
          border: activeCount > 0 ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)",
          background: activeCount > 0 ? C.blueBg : "var(--color-background-primary)",
          color: activeCount > 0 ? C.blueText : "var(--color-text-secondary)",
          cursor: "pointer", fontWeight: activeCount > 0 ? 500 : 400,
          whiteSpace: "nowrap",
        }}
      >
        <span>🏷️ {label}</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Drawer panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          minWidth: 260, maxWidth: 320,
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 12, padding: "12px 14px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>

          {groups.map(g => (
            <div key={g.status} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".4px" }}>{g.label}</span>
                <button
                  onClick={() => toggleGroup(g.accounts)}
                  style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}
                >
                  {g.accounts.every(a => draft.has(a.name)) ? "Quitar todas" : "Todas"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {g.accounts.map(a => {
                  const sel = draft.has(a.name);
                  return (
                    <button
                      key={a.name}
                      onClick={() => toggleDraft(a.name)}
                      style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 6,
                        border: sel ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)",
                        background: sel ? C.blueBg : "var(--color-background-secondary)",
                        color: sel ? C.blueText : "var(--color-text-secondary)",
                        cursor: "pointer", fontWeight: sel ? 600 : 400,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {a.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: "0.5px solid var(--color-border-secondary)", paddingTop: 10 }}>
            <button onClick={reset} style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              Restablecer
            </button>
            <button onClick={apply} style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: `0.5px solid ${C.blue}`, background: C.blue, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              ✓ Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



// ACCOUNT_RULES is loaded dynamically from database now

// ── Sunday Reminder Popup ─────────────────────────────────────────────────────
function SundayReminder() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const today = new Date();
    if (today.getDay() !== 0) return; // 0 = Sunday
    const key = `tj_sunday_dismissed_${today.toISOString().slice(0, 10)}`;
    if (!localStorage.getItem(key)) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    const key = `tj_sunday_dismissed_${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(key, "1");
    setVisible(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-secondary)",
        borderRadius: 16,
        padding: "28px 28px 24px",
        maxWidth: 380, width: "100%",
        boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
          Recordatorio de Domingo
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
          Es domingo — recuerda actualizar los <strong>importes de cada cuenta</strong> con los saldos reales del broker antes de empezar la semana. Una vez actualizados, usa <strong>"Sincronizar Base"</strong> en cada cuenta para que el seguimiento empiece desde cero el lunes.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={dismiss}
            style={{
              flex: 1, padding: "9px 16px", borderRadius: 8, fontSize: 13,
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-secondary)", cursor: "pointer",
            }}
          >
            Ya lo hice
          </button>
          <button
            onClick={dismiss}
            style={{
              flex: 1, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `0.5px solid ${C.blue}`,
              background: C.blue, color: "#fff", cursor: "pointer",
            }}
          >
            ✓ Entendido
          </button>
        </div>
      </div>
    </div>
  );
}




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

// Los acentos van por variable CSS para poder recolorearlos por contexto
// (p. ej. la hoja de ajustes dentro del dashboard V2, que va en oscuro).
// Los valores por defecto están en globals.css y son los de siempre.
const C = {
  green: "var(--c-green)", red: "var(--c-red)", blue: "var(--c-blue)",
  amber: "var(--c-amber)", gray: "var(--c-gray)",
  greenBg: "var(--c-green-bg)", redBg: "var(--c-red-bg)", blueBg: "var(--c-blue-bg)",
  greenText: "var(--c-green-text)", redText: "var(--c-red-text)", blueText: "var(--c-blue-text)",
};

// Una cuenta solo está activa o cerrada: quemada y cerrada acaban en lo mismo,
// la cuenta ya no opera. Se guarda CLOSED, pero los registros antiguos con
// BURNED se siguen leyendo como cerradas para no tener que migrar nada.
const normStatus = (s) => (s === "BURNED" ? "CLOSED" : (s || "ACTIVE"));
const isClosedAcct = (a) => normStatus(a?.status) === "CLOSED";

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

// Umbral de autoliquidación operación a operación de una cuenta.
// El umbral vive en los "Resumen diario" (t.threshold): manda el último registro
// de cada día y se arrastra hasta que llega otro. Antes del primer registro se usa
// el umbral de la ficha de cuenta; si el primer día registrado trae uno más bajo
// se toma ese, porque el trailing DD nunca baja.
function buildThresholdSeries(acc, sortedTrades, originalStartSize) {
  const byDate = new Map();
  sortedTrades.forEach(t => {
    if (t.threshold === null || t.threshold === undefined || isNaN(t.threshold)) return;
    byDate.set(normalizeDateToYYYYMMDD(t.date), Number(t.threshold));
  });

  const acctThreshold = (acc.threshold !== null && acc.threshold !== undefined && !isNaN(acc.threshold))
    ? Number(acc.threshold)
    : (acc.dd_limit !== null && acc.dd_limit !== undefined && !isNaN(acc.dd_limit)
      ? originalStartSize - Number(acc.dd_limit)
      : null);

  const firstRecorded = byDate.size ? byDate.values().next().value : null;
  let current = acctThreshold === null
    ? firstRecorded
    : (firstRecorded === null ? acctThreshold : Math.min(acctThreshold, firstRecorded));

  return sortedTrades.map(t => {
    const d = normalizeDateToYYYYMMDD(t.date);
    if (byDate.has(d)) current = byDate.get(d);
    return current;
  });
}

// Reconstruye cuenta por cuenta el balance tras cada operación, anclado al saldo
// sincronizado con el bróker, y el umbral de liquidación vigente en cada punto.
// Base común de la curva de equity y de la línea de liquidación.
function buildAccountHistories(trades, accountsList) {
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

    // El resumen diario trae el balance de cierre del bróker: esa es la fuente
    // buena, la misma que lee la tarjeta Balance. Reconstruir sumando PnL daba
    // otra cifra en cuanto un día descuadraba, había un ajuste de bróker o
    // faltaba un registro, y las dos tarjetas se contradecían.
    // Los días sin balance registrado (datos antiguos) siguen por PnL desde el
    // último punto conocido, y la base es la misma que usa la tarjeta Balance.
    const tieneBalance = (t) => t.balance !== null && t.balance !== undefined && !isNaN(t.balance);

    if (n > 0 && sorted.some(tieneBalance)) {
      const base = (acc.startSize !== null && acc.startSize !== undefined && !isNaN(acc.startSize))
        ? Number(acc.startSize)
        : startSize;
      let currentBal = base;
      for (let i = 0; i < n; i++) {
        currentBal = tieneBalance(sorted[i]) ? Number(sorted[i].balance) : currentBal + sorted[i].pnl;
        balances[i] = currentBal;
      }
      originalStartSize = base;
    } else if (syncTime && n > 0) {
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
      thresholds: buildThresholdSeries(acc, sorted, originalStartSize),
    };
  });

  return accountHistories;
}

function calcReconstructedPnlHistory(trades, filter, accountsList) {
  if (!trades || trades.length === 0) return [];

  const accountHistories = buildAccountHistories(trades, accountsList);

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

// Umbral de liquidación en la MISMA escala que calcReconstructedPnlHistory: la
// curva verde es balance - saldo inicial, así que el umbral se dibuja como
// umbral - saldo inicial (normalmente negativo, por debajo de la verde).
// Devuelve un array alineado índice a índice con el de la curva de equity, con
// null en los puntos sin umbral conocido, o [] si no hay ninguno.
function calcLiquidationHistory(trades, filter, accountsList) {
  if (!trades || trades.length === 0) return [];

  const accountHistories = buildAccountHistories(trades, accountsList);

  if (filter !== "all") {
    const hist = accountHistories[filter];
    if (!hist) return [];
    const series = hist.thresholds.map(v => (v === null || v === undefined ? null : v - hist.originalStartSize));
    return series.some(v => v !== null) ? series : [];
  }

  // Con todas las cuentas se suman los umbrales relativos de cada una, igual que
  // se suman sus PnL. Las cuentas sin umbral conocido quedan fuera de la suma.
  const sortedAllTrades = [...trades].sort((a, b) => {
    const dateDiff = normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date));
    if (dateDiff !== 0) return dateDiff;
    const timeA = parseTimeToSeconds(a.entry_time) || 0;
    const timeB = parseTimeToSeconds(b.entry_time) || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  const offsets = {};
  accountsList.forEach(acc => {
    const hist = accountHistories[acc.name];
    if (!hist || hist.sortedTrades.length === 0) return;
    const first = hist.thresholds[0];
    if (first === null || first === undefined) return;
    offsets[acc.name] = first - hist.originalStartSize;
  });
  if (Object.keys(offsets).length === 0) return [];

  const tradeIndexCounters = {};
  accountsList.forEach(acc => { tradeIndexCounters[acc.name] = 0; });

  const portfolioThresholds = [];
  sortedAllTrades.forEach(t => {
    const accName = t.account;
    const hist = accountHistories[accName];
    if (hist && hist.sortedTrades.length > 0) {
      const idx = tradeIndexCounters[accName];
      if (idx < hist.thresholds.length) {
        const v = hist.thresholds[idx];
        if (v !== null && v !== undefined && offsets[accName] !== undefined) {
          offsets[accName] = v - hist.originalStartSize;
        }
        tradeIndexCounters[accName] = idx + 1;
      }
    }
    let total = 0;
    Object.keys(offsets).forEach(name => { total += offsets[name]; });
    portfolioThresholds.push(total);
  });

  return portfolioThresholds;
}


const EMPTY_TRADE = { date: new Date().toISOString().slice(0, 10), entry_time: "", exit_time: "", account: "", instrument: "NQ", direction: "", qty: 1, entry: 0, exit_price: 0, gross: 0, commission: 4, pnl: 0, mae: 0, mfe: 0, etd: 0, rr: 0, result: "Win", strategy: "Resumen diario", timeframe: "Diario", notes: "", image: "", balance: "", threshold: "" };

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
  // El id se sanea: el color puede ser un var(--…) y los paréntesis romperían url(#…)
  const gid = `sg${String(color).replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={`M${pts.join("L")}L${w},${h}L0,${h}Z`} fill={`url(#${gid})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
      {min < 0 && max > 0 && <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="rgba(128,128,128,0.3)" strokeWidth="0.5" strokeDasharray="3,3" />}
    </svg>
  );
}

// ── Formato compacto de dinero ($25.1K) ─────────────────────────────────────
const fmtK = (v) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
};

// ── Sparkline de cuenta (balance diario + líneas de referencia) ─────────────
// Dibuja la evolución del balance diario con una línea discontinua roja en el
// umbral de autoliquidación y otra verde en la reserva safety (o el objetivo).
function AccountSparkline({ series, threshold, safety, objective, height = 72 }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) setWidth(containerRef.current.offsetWidth || 560);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const hasSafety = safety !== null && safety !== undefined && !isNaN(safety);
  const hasThreshold = threshold !== null && threshold !== undefined && !isNaN(threshold);
  const upperRef = hasSafety ? safety : (objective !== null && objective !== undefined && !isNaN(objective) ? objective : null);

  if (!series || series.length < 2) {
    return (
      <div ref={containerRef} style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--color-text-tertiary)" }}>
        Sin datos de balance diario suficientes
      </div>
    );
  }

  const values = series.map(p => p.balance);
  const firstV = values[0];
  const lastV = values[values.length - 1];
  const lineColor = lastV >= firstV ? C.green : C.red;

  // El eje Y abarca desde min(umbral, mínimo balance) hasta max(safety/objetivo, máximo balance)
  const candidatesMin = [...values];
  const candidatesMax = [...values];
  if (hasThreshold) candidatesMin.push(threshold);
  if (upperRef !== null) candidatesMax.push(upperRef);
  let minY = Math.min(...candidatesMin);
  let maxY = Math.max(...candidatesMax);
  const pad = (maxY - minY || 1) * 0.12;
  minY -= pad;
  maxY += pad;

  const labelW = 52;                       // espacio reservado para las etiquetas
  const plotW = Math.max(width - labelW, 40);
  const topPad = 6, botPad = 6;
  const plotH = height - topPad - botPad;
  const yOf = (v) => topPad + (1 - (v - minY) / (maxY - minY)) * plotH;
  const xOf = (i) => (i / (series.length - 1)) * plotW;

  const pts = series.map((p, i) => `${xOf(i).toFixed(2)},${yOf(p.balance).toFixed(2)}`);
  const gradId = `acctspark${lineColor.replace("#", "")}`;

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Área + línea de balance */}
        <path d={`M${pts.join("L")}L${plotW},${height - botPad}L0,${height - botPad}Z`} fill={`url(#${gradId})`} />
        <polyline points={pts.join(" ")} fill="none" stroke={lineColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

        {/* Umbral de autoliquidación */}
        {hasThreshold && (
          <>
            <line x1="0" y1={yOf(threshold)} x2={plotW} y2={yOf(threshold)} stroke={C.red} strokeWidth="1" strokeDasharray="4,3" opacity="0.75" />
            <text x={plotW + 6} y={yOf(threshold) + 3} fontSize="9" fill={C.red} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtK(threshold)}</text>
          </>
        )}

        {/* Reserva safety (o nivel objetivo si no hay safety) */}
        {upperRef !== null && (
          <>
            <line x1="0" y1={yOf(upperRef)} x2={plotW} y2={yOf(upperRef)} stroke={C.green} strokeWidth="1" strokeDasharray="4,3" opacity="0.75" />
            <text x={plotW + 6} y={yOf(upperRef) + 3} fontSize="9" fill={C.green} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtK(upperRef)}</text>
          </>
        )}

        {/* Último punto */}
        <circle cx={xOf(series.length - 1)} cy={yOf(lastV)} r="2.5" fill={lineColor} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--color-text-tertiary)", marginTop: 4, paddingRight: labelW }}>
        <span>{series[0].date}</span>
        <span>{series[series.length - 1].date}</span>
      </div>
    </div>
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
function KpiCard({ label, value, sub, color, spark, rightElement, arrows }) {
  return (
    <div className="kpi-tile" style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "15px 16px", display: "flex", flexDirection: "column", minHeight: 96 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {rightElement && <span style={{ flexShrink: 0 }}>{rightElement}</span>}
      </div>
      {arrows ? (
        // Navegación de periodo: flecha a cada lado con el valor centrado
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <PeriodArrowBtn dir="prev" enabled={arrows.canPrev} onClick={arrows.onPrev} />
          <div style={{ flex: 1, textAlign: "center", fontSize: 28, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: color || "var(--color-text-primary)" }}>{value}</div>
          <PeriodArrowBtn dir="next" enabled={arrows.canNext} onClick={arrows.onNext} />
        </div>
      ) : (
        <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: color || "var(--color-text-primary)" }}>{value}</div>
      )}
      {sub && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 6, fontVariantNumeric: "tabular-nums", textAlign: arrows ? "center" : undefined }}>{sub}</div>}
      {spark && <div style={{ marginTop: "auto", paddingTop: 10 }}><Sparkline data={spark} color={color || C.blue} height={26} /></div>}
    </div>
  );
}

// ── Fases del plan de trading (Sopi Plus) ────────────────────────────────────
// El "colchón" es el margen desde el saldo hasta el umbral de liquidación.
// Se calcula con el cierre del último día operado, nunca intradía.
const PHASES = [
  { n: 1, name: "Supervivencia", min: 0, max: 500, contracts: 1, sl: 84, tp: 100, color: "red" },
  { n: 2, name: "Reconstrucción", min: 500, max: 1000, contracts: 2, sl: 167, tp: 200, color: "amber" },
  { n: 3, name: "Normal", min: 1000, max: Infinity, contracts: 3, sl: 250, tp: 300, color: "green" },
];

function getPhase(cushion) {
  if (cushion === null || cushion === undefined || isNaN(cushion)) return null;
  return PHASES.find(p => cushion >= p.min && cushion < p.max) || PHASES[0];
}

// Colchón de una cuenta a partir del cierre del último día operado.
// Única fuente de verdad: la usan la ficha de cuenta y la verificación de fases.
function computeCushion(account, accountTrades, fallbackBalance) {
  // Ordenar por la fecha normalizada, como el resto de la app: con el string
  // crudo, una fecha guardada en otro formato se colaba fuera de sitio y podía
  // dar como "último día" uno que no lo era.
  const lastDay = [...accountTrades]
    .sort((a, b) => normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date)))
    .filter(t => t.balance !== null && t.balance !== undefined && !isNaN(t.balance))
    .pop();
  const balance = lastDay ? Number(lastDay.balance) : (account.balance ?? fallbackBalance);
  const threshold = (lastDay && lastDay.threshold !== null && lastDay.threshold !== undefined && !isNaN(lastDay.threshold))
    ? Number(lastDay.threshold)
    : account.threshold;
  const cushion = threshold ? balance - threshold : null;
  return { balance, threshold, cushion, basis: lastDay?.date || null };
}

// ── Catálogo de planes de propfirm ───────────────────────────────────────────
// Specs oficiales (bulenox.com/help, support.lucidtrading.com). El umbral es el
// INICIAL: a partir del primer día operado manda el que traiga el registro diario.
// safetyReserve = saldo mínimo que debe quedar para poder retirar.
const PROPFIRM_PLANS = {
  Bulenox: [
    { id: "bx-t-25", label: "25K · Opción 1 (Trailing DD)", size: 25000, target: 1500, dd_limit: 1500, threshold: 23500, safetyReserve: 26600, maxContracts: 3, consistency: "40%" },
    { id: "bx-t-50", label: "50K · Opción 1 (Trailing DD)", size: 50000, target: 3000, dd_limit: 2500, threshold: 47500, safetyReserve: 52600, maxContracts: 7, consistency: "40%" },
    { id: "bx-e-25", label: "25K · Opción 2 (EOD + límite diario)", size: 25000, target: 1500, dd_limit: 1500, threshold: 23500, safetyReserve: 26600, maxContracts: 3, consistency: "40%", daily_limit: 500 },
    { id: "bx-e-50", label: "50K · Opción 2 (EOD + límite diario)", size: 50000, target: 3000, dd_limit: 2500, threshold: 47500, safetyReserve: 52600, maxContracts: 7, consistency: "40%", daily_limit: 1100 },
  ],
  Lucid: [
    { id: "lp-25", label: "25K · LucidPro", size: 25000, target: 1250, dd_limit: 1000, threshold: 24000, safetyReserve: 26100, maxContracts: 2, consistency: "40%" },
    { id: "lp-50", label: "50K · LucidPro", size: 50000, target: 3000, dd_limit: 2000, threshold: 48000, safetyReserve: 52100, maxContracts: 4, consistency: "40%", daily_limit: 1200 },
  ],
};

// ── Flecha de periodo para KPIs navegables (una a cada lado del valor) ──────
function PeriodArrowBtn({ dir, enabled, onClick }) {
  return (
    <button
      aria-label={dir === "prev" ? "Mes anterior" : "Mes siguiente"}
      disabled={!enabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        lineHeight: 1,
        background: "none",
        border: "none",
        borderRadius: 8,
        cursor: enabled ? "pointer" : "default",
        color: "var(--color-text-tertiary)",
        opacity: enabled ? 1 : 0.25,
        padding: 0,
      }}
      onMouseEnter={(e) => { if (enabled) { e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.background = "var(--color-background-primary)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-tertiary)"; e.currentTarget.style.background = "none"; }}
    >{dir === "prev" ? "‹" : "›"}</button>
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
  const isClosed = isClosedAcct(activeRules);

  const { netPnl, maxDD, peak, finalBalance } = calcAccountDD(trades, activeRules);
  // sessionPnl = total gain since account creation = finalBalance - original starting balance.
  // Uses startSize (never changes) as baseline. Falls back to size if not set.
  // After weekend sync: shows e.g. +$682 (50682 - 50000). Grows with each trade.
  const originBase = activeRules.startSize ?? activeRules.size;
  const sessionPnl = Math.round(finalBalance) - originBase;
  const uniqueDays = [...new Set(trades.map(t => t.date))].length;
  const ddUsed = Math.abs(maxDD);
  const ddPct = (ddUsed / activeRules.dd_limit) * 100;
  const normalBorderColor = ddPct >= 80 ? "#F5C4B3" : ddPct >= 50 ? "#FAC775" : "#9FE1CB";
  const borderColor = isClosed ? "var(--color-border-secondary)" : isBurned ? C.red : normalBorderColor;
  
  // ── Datos de la ficha minimalista (misma para REAL y EXAMEN) ──────────────
  // Serie de balances diarios: trades ordenados por fecha con campo `balance`
  const balanceSeries = [...trades]
    .filter(t => t.balance !== null && t.balance !== undefined && !isNaN(t.balance))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(t => ({ date: t.date, balance: Number(t.balance) }));

  // El día operado más reciente manda: balance y umbral se toman de ahí y solo
  // se cae al valor guardado en la cuenta cuando todavía no hay trades.
  const cushionInfo = computeCushion(activeRules, trades, finalBalance);
  const currentValue = cushionInfo.balance;
  const liveThreshold = cushionInfo.threshold;
  const baseSize = activeRules.startSize ?? activeRules.size;
  const safety = activeRules.safetyReserve;
  const hasSafety = safety !== null && safety !== undefined && !isNaN(safety);
  // Superado el safety se puede retirar
  const canWithdraw = hasSafety && currentValue >= safety;
  // Nivel superior de referencia del gráfico: safety en REAL, objetivo en EXAMEN
  const objectiveLevel = hasSafety ? null : (baseSize + (activeRules.target || 0));

  // Margen restante desde el valor actual hasta el umbral de liquidación (DD)
  const ddDistance = cushionInfo.cushion;

  // Fase del plan según el colchón, con el cierre del último día registrado.
  // Ese cierre es la base de la PRÓXIMA sesión: el plan prohíbe recalcular intradía.
  const phase = getPhase(ddDistance);
  const phaseColor = phase ? C[phase.color] : "var(--color-text-tertiary)";
  const phaseBg = phase ? (phase.color === "amber" ? "#FDF3E2" : C[phase.color + "Bg"]) : "var(--color-background-secondary)";
  const phaseText = phase ? (phase.color === "amber" ? "#8A5A0B" : C[phase.color + "Text"]) : "var(--color-text-secondary)";
  const phaseBasis = cushionInfo.basis;

  const fichaItems = [
    { key: "valor", label: "Valor", value: `$${Math.round(currentValue).toLocaleString()}`, color: currentValue >= baseSize ? C.green : C.red },
    { key: "margenDd", label: "Margen a DD", value: ddDistance !== null ? `$${Math.round(ddDistance).toLocaleString()}` : "—", color: ddDistance === null ? undefined : ddDistance <= 400 ? C.red : ddDistance <= 800 ? C.amber : C.green },
    { key: "umbral", label: "Umbral DD", value: liveThreshold ? `$${Math.round(liveThreshold).toLocaleString()}` : "—", color: C.red },
    hasSafety
      ? { key: "safety", label: "Safety", value: `$${Math.round(safety).toLocaleString()}`, color: C.green, badge: canWithdraw ? "Retiros ✓" : null }
      : { key: "objetivo", label: "Objetivo", value: `$${Math.round(objectiveLevel).toLocaleString()}` },
    { key: "dias", label: "Días de trade", value: `${uniqueDays || activeRules.activeDays || 0}` },
  ];

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
                background: sessionPnl >= 0 ? C.greenBg : C.redBg,
                border: `0.5px solid ${sessionPnl >= 0 ? "#9FE1CB" : "#F5C4B3"}`,
                color: sessionPnl >= 0 ? C.greenText : C.redText,
              }}>
                ${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
              {activeRules.type === "REAL" && !isClosed && !isBurned && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: C.greenBg, color: C.greenText, fontWeight: 600 }}>Real 💼</span>}
              {activeRules.type !== "REAL" && !isClosed && !isBurned && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: C.blueBg, color: C.blueText, fontWeight: 600 }}>Examen 📝</span>}
              {activeRules.propfirm && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 500 }}>{activeRules.propfirm}</span>}
              {phase && !isClosed && !isBurned && (
                <span title={`Fase ${phase.n} · ${phase.name} — colchón $${Math.round(ddDistance).toLocaleString()}`} style={{ fontSize: 9, padding: "1.5px 6px", borderRadius: 4, background: phaseBg, color: phaseText, fontWeight: 700, letterSpacing: ".2px" }}>
                  FASE {phase.n} · {phase.contracts} MNQ
                </span>
              )}
              {isClosed && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 500 }}>Cerrada 🔒</span>}
            </div>
          </div>
          
          {/* Badge de P&L en Mobile (visible solo en móviles) */}
          <div className="sm:hidden">
            <span style={{ 
              fontSize: 11, 
              padding: "4px 10px", 
              borderRadius: 8, 
              background: sessionPnl >= 0 ? C.greenBg : C.redBg, 
              color: sessionPnl >= 0 ? C.greenText : C.redText, 
              fontWeight: 600,
              display: "inline-block",
            }}>
              {fmt(sessionPnl)}
            </span>
          </div>
        </div>

        {/* Badge de P&L en Desktop (oculto en móviles) */}
        <div className="hidden sm:block sm:text-right">
          <span style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 8,
            background: sessionPnl >= 0 ? C.greenBg : C.redBg,
            color: sessionPnl >= 0 ? C.greenText : C.redText,
            fontWeight: 600,
            display: "inline-block",
          }}>
            {fmt(sessionPnl)}
          </span>
        </div>
      </div>

      {/* FICHA DE CUENTA (contenido desplegado) */}
      {expanded && (
        <div style={{
          padding: "16px 20px",
          borderTop: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-background-primary)",
        }}>
          {/* Fila compacta de datos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 10, marginBottom: 14 }}>
            {fichaItems.map(({ key, label, value, color, badge }) => (
              <div key={key} style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums", color: color || "var(--color-text-primary)", whiteSpace: "nowrap" }}>
                  {value}
                </div>
                {badge && (
                  <div style={{ marginTop: 5, display: "inline-block", fontSize: 9, fontWeight: 600, padding: "1.5px 6px", borderRadius: 4, background: C.greenBg, color: C.greenText }}>
                    {badge}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Medidor de fase del plan de trading */}
          {phase && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px" }}>
                  Fase del plan
                </div>
                <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>
                  Colchón <strong style={{ color: phaseColor, fontVariantNumeric: "tabular-nums" }}>${Math.round(ddDistance).toLocaleString()}</strong>
                  {phaseBasis && ` · cierre ${phaseBasis}`}
                </div>
              </div>

              {/* Barra segmentada: un tramo por fase, el activo resaltado */}
              <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                {PHASES.map(p => {
                  const active = p.n === phase.n;
                  const col = C[p.color];
                  return (
                    <div key={p.n} style={{ flex: p.n === 3 ? 1.4 : 1 }}>
                      <div style={{ height: 6, borderRadius: 3, background: active ? col : "var(--color-border-tertiary)", opacity: active ? 1 : 0.45 }} />
                      <div style={{ fontSize: 8.5, marginTop: 4, color: active ? col : "var(--color-text-tertiary)", fontWeight: active ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        F{p.n} {p.n === 1 ? "<$500" : p.n === 2 ? "$500-999" : "≥$1.000"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reglas de la fase activa: lo que hay que aplicar hoy */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 8, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: phaseBg, color: phaseText }}>
                  FASE {phase.n} · {phase.name.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {phase.contracts} MNQ
                </span>
                <span style={{ fontSize: 11, color: C.red, fontVariantNumeric: "tabular-nums" }}>SL ${phase.sl}</span>
                <span style={{ fontSize: 11, color: C.green, fontVariantNumeric: "tabular-nums" }}>TP ${phase.tp}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>1 trade/día</span>
              </div>
            </div>
          )}

          {/* Evolución del balance diario */}
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>
              Evolución del balance
            </div>
            <AccountSparkline
              series={balanceSeries}
              threshold={liveThreshold}
              safety={activeRules.safetyReserve}
              objective={objectiveLevel}
            />
          </div>
        </div>
      )}
    </div>
  );
}


// ── Equity SVG ──────────────────────────────────────────────────────────────
function EquityChart({ trades, accountFilter, accountsList }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.getBoundingClientRect().width;
        if (w > 0) setWidth(w);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    window.addEventListener("resize", updateWidth);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateWidth); };
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
  const H = 210;
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
    <div ref={containerRef} style={{ width: "100%", minHeight: H }}>
      {width > 0 && (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, cursor: "crosshair", overflow: "visible", display: "block" }}
        role="img"
        aria-label="Equity curve acumulada"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseLeave}
      >
        <defs>
          <linearGradient id="eqAreaGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.green} stopOpacity="0.26" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="eqAreaRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.red} stopOpacity="0.03" />
            <stop offset="100%" stopColor={C.red} stopOpacity="0.26" />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={PAD} y1={y} x2={W - 10} y2={y} stroke={Math.abs(v) < range * 0.01 ? "rgba(128,128,128,0.4)" : "rgba(128,128,128,0.08)"} strokeWidth={Math.abs(v) < range * 0.01 ? 1 : 0.5} />
              <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={9} fill={C.gray}>{formatTick(v)}</text>
            </g>
          );
        })}
        <polygon points={areaGreenPts} fill="url(#eqAreaGreen)" />
        <polygon points={areaRedPts} fill="url(#eqAreaRed)" />
        {pts.map((v, i) => {
          if (i === 0) return null;
          const avg = (pts[i - 1] + v) / 2;
          return <line key={i} x1={toX(i - 1)} y1={toY(pts[i - 1])} x2={toX(i)} y2={toY(v)} stroke={avg >= 0 ? C.green : C.red} strokeWidth={2} strokeLinecap="round" />;
        })}
        <line x1={PAD} y1={zeroY} x2={W - 10} y2={zeroY} stroke="rgba(128,128,128,0.5)" strokeWidth={1} />
        <circle
          cx={toX(pts.length - 1)}
          cy={toY(pts[pts.length - 1])}
          r={3.5}
          fill={pts[pts.length - 1] >= 0 ? C.green : C.red}
          stroke="var(--color-background-primary)"
          strokeWidth={1.5}
          pointerEvents="none"
        />

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
      )}
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

  // Estadísticas globales (desde el primer trade) y por mes, en una sola pasada.
  // Se agrega primero por día para que los "días" cuenten fechas únicas.
  const calStats = useMemo(() => {
    const dayMap = new Map(); // "YYYY-MM-DD" -> { pnl, comm }
    trades.forEach(t => {
      const d = normalizeDateToYYYYMMDD(t.date);
      if (!dayMap.has(d)) dayMap.set(d, { pnl: 0, comm: 0 });
      const day = dayMap.get(d);
      day.pnl += t.pnl || 0;
      day.comm += Math.abs(t.commission || 0);
    });

    const byMonth = new Map(); // "YYYY-MM" -> stats
    const global = { pnl: 0, win: 0, lose: 0, comm: 0, winDays: 0, loseDays: 0, days: 0, first: null, last: null };
    [...dayMap.entries()].forEach(([d, day]) => {
      const ym = d.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, { pnl: 0, win: 0, lose: 0, comm: 0, winDays: 0, loseDays: 0, days: 0 });
      const m = byMonth.get(ym);
      m.pnl += day.pnl; global.pnl += day.pnl;
      m.comm += day.comm; global.comm += day.comm;
      m.days++; global.days++;
      if (day.pnl > 0) { m.win += day.pnl; global.win += day.pnl; m.winDays++; global.winDays++; }
      else if (day.pnl < 0) { m.lose += day.pnl; global.lose += day.pnl; m.loseDays++; global.loseDays++; }
      if (!global.first || d < global.first) global.first = d;
      if (!global.last || d > global.last) global.last = d;
    });

    // Meses ordenados descendente (más reciente primero)
    const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const years = new Set(months.map(([ym]) => ym.slice(0, 4)));
    return { global, months, multiYear: years.size > 1 };
  }, [trades]);

  const monthStats = calStats.months.find(([ym]) => ym === currentMonth)?.[1]
    || { pnl: 0, win: 0, lose: 0 };

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
        <div style={{ minWidth: 440 }}>
          <div className="cal-grid" style={{ marginBottom: 4 }}>
            {dayLabels.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 500, color: d === "D" ? "#BA7517" : d === "SEMANA" ? "#854F0B" : "var(--color-text-tertiary)", padding: "2px 0" }}>{d}</div>
            ))}
          </div>
          <div className="cal-grid">
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

      {/* Resumen del mes visualizado */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 6 }}>
          Resumen del mes
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[
            { label: "PnL del Mes", value: monthStats.pnl, bg: monthStats.pnl >= 0 ? C.greenBg : C.redBg, border: monthStats.pnl >= 0 ? "#9FE1CB" : "#F5C4B3", col: monthStats.pnl >= 0 ? C.greenText : C.redText },
            { label: "Ganado", value: monthStats.win, bg: C.greenBg, border: "#9FE1CB", col: C.greenText },
            { label: "Perdido", value: monthStats.lose, bg: C.redBg, border: "#F5C4B3", col: C.redText },
          ].map(card => (
            <div key={card.label} style={{ background: card.bg, border: `0.5px solid ${card.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 9, color: card.col, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: card.col, fontVariantNumeric: "tabular-nums" }}>
                {fmt(card.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Global: histórico completo desde el primer trade */}
      {calStats.global.days > 0 && (
        <div style={{ marginTop: 14, background: "var(--color-background-secondary)", borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px" }}>
            Global · Desde el primer trade
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 0", marginTop: 8 }}>
            {/* PnL total (hero) */}
            <div style={{ paddingRight: 22 }}>
              <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: calStats.global.pnl >= 0 ? C.greenText : C.redText }}>
                {fmt(Math.round(calStats.global.pnl))}
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>PnL Total</div>
            </div>
            {/* Win rate */}
            <div style={{ padding: "0 22px", borderLeft: "1px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-text-primary)" }}>
                {calStats.global.winDays + calStats.global.loseDays > 0
                  ? `${Math.round((calStats.global.winDays / (calStats.global.winDays + calStats.global.loseDays)) * 100)}%`
                  : "—"}
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>Win rate</div>
            </div>
            {/* Ganado / Perdido */}
            <div style={{ padding: "0 22px", borderLeft: "1px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C.green, opacity: 0.9 }}>{fmt(Math.round(calStats.global.win))}</div>
              <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C.red, opacity: 0.9 }}>{fmt(Math.round(calStats.global.lose))}</div>
            </div>
            {/* Comisiones */}
            <div style={{ padding: "0 22px", borderLeft: "1px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                -${Math.round(calStats.global.comm).toLocaleString()}
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>Comisiones</div>
            </div>
            {/* Días operados + rango */}
            <div style={{ paddingLeft: 22, borderLeft: "1px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-text-primary)" }}>
                {calStats.global.days} días
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>
                {calStats.global.first && calStats.global.last
                  ? `${MONTH_NAMES[parseInt(calStats.global.first.slice(5, 7)) - 1].slice(0, 3)} ${calStats.global.first.slice(0, 4)} – ${MONTH_NAMES[parseInt(calStats.global.last.slice(5, 7)) - 1].slice(0, 3)} ${calStats.global.last.slice(0, 4)}`
                  : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial mensual: una fila por mes con actividad, clic navega el calendario */}
      {calStats.months.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 4 }}>
            Historial mensual
          </div>
          <div className="cal-hist-row" style={{ padding: "4px 8px" }}>
            {["Mes", "PnL", "W/L", "Win rate", "Comisiones"].map((h, i) => (
              <div key={h} className={i >= 3 ? "cal-hist-hide-sm" : undefined} style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px", textAlign: i === 0 ? "left" : "right" }}>{h}</div>
            ))}
          </div>
          {(() => {
            const rows = [];
            let lastYear = null;
            calStats.months.forEach(([ym, m]) => {
              const y = ym.slice(0, 4);
              // Subtotal por año solo cuando hay varios años
              if (calStats.multiYear && y !== lastYear) {
                const yearPnl = calStats.months.filter(([k]) => k.startsWith(y)).reduce((s, [, v]) => s + v.pnl, 0);
                rows.push(
                  <div key={`y-${y}`} className="cal-hist-row" style={{ padding: "5px 8px", background: "var(--color-background-secondary)", borderRadius: 6, marginTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px" }}>{y}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right", color: yearPnl >= 0 ? C.greenText : C.redText }}>{fmt(Math.round(yearPnl))}</div>
                    <div /><div className="cal-hist-hide-sm" /><div className="cal-hist-hide-sm" />
                  </div>
                );
                lastYear = y;
              }
              const active = ym === currentMonth;
              const wr = m.winDays + m.loseDays > 0 ? Math.round((m.winDays / (m.winDays + m.loseDays)) * 100) : null;
              const monthLabel = `${MONTH_NAMES[parseInt(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
              rows.push(
                <div
                  key={ym}
                  className="cal-hist-row"
                  onClick={() => setCurrentMonth(ym)}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  style={{
                    padding: "7px 8px",
                    borderBottom: "0.5px solid var(--color-border-tertiary)",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: active ? "var(--color-background-secondary)" : "transparent",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                    {active && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, display: "inline-block", flexShrink: 0 }} />}
                    {monthLabel}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", textAlign: "right", color: m.pnl >= 0 ? C.greenText : C.redText }}>{fmt(Math.round(m.pnl))}</div>
                  <div style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--color-text-secondary)" }}>{m.winDays}/{m.loseDays}</div>
                  <div className="cal-hist-hide-sm" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--color-text-secondary)" }}>{wr !== null ? `${wr}%` : "—"}</div>
                  <div className="cal-hist-hide-sm" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--color-text-tertiary)" }}>-${Math.round(m.comm).toLocaleString()}</div>
                </div>
              );
            });
            return rows;
          })()}
        </div>
      )}
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
function TradeForm({ trade, onSave, onCancel, isNew, accounts = [], dark = false }) {
  // Paleta del popup: sigue el tema claro/oscuro clásico por defecto, o la
  // paleta fija de V2 cuando se abre desde el dashboard nuevo (dark=true).
  const t = dark
    ? {
        bg: V2.card, border: V2.border, text: V2.text, text2: V2.text2, text3: V2.text3,
        inputBg: V2.segBg, green: V2.green, red: V2.red,
        greenBg: "rgba(78,204,163,0.16)", redBg: "rgba(232,83,110,0.16)",
        greenText: V2.green, redText: V2.red,
        secondaryBg: V2.segBg, secondaryBorder: V2.border, cancelText: V2.text2,
        saveTextColor: "#0A0A0A",
      }
    : {
        bg: "var(--color-background-primary)", border: "var(--color-border-secondary)",
        text: "var(--color-text-primary)", text2: "var(--color-text-secondary)", text3: "var(--color-text-tertiary)",
        inputBg: "var(--color-background-primary)", green: C.green, red: C.red,
        greenBg: C.greenBg, redBg: C.redBg, greenText: C.greenText, redText: C.redText,
        secondaryBg: "var(--color-background-secondary)", secondaryBorder: "var(--color-border-secondary)", cancelText: "var(--color-text-secondary)",
        saveTextColor: "#fff",
      };

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
    // La comisión se guarda siempre negativa pero se muestra en positivo
    const comm = parseLocaleFloat(initial.commission) || 0;
    initial.commission = comm === 0 ? "" : String(Math.abs(comm));
    // El PnL se introduce en magnitud; el signo lo decide el selector Win/Loss
    const pnlVal = parseLocaleFloat(initial.pnl) || 0;
    initial.pnl = pnlVal === 0 ? "" : String(Math.abs(pnlVal));
    initial.balance = initial.balance === null || initial.balance === undefined ? "" : initial.balance;
    initial.threshold = initial.threshold === null || initial.threshold === undefined ? "" : initial.threshold;
    // Si las notas son las autogeneradas del resumen, se dejan vacías para no duplicarlas
    if (/^Balance cierre: \$[\d.]+ \| Umbral autoliq\.: \$[\d.]+$/.test((initial.notes || "").trim())) {
      initial.notes = "";
    }
    return initial;
  });

  // Signo del PnL: se elige con el selector Win/Loss en vez de escribir el menos
  const [isLoss, setIsLoss] = useState(() => (parseLocaleFloat(trade?.pnl) || 0) < 0);
  const [aviso, setAviso] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Si se escribe un negativo a mano, se pasa a Loss y se guarda la magnitud
  const setPnl = (raw) => {
    const cleaned = raw.replace(/[^0-9.,-]/g, "");
    if (cleaned.includes("-")) setIsLoss(true);
    setForm(f => ({ ...f, pnl: cleaned.replace(/-/g, "") }));
  };

  const renderField = (label, field, type = "text", opts, placeholder) => {
    const malo = aviso && vacio(form[field]);
    const borde = malo ? t.red : t.border;
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 10, color: malo ? t.red : t.text2, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</label>
      {opts ? (
        <select value={form[field] || ""} onChange={e => set(field, e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${borde}`, background: t.inputBg, color: t.text }}>
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
          placeholder={placeholder}
          value={form[field] ?? ""}
          onChange={e => {
            const val = e.target.value;
            if (type === "number") {
              set(field, val.replace(/[^0-9.,-]/g, ""));
            } else {
              set(field, val);
            }
          }}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${borde}`, background: t.inputBg, color: t.text }}
        />
      )}
    </div>
    );
  };

  const accountOpts = accounts.some(a => a.value === form.account)
    ? accounts
    : form.account
      ? [{ value: form.account, label: form.account }, ...accounts]
      : [{ value: "", label: "Selecciona una cuenta" }, ...accounts];

  // El campo guarda la magnitud; el selector Win/Loss aplica el signo
  const signedPnl = (isLoss ? -1 : 1) * Math.abs(parseLocaleFloat(form.pnl) || 0);
  const pnlPreview = signedPnl;
  const commPreview = Math.abs(parseLocaleFloat(form.commission) || 0);

  // Todos los campos son obligatorios salvo las notas. Se avisa en el propio
  // popup en vez de guardar un registro incompleto que luego rompe los
  // cálculos de colchón y fase.
  const vacio = (v) => v === "" || v === null || v === undefined;
  const faltan = [
    ["date", "Fecha"],
    ["account", "Cuenta"],
    ["pnl", "PnL neto"],
    ["commission", "Comisión"],
    ["balance", "Balance cierre"],
    ["threshold", "Umbral autoliq."],
  ].filter(([k]) => vacio(form[k])).map(([, etiqueta]) => etiqueta);

  const handleSave = () => {
    if (faltan.length) {
      setAviso(`Falta rellenar: ${faltan.join(", ")}.`);
      return;
    }
    setAviso("");
    const pnlNum = signedPnl;
    // La comisión SIEMPRE se guarda negativa
    const commNum = -Math.abs(parseLocaleFloat(form.commission) || 0);
    const balanceNum = form.balance === "" || form.balance === null || form.balance === undefined
      ? null : parseLocaleFloat(form.balance);
    const thresholdNum = form.threshold === "" || form.threshold === null || form.threshold === undefined
      ? null : parseLocaleFloat(form.threshold);

    // Notas automáticas coherentes con los trades importados de Bulenox
    const autoNotes = (balanceNum !== null && thresholdNum !== null)
      ? `Balance cierre: $${balanceNum} | Umbral autoliq.: $${thresholdNum}`
      : "";
    const notes = (form.notes || "").trim() || autoNotes;

    onSave({
      ...form,
      date: form.date,
      account: form.account,
      pnl: pnlNum,
      commission: commNum,
      gross: pnlNum + Math.abs(commNum),
      balance: balanceNum,
      threshold: thresholdNum,
      notes,
      // Valores automáticos del formato "resumen diario" (no se preguntan)
      result: isLoss ? "Loss" : "Win",
      instrument: "NQ",
      qty: 1,
      strategy: "Resumen diario",
      timeframe: "Diario",
      direction: "",
      entry_time: "",
      exit_time: "",
      entry: 0,
      exit_price: 0,
      mae: 0,
      mfe: 0,
      etd: 0,
      rr: 0,
      image: null,
    });
  };

  // Popup centrado vía portal al body: los módulos tienen overflow:hidden y
  // transform en hover, que romperían un position:fixed anidado.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 14, padding: 18, width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, color: t.text }}>{isNew ? "Añadir día operado" : `Editar día #${form.id}`}</div>
      <div style={{ fontSize: 10, color: t.text3, marginBottom: 12 }}>
        Resumen diario Bulenox · un registro por día operado
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
        {renderField("Fecha", "date", "date")}
        {renderField("Cuenta", "account", "text", accountOpts)}

        {/* PnL: magnitud + selector de signo Win/Loss */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <label style={{ fontSize: 10, color: t.text2, textTransform: "uppercase", letterSpacing: ".3px" }}>PnL neto ($)</label>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `0.5px solid ${t.border}` }}>
              {[
                { loss: false, label: "Win", bg: t.greenBg, fg: t.greenText },
                { loss: true, label: "Loss", bg: t.redBg, fg: t.redText },
              ].map(o => {
                const on = isLoss === o.loss;
                return (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setIsLoss(o.loss)}
                    aria-pressed={on}
                    style={{
                      padding: "2px 9px",
                      fontSize: 10,
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      background: on ? o.bg : "transparent",
                      color: on ? o.fg : t.text3,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 600, color: isLoss ? t.red : t.green, pointerEvents: "none" }}>
              {isLoss ? "−" : "+"}
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 417.46"
              value={form.pnl ?? ""}
              onChange={e => setPnl(e.target.value)}
              style={{ width: "100%", fontSize: 12, padding: "5px 8px 5px 20px", borderRadius: 6, border: `0.5px solid ${t.border}`, background: t.inputBg, color: isLoss ? t.red : t.green, fontWeight: 500 }}
            />
          </div>
        </div>

        {renderField("Comisión ($)", "commission", "number", null, "Ej: 13")}
        {renderField("Balance cierre ($)", "balance", "number", null, "Ej: 25417")}
        {renderField("Umbral autoliq. / DD ($)", "threshold", "number", null, "Ej: 23917")}
      </div>

      <div style={{ fontSize: 10, color: t.text3, marginBottom: 10 }}>
        PnL a guardar: <strong style={{ color: isLoss ? t.red : t.green }}>{pnlPreview >= 0 ? "+" : "−"}${Math.abs(pnlPreview).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> · Bruto: ${(pnlPreview + commPreview).toLocaleString(undefined, { maximumFractionDigits: 2 })} · La comisión se guarda en negativo automáticamente
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: t.text2, textTransform: "uppercase", letterSpacing: ".3px", display: "block", marginBottom: 3 }}>Notas (opcional)</label>
        <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Si lo dejas vacío se generan notas automáticas con balance y umbral" style={{ width: "100%", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.text, resize: "vertical" }} />
      </div>

      {aviso && (
        <div role="alert" style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 10px",
          borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: t.redBg, color: t.redText, border: `0.5px solid ${t.red}`,
        }}>
          <span aria-hidden="true">⚠</span>{aviso}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} style={{ flex: 1, padding: "9px 16px", background: t.green, color: t.saveTextColor, border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>Guardar</button>
        <button onClick={onCancel} style={{ flex: 1, padding: "9px 16px", background: t.secondaryBg, color: t.cancelText, border: `0.5px solid ${t.secondaryBorder}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
      </div>
      </div>
    </div>,
    document.body
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
  // Campos del RESUMEN DE CUENTAS de Bulenox. size / daily_limit / startSize
  // no se piden en el formulario: se envían con valores internos por defecto.
  const DEFAULT_PLAN = PROPFIRM_PLANS.Bulenox[0];
  const EMPTY_ACCT = {
    name: "", propfirm: "Bulenox", status: "ACTIVE", type: "EXAMEN",
    size: DEFAULT_PLAN.size, startSize: DEFAULT_PLAN.size, target: DEFAULT_PLAN.target,
    dd_limit: DEFAULT_PLAN.dd_limit, threshold: DEFAULT_PLAN.threshold,
    safetyReserve: DEFAULT_PLAN.safetyReserve, maxContracts: DEFAULT_PLAN.maxContracts,
    consistency: DEFAULT_PLAN.consistency, daily_limit: DEFAULT_PLAN.daily_limit ?? 0,
  };
  const [newAcct, setNewAcct] = useState(EMPTY_ACCT);
  // Propfirms conocidas + las que existan ya en cuentas del usuario
  const [newPfCustom, setNewPfCustom] = useState(false);
  const [editPfCustom, setEditPfCustom] = useState(false);
  const [newPlanId, setNewPlanId] = useState(DEFAULT_PLAN.id);
  const [editPlanId, setEditPlanId] = useState("");
  const [showNewPlanDetails, setShowNewPlanDetails] = useState(false);
  const propfirmOpts = [...new Set(["Bulenox", "Lucid", ...accountsList.map(a => a.propfirm).filter(Boolean)])];

  // Vuelca los parámetros de riesgo del plan elegido sobre la cuenta en edición
  const applyPlan = (planId, propfirm, current, setter) => {
    const plan = (PROPFIRM_PLANS[propfirm] || []).find(p => p.id === planId);
    if (!plan) return;
    setter({
      ...current,
      size: plan.size,
      startSize: plan.size,
      target: plan.target,
      dd_limit: plan.dd_limit,
      threshold: plan.threshold,
      safetyReserve: plan.safetyReserve,
      maxContracts: plan.maxContracts,
      consistency: plan.consistency,
      daily_limit: plan.daily_limit ?? 0,
    });
  };
  const [editingAcctId, setEditingAcctId] = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [acctError, setAcctError] = useState("");

  // Listado de cuentas: filtro por estado y paginación por propfirm. Arranca en
  // "Activas" porque las cerradas solo estorban al gestionar; siguen
  // a un toque de distancia.
  const ACCT_PAGE = 5;
  const [acctStatusF, setAcctStatusF] = useState("ACTIVE");
  const [acctPages, setAcctPages] = useState({});
  const ACCT_STATUS_TABS = [
    { id: "ACTIVE", label: "Activas" },
    { id: "CLOSED", label: "Cerradas" },
    { id: "ALL", label: "Todas" },
  ];
  const acctGroups = useMemo(() => {
    const filtradas = accountsList.filter(a => acctStatusF === "ALL" || normStatus(a.status) === acctStatusF);
    const grupos = [];
    filtradas.forEach(a => {
      const pf = a.propfirm || "Sin propfirm";
      let g = grupos.find(x => x.pf === pf);
      if (!g) { g = { pf, items: [] }; grupos.push(g); }
      g.items.push(a);
    });
    return grupos;
  }, [accountsList, acctStatusF]);
  const acctCounts = useMemo(() => {
    const c = { ACTIVE: 0, CLOSED: 0, ALL: accountsList.length };
    accountsList.forEach(a => { const s = normStatus(a.status); if (c[s] !== undefined) c[s]++; });
    return c;
  }, [accountsList]);
  const [saveKeySuccess, setSaveKeySuccess] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [wipeModal, setWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [wipeError, setWipeError] = useState("");
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
        body: JSON.stringify({ 
          ...acctData, 
          size: parseFloat(balance), 
          balance: null, 
          updateDate: null,
          brokerUpdateTime: new Date().toISOString()
        }),
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

  // Forzar actualización de verdad. Un window.location.reload() vuelve a servir
  // los mismos chunks desde la caché de la PWA, así que la app se quedaba en la
  // versión vieja por mucho que se recargara. Aquí se pregunta la versión al
  // servidor sin caché, se vacía el almacén de cachés y se dan de baja los
  // service workers, y se recarga con el commit en la URL para que ni el
  // navegador ni el bfcache puedan devolver la página anterior.
  const [forceState, setForceState] = useState("");
  const forceUpdate = async () => {
    setForceState("working");
    let target = "";
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setServerVersion({ commitSha: data.commitSha, deploymentId: data.deploymentId });
        target = (data.commitSha && data.commitSha !== "development") ? data.commitSha : data.deploymentId;
      }
    } catch (e) {
      // Sin red no se puede saber la versión, pero limpiar y recargar sigue siendo útil
      console.error(e);
    }

    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.error(e);
    }

    try {
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) {
      console.error(e);
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("v", (target && target !== "local") ? target : String(Date.now()));
    window.location.replace(nextUrl.toString());
  };

  useEffect(() => {
    checkVercelVersion(true); // Silent check on mount
  }, []);

  // Abre el modal de confirmación (reemplaza los diálogos nativos confirm/prompt
  // que algunos navegadores bloquean, haciendo que el botón "no hiciera nada").
  const openWipeModal = () => {
    setWipeConfirmText("");
    setWipeError("");
    setWipeModal(true);
  };

  const confirmWipeDatabase = async () => {
    if (wipeConfirmText.trim().toUpperCase() !== "VACIAR") {
      setWipeError('Escribe exactamente VACIAR para confirmar.');
      return;
    }
    try {
      setWipeLoading(true);
      setWipeError("");
      const res = await fetch("/api/db-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clean_database" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchAccounts();
        await fetchTrades();
        await fetchDbStatus();
        setWipeModal(false);
        setWipeConfirmText("");
      } else {
        setWipeError(data.error || `Error ${res.status} al vaciar la base de datos.`);
      }
    } catch (e) {
      setWipeError("Error de red al intentar vaciar la base de datos.");
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
      // size/startSize salen del plan elegido. El balance no se pide: arranca en
      // el nominal y a partir del primer día operado manda el registro diario.
      const payload = { ...newAcct, balance: newAcct.size };
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewAcct(EMPTY_ACCT);
        setNewPfCustom(false);
        setNewPlanId(DEFAULT_PLAN.id);
        setShowNewPlanDetails(false);
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

        {/* Alta de cuenta como módulo propio y por encima del listado: es la acción,
            no un apéndice de la lista. Con un borderTop se leía como el pie de lo
            anterior. */}
        <div style={{ background: "var(--color-background-secondary)", border: `0.5px solid ${C.blue}`, borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6, color: C.blueText }}>
            <span>➕</span> Nueva Cuenta
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            {/* Nombre */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Nombre de Cuenta</label>
              <input type="text" placeholder="Ej: BX101840-14" value={newAcct.name ?? ""} onChange={e => setNewAcct({ ...newAcct, name: e.target.value })} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            </div>
            {/* Tipo */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Tipo de Cuenta</label>
              <select value={newAcct.type || "EXAMEN"} onChange={e => setNewAcct({ ...newAcct, type: e.target.value })} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}>
                <option value="EXAMEN">Examen 📝</option>
                <option value="REAL">Real 💼</option>
              </select>
            </div>
            {/* Propfirm */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Propfirm</label>
              <div style={{ display: "flex", gap: 4 }}>
                <select
                  value={newPfCustom ? "__custom__" : (newAcct.propfirm || "Bulenox")}
                  onChange={e => {
                    if (e.target.value === "__custom__") { setNewPfCustom(true); setNewPlanId(""); setNewAcct({ ...newAcct, propfirm: "" }); }
                    else { setNewPfCustom(false); setNewPlanId(""); setNewAcct({ ...newAcct, propfirm: e.target.value }); }
                  }}
                  style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}
                >
                  {propfirmOpts.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                  <option value="__custom__">➕ Otra…</option>
                </select>
                {newPfCustom && (
                  <input type="text" placeholder="Nombre de la propfirm" value={newAcct.propfirm ?? ""} onChange={e => setNewAcct({ ...newAcct, propfirm: e.target.value })} autoFocus style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${C.blue}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
                )}
              </div>
            </div>
            {/* Plan: rellena solo los parámetros de riesgo */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>Plan / Tamaño</label>
              <select
                value={newPlanId}
                onChange={e => { setNewPlanId(e.target.value); applyPlan(e.target.value, newAcct.propfirm, newAcct, setNewAcct); }}
                disabled={!(PROPFIRM_PLANS[newAcct.propfirm] || []).length}
                style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${newPlanId ? C.blue : "var(--color-border-secondary)"}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none", opacity: (PROPFIRM_PLANS[newAcct.propfirm] || []).length ? 1 : 0.5 }}
              >
                <option value="">{(PROPFIRM_PLANS[newAcct.propfirm] || []).length ? "Personalizado…" : "Sin planes para esta propfirm"}</option>
                {(PROPFIRM_PLANS[newAcct.propfirm] || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Parámetros aplicados por el plan — editables si hace falta */}
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setShowNewPlanDetails(v => !v)}
              style={{ fontSize: 10, padding: "3px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}
            >
              {showNewPlanDetails ? "▾" : "▸"} Parámetros del plan
            </button>
            {!showNewPlanDetails && (
              <span style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginLeft: 8 }}>
                Obj ${(newAcct.target || 0).toLocaleString()} · DD ${(newAcct.dd_limit || 0).toLocaleString()} · Umbral ${(newAcct.threshold || 0).toLocaleString()}
              </span>
            )}
            {showNewPlanDetails && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                {[
                  ["Objetivo ($)", "target", "number"],
                  ["DD máximo ($)", "dd_limit", "number"],
                  ["Umbral inicial ($)", "threshold", "number"],
                  ["Reserva safety ($)", "safetyReserve", "number"],
                  ["Max. contratos", "maxContracts", "int"],
                  ["Consistencia", "consistency", "text"],
                ].map(([label, field, kind]) => (
                  <div key={field} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <label style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>{label}</label>
                    <input
                      type={kind === "text" ? "text" : "number"}
                      value={newAcct[field] ?? ""}
                      onChange={e => {
                        const v = e.target.value;
                        if (kind === "text") setNewAcct({ ...newAcct, [field]: v });
                        else if (kind === "int") setNewAcct({ ...newAcct, [field]: v === "" ? "" : parseInt(v) });
                        else setNewAcct({ ...newAcct, [field]: v === "" ? "" : parseFloat(v) });
                      }}
                      style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
            Balance, días operados y mejor día se calculan solos a partir de los trades que vayas registrando.
          </div>
          <button onClick={handleAddAccount} style={{ width: "100%", padding: "6px 12px", background: C.blue, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
            + Crear Cuenta
          </button>
        </div>

        {/* Filtro por estado */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {ACCT_STATUS_TABS.map(t => {
            const on = acctStatusF === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setAcctStatusF(t.id); setAcctPages({}); }}
                style={{
                  fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: `0.5px solid ${on ? C.blue : "var(--color-border-secondary)"}`,
                  background: on ? C.blueBg : "var(--color-background-secondary)",
                  color: on ? C.blueText : "var(--color-text-secondary)",
                }}
              >
                {t.label} <span style={{ opacity: 0.65 }}>{acctCounts[t.id] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {acctGroups.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 14 }}>
            No hay cuentas en este estado.
          </div>
        )}

        {/* Un bloque por propfirm, de cinco en cinco */}
        {acctGroups.map(g => {
          const paginas = Math.max(1, Math.ceil(g.items.length / ACCT_PAGE));
          const pag = Math.min(acctPages[g.pf] || 0, paginas - 1);
          const visibles = g.items.slice(pag * ACCT_PAGE, pag * ACCT_PAGE + ACCT_PAGE);
          const irA = (d) => setAcctPages(p => ({ ...p, [g.pf]: Math.max(0, Math.min(paginas - 1, pag + d)) }));
          const flecha = (dir, activo) => (
            <button
              onClick={() => irA(dir === "prev" ? -1 : 1)}
              disabled={!activo}
              aria-label={dir === "prev" ? "Cuentas anteriores" : "Más cuentas"}
              style={{
                width: 22, height: 22, lineHeight: 1, borderRadius: 6, cursor: activo ? "pointer" : "default",
                border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)",
                color: "var(--color-text-secondary)", opacity: activo ? 1 : 0.3, fontSize: 11, padding: 0,
              }}
            >{dir === "prev" ? "‹" : "›"}</button>
          );
          return (
        <div key={g.pf} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".5px" }}>
              {g.pf} <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
            </span>
            {paginas > 1 && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {flecha("prev", pag > 0)}
                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{pag + 1}/{paginas}</span>
                {flecha("next", pag < paginas - 1)}
              </span>
            )}
          </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibles.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "var(--color-background-secondary)", flexWrap: "wrap", gap: 8 }}>
              {editingAcctId === a.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
                  <input type="text" value={editAcct.name} onChange={e => setEditAcct({...editAcct, name: e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} placeholder="Nombre" />
                  <select value={editAcct.type || "EXAMEN"} onChange={e => setEditAcct({...editAcct, type: e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}>
                    <option value="EXAMEN">Examen 📝</option>
                    <option value="REAL">Real 💼</option>
                  </select>
                  <select value={normStatus(editAcct.status)} onChange={e => setEditAcct({...editAcct, status: e.target.value})} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}>
                    <option value="ACTIVE">Activa</option>
                    <option value="CLOSED">Cerrada</option>
                  </select>
                  <div style={{ display: "flex", gap: 4 }}>
                    <select
                      value={editPfCustom ? "__custom__" : (editAcct.propfirm || "Bulenox")}
                      onChange={e => {
                        if (e.target.value === "__custom__") { setEditPfCustom(true); setEditAcct({ ...editAcct, propfirm: "" }); }
                        else { setEditPfCustom(false); setEditAcct({ ...editAcct, propfirm: e.target.value }); }
                      }}
                      style={{ flex: 1, fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}
                    >
                      {propfirmOpts.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                      <option value="__custom__">➕ Otra…</option>
                    </select>
                    {editPfCustom && (
                      <input
                        type="text"
                        placeholder="Nombre de la propfirm"
                        value={editAcct.propfirm ?? ""}
                        onChange={e => setEditAcct({ ...editAcct, propfirm: e.target.value })}
                        autoFocus
                        style={{ flex: 1, fontSize: 11, padding: "4px 6px", borderRadius: 4, border: `0.5px solid ${C.blue}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                      />
                    )}
                  </div>
                  <select
                    value={editPlanId}
                    onChange={e => { setEditPlanId(e.target.value); applyPlan(e.target.value, editAcct.propfirm, editAcct, setEditAcct); }}
                    disabled={!(PROPFIRM_PLANS[editAcct.propfirm] || []).length}
                    style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: `0.5px solid ${editPlanId ? C.blue : "var(--color-border-secondary)"}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none", opacity: (PROPFIRM_PLANS[editAcct.propfirm] || []).length ? 1 : 0.5 }}
                  >
                    <option value="">{(PROPFIRM_PLANS[editAcct.propfirm] || []).length ? "Personalizado…" : "Sin planes"}</option>
                    {(PROPFIRM_PLANS[editAcct.propfirm] || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {[
                    ["Objetivo ($)", "target", "number"],
                    ["DD máximo ($)", "dd_limit", "number"],
                    ["Umbral autoliq. ($)", "threshold", "number"],
                    ["Reserva safety ($)", "safetyReserve", "number"],
                    ["Max. contratos", "maxContracts", "int"],
                    ["Consistencia", "consistency", "text"],
                  ].map(([ph, field, kind]) => (
                    <input
                      key={field}
                      type={kind === "text" ? "text" : "number"}
                      placeholder={ph}
                      value={editAcct[field] !== undefined && editAcct[field] !== null ? editAcct[field] : ""}
                      onChange={e => {
                        const v = e.target.value;
                        if (kind === "text") setEditAcct({...editAcct, [field]: v === "" ? null : v});
                        else if (kind === "int") setEditAcct({...editAcct, [field]: v === "" ? null : parseInt(v)});
                        else setEditAcct({...editAcct, [field]: v === "" ? null : parseFloat(v)});
                      }}
                      style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: field === "balance" ? `0.5px solid ${C.blue}` : "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                    />
                  ))}
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
                      {a.type === "REAL" ? (
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: C.greenBg, color: C.greenText, fontWeight: 500 }}>Real 💼</span>
                      ) : (
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: C.blueBg, color: C.blueText, fontWeight: 500 }}>Examen 📝</span>
                      )}
                      {isClosedAcct(a) && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 500 }}>Cerrada</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      {a.propfirm ? `${a.propfirm} · ` : ""}Balance: ${(a.balance ?? a.size).toLocaleString()} · Obj: ${a.target.toLocaleString()} · DD: ${a.dd_limit.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => { setEditingAcctId(a.id); setEditAcct(a); setEditPfCustom(false); setEditPlanId(""); }} style={{ fontSize: 10, padding: "3px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>✏️ Editar</button>
                    <button onClick={() => handleDeleteAccount(a.id)} style={{ fontSize: 10, padding: "3px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "var(--color-background-primary)", color: C.red, cursor: "pointer" }}>✕ Borrar</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        </div>
          );
        })}

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
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 4 }}>v5.0</div>
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
                onClick={() => {
                  const targetVersion = serverVersion.commitSha || serverVersion.deploymentId;
                  if (targetVersion && targetVersion !== 'development' && targetVersion !== 'local') {
                    const nextUrl = new URL(window.location.href);
                    nextUrl.searchParams.set('v', targetVersion);
                    window.location.replace(nextUrl.toString());
                  } else {
                    window.location.reload();
                  }
                }}
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
            {/* Sin confirm(): algunos navegadores lo bloquean en la app instalada
                y el botón se quedaba sin hacer nada. */}
            <button
              onClick={forceUpdate}
              disabled={forceState === "working"}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 8,
                border: `0.5px solid ${C.green}`,
                background: C.greenBg,
                color: C.greenText,
                fontSize: 12,
                fontWeight: 600,
                cursor: forceState === "working" ? "not-allowed" : "pointer",
              }}
            >
              {forceState === "working" ? "Actualizando…" : "Forzar actualización"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
            Forzar actualización consulta la versión a Vercel, vacía la caché de la
            aplicación, da de baja los service workers y vuelve a cargar apuntando al
            último despliegue. Úsalo si la app se queda en una versión antigua.
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
          onClick={openWipeModal}
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

      {wipeModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 2000, padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 440,
            background: "var(--color-background-primary)",
            border: `0.5px solid ${C.red}`,
            borderRadius: 16, padding: 24,
            boxShadow: "0 20px 40px -5px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: C.red, display: "flex", alignItems: "center", gap: 8 }}>
                ⚠️ Vaciar base de datos
              </h3>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
                Se eliminarán <strong>permanentemente</strong> todas tus cuentas y todos tus trades. Esta acción es <strong>irreversible</strong>.
              </p>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6, fontWeight: 500 }}>
                Escribe <strong style={{ color: C.red }}>VACIAR</strong> para confirmar:
              </label>
              <input
                type="text"
                autoFocus
                value={wipeConfirmText}
                onChange={e => { setWipeConfirmText(e.target.value); if (wipeError) setWipeError(""); }}
                onKeyDown={e => { if (e.key === "Enter" && wipeConfirmText.trim().toUpperCase() === "VACIAR") confirmWipeDatabase(); }}
                placeholder="VACIAR"
                disabled={wipeLoading}
                style={{
                  width: "100%", boxSizing: "border-box",
                  fontSize: 13, padding: "9px 12px", borderRadius: 8,
                  border: `0.5px solid ${wipeError ? C.red : "var(--color-border-secondary)"}`,
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)", outline: "none",
                  letterSpacing: "1px", fontWeight: 600,
                }}
              />
              {wipeError && (
                <p style={{ fontSize: 11, color: C.red, margin: "8px 0 0" }}>{wipeError}</p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { setWipeModal(false); setWipeConfirmText(""); setWipeError(""); }}
                disabled={wipeLoading}
                style={{ fontSize: 11, padding: "8px 14px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: wipeLoading ? "not-allowed" : "pointer", fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmWipeDatabase}
                disabled={wipeLoading || wipeConfirmText.trim().toUpperCase() !== "VACIAR"}
                style={{
                  fontSize: 11, padding: "8px 18px", borderRadius: 6, border: "none",
                  background: (wipeLoading || wipeConfirmText.trim().toUpperCase() !== "VACIAR") ? "var(--color-border-tertiary)" : C.red,
                  color: "#fff",
                  cursor: (wipeLoading || wipeConfirmText.trim().toUpperCase() !== "VACIAR") ? "not-allowed" : "pointer",
                  fontWeight: 600, opacity: wipeLoading ? 0.7 : 1,
                }}
              >
                {wipeLoading ? "Eliminando…" : "Vaciar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard V2 ─────────────────────────────────────────────────────────────
// Clon del diseño de referencia: paleta oscura propia, barra lateral de iconos,
// tarjetas con acciones y selector de periodo individual.
const V2 = {
  bg: "#0A0A0A",
  side: "#141414",
  card: "#1A1A1A",
  border: "#262626",
  segBg: "#141414",
  segActive: "#2A2A2A",
  text: "#FFFFFF",
  text2: "#8C8C8C",
  text3: "#5C5C5C",
  green: "#4ECCA3",
  red: "#E8536E",
  track: "#3A3A3A",
};

// Sin "Day": cada trade es el resumen de un único día operado, así que la
// vista diaria daría siempre 100% o 0% y no aporta nada.
const V2_PERIODS = [
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
];

// ── Iconos SVG ───────────────────────────────────────────────────────────────
const IconGrid = ({ s = 18, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="2" fill={c} /><rect x="14" y="3" width="7" height="4" rx="2" fill={c} /><rect x="14" y="10" width="7" height="11" rx="2" fill={c} /><rect x="3" y="13" width="7" height="8" rx="2" fill={c} /></svg>
);
const IconDoc = ({ s = 18, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="3" fill={c} opacity="0.35" /><rect x="7" y="7" width="10" height="2" rx="1" fill={c} /><rect x="7" y="11" width="10" height="2" rx="1" fill={c} /><rect x="7" y="15" width="6" height="2" rx="1" fill={c} /></svg>
);
const IconCal = ({ s = 18, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" fill={c} opacity="0.35" /><rect x="3" y="5" width="18" height="5" rx="2" fill={c} /><rect x="7" y="2" width="2" height="5" rx="1" fill={c} /><rect x="15" y="2" width="2" height="5" rx="1" fill={c} /></svg>
);
const IconPlus = ({ s = 18, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.6" /><path d="M12 8v8M8 12h8" stroke={c} strokeWidth="1.6" strokeLinecap="round" /></svg>
);
const IconFlame = ({ s = 16, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2.5s5.2 4 5.2 8.6a5.2 5.2 0 0 1-10.4 0C6.8 8.6 9 7 9 7s.4 1.9 1.6 2.6c0-2.4.6-5.4 1.4-7.1Z" fill={c} opacity="0.9" /><path d="M12 21.5a3 3 0 0 1-3-3c0-1.9 3-4 3-4s3 2.1 3 4a3 3 0 0 1-3 3Z" fill={c} opacity="0.45" /></svg>
);
const IconSync = ({ s = 18, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" stroke={c} strokeWidth="1.6" strokeLinecap="round" /><path d="M4 20v-4h4M20 4v4h-4" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconInfo = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke={c} strokeWidth="1.7" /><circle cx="12" cy="7.8" r="1.15" fill={c} /><path d="M12 11v5.5" stroke={c} strokeWidth="1.7" strokeLinecap="round" /></svg>
);
const IconGear = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.1" stroke={c} strokeWidth="1.7" /><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" stroke={c} strokeWidth="1.7" strokeLinecap="round" /></svg>
);
const IconTrash = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 4h4M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconArrow = ({ up, c, s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ transform: up ? "none" : "scaleY(-1)" }}><path d="M7 17 17 7M17 7H9M17 7v8" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// ── Agregación por periodo ───────────────────────────────────────────────────
// El ancla es el último día registrado, no hoy: así el panel siempre muestra
// datos aunque lleves días sin operar.
function v2Agg(trades) {
  const byDay = new Map();
  trades.forEach(t => {
    const d = normalizeDateToYYYYMMDD(t.date);
    if (!byDay.has(d)) byDay.set(d, { pnl: 0, comm: 0 });
    const e = byDay.get(d);
    e.pnl += t.pnl || 0;
    e.comm += Math.abs(t.commission || 0);
  });
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// toISOString() convierte a UTC: con Madrid en UTC+2, la medianoche local del
// día 1 cae en el día 30 en UTC y el rango se desplaza un día entero. Se
// formatea en local en vez de tirar de toISOString().
function v2LocalIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// `offset` desplaza el periodo hacia atrás (-1 = el anterior) para poder
// navegar semana a semana o mes a mes sin perder la comparación.
function v2Ranges(period, anchor, offset = 0) {
  const a = new Date(anchor + "T00:00:00");
  const iso = v2LocalIso;
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  if (period === "day") {
    const c = shift(a, offset);
    const p = shift(c, -1);
    return { cur: [iso(c), iso(c)], prev: [iso(p), iso(p)] };
  }
  if (period === "week") {
    // Lunes de la semana del ancla, desplazado `offset` semanas
    const mon = shift(a, -((a.getDay() + 6) % 7) + offset * 7);
    const pm = shift(mon, -7);
    return { cur: [iso(mon), iso(shift(mon, 6))], prev: [iso(pm), iso(shift(pm, 6))] };
  }
  if (period === "month") {
    const y = a.getFullYear(), m = a.getMonth() + offset;
    const s = new Date(y, m, 1), e = new Date(y, m + 1, 0);
    const ps = new Date(y, m - 1, 1), pe = new Date(y, m, 0);
    return { cur: [iso(s), iso(e)], prev: [iso(ps), iso(pe)] };
  }
  const y = a.getFullYear() + offset;
  return { cur: [`${y}-01-01`, `${y}-12-31`], prev: [`${y - 1}-01-01`, `${y - 1}-12-31`] };
}

// Etiqueta legible del periodo mostrado: "Julio 2026", "Semana 2 de julio"…
function v2RangeLabel(period, from) {
  const d = new Date(from + "T00:00:00");
  const mes = V2_MFULL[d.getMonth()];
  if (period === "year") return `${d.getFullYear()}`;
  if (period === "month") return `${mes} ${d.getFullYear()}`;
  if (period === "week") {
    const n = Math.floor((d.getDate() - 1) / 7) + 1;
    return `Semana ${n} de ${mes.toLowerCase()}`;
  }
  return `${d.getDate()} ${V2_MN[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

const V2_MN = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const V2_MFULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function v2Slice(days, [from, to]) {
  const sel = days.filter(([d]) => d >= from && d <= to);
  const wins = sel.filter(([, v]) => v.pnl > 0).length;
  const losses = sel.filter(([, v]) => v.pnl < 0).length;
  const pnl = sel.reduce((s, [, v]) => s + v.pnl, 0);
  const gp = sel.reduce((s, [, v]) => (v.pnl > 0 ? s + v.pnl : s), 0);
  const gl = Math.abs(sel.reduce((s, [, v]) => (v.pnl < 0 ? s + v.pnl : s), 0));
  return {
    wins, losses, pnl,
    days: sel.length,
    wr: wins + losses ? (wins / (wins + losses)) * 100 : 0,
    pf: gl ? gp / gl : (gp ? Infinity : 0),
    comm: sel.reduce((s, [, v]) => s + v.comm, 0),
  };
}

// ── Piezas visuales ──────────────────────────────────────────────────────────
// El tamaño lo fija la clase .v2-donut (responsive); el SVG escala por viewBox.
function V2Donut({ pct, stroke = 15 }) {
  const size = 168;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const val = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="v2-donut" style={{ position: "relative", flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "100%", display: "block", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={V2.track} strokeWidth={stroke} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={V2.green} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * val) / 100} ${c}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="v2-donut-num" style={{ fontWeight: 700, color: V2.text, letterSpacing: "-0.02em" }}>{Math.round(val)}</span>
        <span className="v2-donut-pct" style={{ fontWeight: 500, color: V2.text2, marginLeft: 2 }}>%</span>
      </div>
    </div>
  );
}

// Mismo cálculo que EquityChart (calcReconstructedPnlHistory), solo con la
// paleta oscura de V2 en vez de las variables CSS del tema claro/oscuro clásico.
function V2Equity({ trades, accountFilter, accountsList }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.getBoundingClientRect().width;
        if (w > 0) setWidth(w);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    window.addEventListener("resize", updateWidth);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateWidth); };
  }, []);

  useEffect(() => { setHoverIdx(null); }, [trades, accountFilter]);

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const dateDiff = normalizeDateToYYYYMMDD(a.date).localeCompare(normalizeDateToYYYYMMDD(b.date));
      if (dateDiff !== 0) return dateDiff;
      const timeA = parseTimeToSeconds(a.entry_time) || 0;
      const timeB = parseTimeToSeconds(b.entry_time) || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id - b.id;
    });
  }, [trades]);

  const pts = useMemo(() => calcReconstructedPnlHistory(trades, accountFilter, accountsList || []), [trades, accountFilter, accountsList]);
  // Umbral de autoliquidación en la misma escala relativa que la curva verde
  const liq = useMemo(() => calcLiquidationHistory(trades, accountFilter, accountsList || []), [trades, accountFilter, accountsList]);

  if (pts.length < 2) return <div style={{ padding: "20px 0", color: V2.text3, fontSize: 13 }}>Sin datos suficientes</div>;

  const hasLiq = liq.length === pts.length && liq.some(v => v !== null && v !== undefined);
  const liqVals = hasLiq ? liq.filter(v => v !== null && v !== undefined) : [];

  const W = width || 620, H = 150, PAD = 38;  // más bajo: la tarjeta no debe comerse la pantalla
  const min = Math.min(0, ...pts, ...liqVals), max = Math.max(0, ...pts, ...liqVals);
  const range = max - min || 1;
  const toX = i => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD / 2 - ((v - min) / range) * (H - PAD);
  const zeroY = toY(0);
  const areaGreenPts = `${toX(0)},${zeroY} ` + pts.map((v, i) => `${toX(i)},${Math.min(toY(v), zeroY)}`).join(" ") + ` ${toX(pts.length - 1)},${zeroY}`;
  const areaRedPts = `${toX(0)},${zeroY} ` + pts.map((v, i) => `${toX(i)},${Math.max(toY(v), zeroY)}`).join(" ") + ` ${toX(pts.length - 1)},${zeroY}`;
  // La marca más próxima a cero se clava en cero: con el suelo de liquidación el
  // eje ya no arranca en 0, y sin esto la etiqueta de al lado de la línea de cero
  // dice otra cosa (un "-$80" pegado al cero, por ejemplo).
  const ticks = Array.from({ length: 5 }, (_, i) => min + (i / 4) * range);
  if (min < 0 && max > 0) {
    let nearest = 0;
    ticks.forEach((v, i) => { if (Math.abs(v) < Math.abs(ticks[nearest])) nearest = i; });
    ticks[nearest] = 0;
  }

  const formatTick = (v) => {
    const abs = Math.abs(Math.round(v));
    if (abs === 0) return "$0";
    const sign = v >= 0 ? "+" : "-";
    return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${sign}$${abs}`;
  };

  const pointFromEvent = (clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let closestIdx = 0, minDiff = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const diff = Math.abs(toX(i) - svgX);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    setHoverIdx(closestIdx);
  };

  // El umbral solo cambia al cerrar el día: se dibuja en escalones, no interpolado.
  // Es el borde superior de la zona de liquidación, rellena hasta el suelo del
  // gráfico: el hueco entre la curva y esa zona es el colchón que queda.
  const plotBottom = H - PAD / 2;
  let liqPath = "", liqArea = "";
  if (hasLiq) {
    let prev = null;
    liq.forEach((v, i) => {
      if (v === null || v === undefined) { prev = null; return; }
      const x = toX(i), y = toY(v);
      if (prev === null) liqPath += `M${x},${y}`;
      else if (prev !== v) liqPath += `L${x},${toY(prev)}L${x},${y}`;
      else liqPath += `L${x},${y}`;
      prev = v;
    });
    liqArea = `${liqPath}L${toX(pts.length - 1)},${plotBottom}L${toX(0)},${plotBottom}Z`;
  }

  return (
    <div ref={containerRef} className="v2-eq" style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "100%", cursor: "crosshair", overflow: "visible", display: "block" }}
          role="img"
          aria-label="Equity curve acumulada"
          onMouseMove={e => pointFromEvent(e.clientX)}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchMove={e => e.touches[0] && pointFromEvent(e.touches[0].clientX)}
          onTouchEnd={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="v2eqGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={V2.green} stopOpacity="0.30" />
              <stop offset="100%" stopColor={V2.green} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="v2eqRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={V2.red} stopOpacity="0.02" />
              <stop offset="100%" stopColor={V2.red} stopOpacity="0.30" />
            </linearGradient>
            {/* Zona de liquidación: lavado plano. Un degradado se referencia a la caja
                del trazado, así que con el umbral en escalones se apagaba justo donde
                más bajo está el suelo, que es donde peor pinta la cosa. */}
            <linearGradient id="v2liqZone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={V2.red} stopOpacity="0.11" />
              <stop offset="100%" stopColor={V2.red} stopOpacity="0.11" />
            </linearGradient>
          </defs>
          {ticks.map((v, i) => {
            const y = toY(v);
            const isZero = Math.abs(v) < range * 0.01;
            return (
              <g key={i}>
                <line x1={PAD} y1={y} x2={W - 10} y2={y} stroke={isZero ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)"} strokeWidth={isZero ? 1 : 0.5} />
                <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={9} fill={V2.text3}>{formatTick(v)}</text>
              </g>
            );
          })}
          <polygon points={areaGreenPts} fill="url(#v2eqGreen)" />
          <polygon points={areaRedPts} fill="url(#v2eqRed)" />
          {pts.map((v, i) => {
            if (i === 0) return null;
            const avg = (pts[i - 1] + v) / 2;
            return <line key={i} x1={toX(i - 1)} y1={toY(pts[i - 1])} x2={toX(i)} y2={toY(v)} stroke={avg >= 0 ? V2.green : V2.red} strokeWidth={2} strokeLinecap="round" />;
          })}
          <line x1={PAD} y1={zeroY} x2={W - 10} y2={zeroY} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          {hasLiq && (
            <>
              <path d={liqArea} fill="url(#v2liqZone)" pointerEvents="none" />
              <path d={liqPath} fill="none" stroke={V2.red} strokeWidth={1.5} strokeLinejoin="round" pointerEvents="none" />
              {/* Dentro de la zona, salvo que sea tan fina que la etiqueta se salga del gráfico */}
              <text
                x={W - 10}
                y={plotBottom - toY(liqVals[liqVals.length - 1]) >= 16 ? toY(liqVals[liqVals.length - 1]) + 13 : toY(liqVals[liqVals.length - 1]) - 5}
                textAnchor="end" fontSize={9} fontWeight="600" fill={V2.red} opacity={0.75} pointerEvents="none"
              >Liquidación</text>
            </>
          )}
          <circle cx={toX(pts.length - 1)} cy={toY(pts[pts.length - 1])} r={3.5} fill={pts[pts.length - 1] >= 0 ? V2.green : V2.red} stroke={V2.card} strokeWidth={1.5} pointerEvents="none" />

          {hoverIdx !== null && (() => {
            const x = toX(hoverIdx), y = toY(pts[hoverIdx]), val = pts[hoverIdx];
            const trade = sorted[hoverIdx];
            const txt = fmt(val);
            const dateStr = trade?.date ? normalizeDateToYYYYMMDD(trade.date) : "";
            const liqVal = hasLiq ? liq[hoverIdx] : null;
            // Colchón = distancia de la cuenta al umbral de liquidación
            const cushion = (liqVal === null || liqVal === undefined) ? null : val - liqVal;
            const tooltipW = 92, tooltipH = cushion === null ? 36 : 49;
            let tx = x - tooltipW / 2;
            if (tx < 5) tx = 5;
            if (tx + tooltipW > W - 5) tx = W - tooltipW - 5;
            const showBelow = y - tooltipH - 12 < 5;
            const ty = showBelow ? y + 12 : y - tooltipH - 12;
            return (
              <g pointerEvents="none">
                <line x1={x} y1={PAD / 2} x2={x} y2={H - PAD / 2} stroke={V2.border} strokeWidth={1} strokeDasharray="3,3" />
                {cushion !== null && <circle cx={x} cy={toY(liqVal)} r={3} fill={V2.red} stroke={V2.card} strokeWidth={1.5} />}
                <circle cx={x} cy={y} r={6} fill={val >= 0 ? V2.green : V2.red} opacity={0.3} />
                <circle cx={x} cy={y} r={3.5} fill={val >= 0 ? V2.green : V2.red} stroke={V2.card} strokeWidth={1.5} />
                <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={7} fill={V2.segActive} stroke={V2.border} strokeWidth={1} />
                <text x={tx + tooltipW / 2} y={ty + 15} textAnchor="middle" fontSize={11} fontWeight="700" fill={val >= 0 ? V2.green : V2.red}>{txt}</text>
                <text x={tx + tooltipW / 2} y={ty + 28} textAnchor="middle" fontSize={9} fill={V2.text3}>{dateStr}</text>
                {cushion !== null && (
                  <text x={tx + tooltipW / 2} y={ty + 41} textAnchor="middle" fontSize={9} fontWeight="700" fill={V2.red}>
                    Colchón {cushion < 0 ? "-" : ""}${Math.abs(Math.round(cushion)).toLocaleString()}
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

// Mismos cálculos que CalendarWidget (calStats, weeks, historial mensual),
// solo con la paleta oscura de V2 en vez de las variables CSS del tema clásico.
const V2_AMBER = "#E2B144"; // mismo ámbar ya usado en la tarjeta Fase del plan
function V2CalendarWidget({ trades }) {
  const [currentMonth, setCurrentMonth] = useState(() => v2LocalIso(new Date()).slice(0, 7));
  const lastTradesRef = useRef(null);

  useEffect(() => {
    if (trades && trades.length > 0 && trades !== lastTradesRef.current) {
      lastTradesRef.current = trades;
      const sorted = [...trades].sort((a, b) => normalizeDateToYYYYMMDD(b.date).localeCompare(normalizeDateToYYYYMMDD(a.date)));
      if (sorted[0]?.date) setCurrentMonth(normalizeDateToYYYYMMDD(sorted[0].date).slice(0, 7));
    }
  }, [trades]);

  const year = parseInt(currentMonth.split("-")[0]);
  const mo = parseInt(currentMonth.split("-")[1]) - 1;

  const handlePrevMonth = () => {
    let y = year, m = mo - 1;
    if (m < 0) { m = 11; y -= 1; }
    setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`);
  };
  const handleNextMonth = () => {
    let y = year, m = mo + 1;
    if (m > 11) { m = 0; y += 1; }
    setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`);
  };
  const handleMonthSelect = (m) => setCurrentMonth(`${year}-${String(m + 1).padStart(2, "0")}`);
  const handleYearSelect = (y) => setCurrentMonth(`${y}-${String(mo + 1).padStart(2, "0")}`);

  const calStats = useMemo(() => {
    const dayMap = new Map();
    trades.forEach(t => {
      const d = normalizeDateToYYYYMMDD(t.date);
      if (!dayMap.has(d)) dayMap.set(d, { pnl: 0, comm: 0 });
      const day = dayMap.get(d);
      day.pnl += t.pnl || 0;
      day.comm += Math.abs(t.commission || 0);
    });
    const byMonth = new Map();
    const global = { pnl: 0, win: 0, lose: 0, comm: 0, winDays: 0, loseDays: 0, days: 0, first: null, last: null };
    [...dayMap.entries()].forEach(([d, day]) => {
      const ym = d.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, { pnl: 0, win: 0, lose: 0, comm: 0, winDays: 0, loseDays: 0, days: 0 });
      const m = byMonth.get(ym);
      m.pnl += day.pnl; global.pnl += day.pnl;
      m.comm += day.comm; global.comm += day.comm;
      m.days++; global.days++;
      if (day.pnl > 0) { m.win += day.pnl; global.win += day.pnl; m.winDays++; global.winDays++; }
      else if (day.pnl < 0) { m.lose += day.pnl; global.lose += day.pnl; m.loseDays++; global.loseDays++; }
      if (!global.first || d < global.first) global.first = d;
      if (!global.last || d > global.last) global.last = d;
    });
    const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const years = new Set(months.map(([ym]) => ym.slice(0, 4)));
    return { global, months, multiYear: years.size > 1 };
  }, [trades]);

  const monthStats = calStats.months.find(([ym]) => ym === currentMonth)?.[1] || { pnl: 0, win: 0, lose: 0 };

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
  const weeks = [];
  let currentWeek = [];
  for (let i = 0; i < startDow; i++) currentWeek.push({ type: "empty" });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentMonth}-${String(d).padStart(2, "0")}`;
    const dow = (new Date(year, mo, d).getDay() + 6) % 7;
    currentWeek.push({ type: "day", d, key, dow, info: byDate[key] });
    if (dow === 6) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push({ type: "empty" });
    weeks.push(currentWeek);
  }

  const fmtPnl = (v) => {
    const abs = Math.abs(Math.round(v));
    return abs >= 1000 ? (v < 0 ? "-" : "+") + "$" + (abs / 1000).toFixed(1) + "k" : (v < 0 ? "-" : "+") + "$" + abs;
  };

  const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];
  const selStyle = { padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${V2.border}`, background: V2.card, color: V2.text, fontSize: 12, cursor: "pointer", outline: "none", fontWeight: 500 };
  const navBtnStyle = { padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${V2.border}`, background: V2.card, color: V2.text2, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", fontWeight: 600, outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <button onClick={handlePrevMonth} style={navBtnStyle} title="Mes anterior">◀</button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={mo} onChange={(e) => handleMonthSelect(parseInt(e.target.value))} style={selStyle}>
            {V2_MFULL.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
          </select>
          <select value={year} onChange={(e) => handleYearSelect(parseInt(e.target.value))} style={selStyle}>
            {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={handleNextMonth} style={navBtnStyle} title="Mes siguiente">▶</button>
      </div>

      <div>
          <div className="v2-cal-grid" style={{ marginBottom: 4 }}>
            {/* S y D también atenuados: la cabecera no puede gritar más que las
                celdas que etiqueta. El ámbar del domingo venía de cuando había una
                columna SEMANA que marcar, y ya no existe. */}
            {dayLabels.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 500, color: V2.text3, opacity: i >= 5 ? 0.55 : 1, padding: "2px 0" }}>{d}</div>
            ))}
          </div>
          <div className="v2-cal-grid">
            {weeks.map((week, wIdx) => {
              let weekPnl = 0, weekTrades = 0, weekDays = 0;
              week.forEach(day => {
                if (day.type === "day" && day.info) {
                  weekPnl += day.info.pnl;
                  weekTrades += day.info.count;
                  if (day.info.count > 0) weekDays++;
                }
              });
              const hasData = weekTrades > 0;
              const weekBg = hasData ? (weekPnl >= 0 ? "rgba(78,204,163,0.10)" : "rgba(232,83,110,0.10)") : V2.segBg;
              const weekBorder = hasData ? (weekPnl >= 0 ? "rgba(78,204,163,0.35)" : "rgba(232,83,110,0.35)") : V2.border;
              const weekCol = weekPnl >= 0 ? V2.green : V2.red;

              return (
                <Fragment key={wIdx}>
                  {week.map((c, dIdx) => {
                    if (c.type === "empty") return <div key={`e-${wIdx}-${dIdx}`} style={{ background: "transparent", minHeight: 50 }} />;
                    const { info } = c;
                    // Sábado y domingo sin operativa se hunden en vez de teñirse: el
                    // verde y el rojo son del PnL, y un cuarto color en celdas que no
                    // dicen nada competiría con lo único que hay que leer. Si un fin
                    // de semana llegara a tener registro, manda el dato.
                    const finde = c.dow >= 5 && !info;
                    const bg = info ? (info.pnl > 0 ? "rgba(78,204,163,0.16)" : info.pnl < 0 ? "rgba(232,83,110,0.16)" : V2.segBg) : (finde ? V2.bg : V2.segBg);
                    const col = info ? (info.pnl > 0 ? V2.green : info.pnl < 0 ? V2.red : V2.text2) : V2.text3;
                    const border = info ? (info.pnl > 0 ? "rgba(78,204,163,0.4)" : info.pnl < 0 ? "rgba(232,83,110,0.4)" : V2.border) : (finde ? "#1B1B1B" : V2.border);
                    return (
                      <div key={`d-${c.d}`} style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 5, padding: "4px 3px", minHeight: 50, overflow: "hidden" }}>
                        <div style={{ fontSize: 10, color: finde ? V2.text3 : V2.text2, fontWeight: 500, opacity: finde ? 0.55 : 1 }}>{c.d}</div>
                        {info && <div className="v2-cal-pnl" style={{ fontWeight: 600, color: col, whiteSpace: "nowrap" }}>{fmtPnl(info.pnl)}</div>}
                        {info && info.count > 1 && <div style={{ fontSize: 9, color: V2.text3 }}>{info.count}t</div>}
                      </div>
                    );
                  })}
                  {/* Total de la semana a todo lo ancho. Las semanas sin operar no
                      lo pintan: solo añadían filas vacías al alto de la tarjeta. */}
                  {hasData && (
                    <div key={`w-${wIdx}`} className="v2-cal-week" style={{ background: weekBg, border: `0.5px solid ${weekBorder}`, borderRadius: 6, padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 11, color: V2.text2, fontWeight: 500 }}>Total semana</span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 9, color: V2.text3 }}>{weekTrades}t · {weekDays}d</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: weekCol, fontVariantNumeric: "tabular-nums" }}>{fmtPnl(weekPnl)}</span>
                      </span>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 6 }}>Resumen del mes</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[
            { label: "PnL del Mes", value: monthStats.pnl, pos: monthStats.pnl >= 0 },
            { label: "Ganado", value: monthStats.win, pos: true },
            { label: "Perdido", value: monthStats.lose, pos: false },
          ].map(card => (
            <div key={card.label} style={{ background: card.pos ? "rgba(78,204,163,0.14)" : "rgba(232,83,110,0.14)", border: `0.5px solid ${card.pos ? "rgba(78,204,163,0.4)" : "rgba(232,83,110,0.4)"}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 9, color: card.pos ? V2.green : V2.red, opacity: 0.85, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>{card.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: card.pos ? V2.green : V2.red, fontVariantNumeric: "tabular-nums" }}>{fmt(card.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {calStats.global.days > 0 && (
        <div style={{ marginTop: 14, background: V2.bg, borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".7px" }}>Global · Desde el primer trade</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 0", marginTop: 8 }}>
            <div style={{ paddingRight: 22 }}>
              <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: calStats.global.pnl >= 0 ? V2.green : V2.red }}>{fmt(Math.round(calStats.global.pnl))}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>PnL Total</div>
            </div>
            <div style={{ padding: "0 22px", borderLeft: `1px solid ${V2.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: V2.text }}>
                {calStats.global.winDays + calStats.global.loseDays > 0 ? `${Math.round((calStats.global.winDays / (calStats.global.winDays + calStats.global.loseDays)) * 100)}%` : "—"}
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>Win rate</div>
            </div>
            <div style={{ padding: "0 22px", borderLeft: `1px solid ${V2.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: V2.green, opacity: 0.9 }}>{fmt(Math.round(calStats.global.win))}</div>
              <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: V2.red, opacity: 0.9 }}>{fmt(Math.round(calStats.global.lose))}</div>
            </div>
            <div style={{ padding: "0 22px", borderLeft: `1px solid ${V2.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: V2.text3 }}>-${Math.round(calStats.global.comm).toLocaleString()}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>Comisiones</div>
            </div>
            <div style={{ paddingLeft: 22, borderLeft: `1px solid ${V2.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: V2.text }}>{calStats.global.days} días</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".3px", marginTop: 2 }}>
                {calStats.global.first && calStats.global.last
                  ? `${V2_MFULL[parseInt(calStats.global.first.slice(5, 7)) - 1].slice(0, 3)} ${calStats.global.first.slice(0, 4)} – ${V2_MFULL[parseInt(calStats.global.last.slice(5, 7)) - 1].slice(0, 3)} ${calStats.global.last.slice(0, 4)}`
                  : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {calStats.months.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 4 }}>Historial mensual</div>
          <div className="cal-hist-row" style={{ padding: "4px 8px" }}>
            {["Mes", "PnL", "W/L", "Win rate", "Comisiones"].map((h, i) => (
              <div key={h} className={i >= 3 ? "cal-hist-hide-sm" : undefined} style={{ fontSize: 10, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".7px", textAlign: i === 0 ? "left" : "right" }}>{h}</div>
            ))}
          </div>
          {(() => {
            const rows = [];
            let lastYear = null;
            calStats.months.forEach(([ym, m]) => {
              const y = ym.slice(0, 4);
              if (calStats.multiYear && y !== lastYear) {
                const yearPnl = calStats.months.filter(([k]) => k.startsWith(y)).reduce((s, [, v]) => s + v.pnl, 0);
                rows.push(
                  <div key={`y-${y}`} className="cal-hist-row" style={{ padding: "5px 8px", background: V2.bg, borderRadius: 6, marginTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: V2.text3, textTransform: "uppercase", letterSpacing: ".7px" }}>{y}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right", color: yearPnl >= 0 ? V2.green : V2.red }}>{fmt(Math.round(yearPnl))}</div>
                    <div /><div className="cal-hist-hide-sm" /><div className="cal-hist-hide-sm" />
                  </div>
                );
                lastYear = y;
              }
              const active = ym === currentMonth;
              const wr = m.winDays + m.loseDays > 0 ? Math.round((m.winDays / (m.winDays + m.loseDays)) * 100) : null;
              const monthLabel = `${V2_MFULL[parseInt(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
              rows.push(
                <div
                  key={ym}
                  className="cal-hist-row"
                  onClick={() => setCurrentMonth(ym)}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = V2.segActive; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  style={{
                    padding: "7px 8px", borderBottom: `0.5px solid ${V2.border}`, borderRadius: 6, cursor: "pointer",
                    background: active ? V2.segActive : "transparent", transition: "background-color 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? V2.text : V2.text2, display: "flex", alignItems: "center", gap: 6 }}>
                    {active && <span style={{ width: 5, height: 5, borderRadius: "50%", background: V2.green, display: "inline-block", flexShrink: 0 }} />}
                    {monthLabel}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", textAlign: "right", color: m.pnl >= 0 ? V2.green : V2.red }}>{fmt(Math.round(m.pnl))}</div>
                  <div style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", textAlign: "right", color: V2.text2 }}>{m.winDays}/{m.loseDays}</div>
                  <div className="cal-hist-hide-sm" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", textAlign: "right", color: V2.text2 }}>{wr !== null ? `${wr}%` : "—"}</div>
                  <div className="cal-hist-hide-sm" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", textAlign: "right", color: V2.text3 }}>-${Math.round(m.comm).toLocaleString()}</div>
                </div>
              );
            });
            return rows;
          })()}
        </div>
      )}
    </div>
  );
}

function V2Seg({ value, onChange }) {
  return (
    <div style={{ display: "flex", background: V2.segBg, borderRadius: 10, padding: 4, gap: 2 }}>
      {V2_PERIODS.map(p => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            style={{
              flex: 1, padding: "8px 4px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: on ? 600 : 400,
              background: on ? V2.segActive : "transparent",
              color: on ? V2.text : V2.text3,
            }}
          >{p.label}</button>
        );
      })}
    </div>
  );
}

const IconWide = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M9 7 4.5 12 9 17M15 7l4.5 5-4.5 5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.5 12h15" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const IconHalf = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6.5 7 11 12l-4.5 5M17.5 7 13 12l4.5 5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 4v16" stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.5" /></svg>
);
const IconUp = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 19V6M6 12l6-6 6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconDown = ({ s = 15, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 5v13M6 12l6 6 6-6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function V2Card({ title, subtitle, info, wide, onRemove, onToggleWide, onUp, onDown, canUp, canDown, period, onPeriod, rangeLabel, onPrevRange, onNextRange, canNextRange, footer, children }) {
  return (
    <div className={`v2-card${wide ? " v2-wide" : ""}`} style={{
      background: V2.card, border: `1px solid ${V2.border}`, borderRadius: 14,
      display: "flex", flexDirection: "column",
    }}>
      <div className="v2-card-hd" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span
          title={typeof title === "string" ? title : undefined}
          style={{
            fontSize: 19, fontWeight: 500, color: V2.text, letterSpacing: "-0.01em",
            minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {title}{subtitle && <span style={{ color: V2.text3 }}> ({subtitle})</span>}
        </span>
        <div style={{ display: "flex", gap: 9, flexShrink: 0, alignItems: "center" }}>
          <button onClick={onUp} disabled={!canUp} title="Subir" style={{ background: "none", border: "none", padding: 0, cursor: canUp ? "pointer" : "default", opacity: canUp ? 1 : 0.28, display: "flex" }}><IconUp c={V2.text3} /></button>
          <button onClick={onDown} disabled={!canDown} title="Bajar" style={{ background: "none", border: "none", padding: 0, cursor: canDown ? "pointer" : "default", opacity: canDown ? 1 : 0.28, display: "flex" }}><IconDown c={V2.text3} /></button>
          <span title={info} style={{ cursor: "help", display: "flex" }}><IconInfo c={V2.text3} /></span>
          <button onClick={onToggleWide} title={wide ? "Media anchura" : "Anchura completa"} aria-pressed={wide} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>{wide ? <IconHalf c={V2.text3} /> : <IconWide c={V2.text3} />}</button>
          <button onClick={onRemove} title="Quitar tarjeta" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}><IconTrash c={V2.text3} /></button>
        </div>
      </div>

      {rangeLabel && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 14 }}>
          <button onClick={onPrevRange} title="Periodo anterior" style={{ background: "none", border: "none", padding: 2, cursor: "pointer", display: "flex", color: V2.text3 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke={V2.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span style={{ fontSize: 13, color: V2.text2, fontWeight: 500, minWidth: 140, textAlign: "center" }}>{rangeLabel}</span>
          <button onClick={onNextRange} disabled={!canNextRange} title="Periodo siguiente" style={{ background: "none", border: "none", padding: 2, cursor: canNextRange ? "pointer" : "default", opacity: canNextRange ? 1 : 0.28, display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={V2.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      )}

      <div style={{ flex: 1 }}>{children}</div>

      {period && (
        <div style={{ marginTop: 20 }}>
          <V2Seg value={period} onChange={onPeriod} />
        </div>
      )}
      {footer && (
        <div style={{ marginTop: 16, fontSize: 14, color: V2.text3, lineHeight: 1.5 }}>{footer}</div>
      )}
    </div>
  );
}

function V2Metric({ value, deltaPct, up, compare }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="v2-metric" style={{ fontWeight: 700, color: V2.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</span>
        {deltaPct !== null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 16, fontWeight: 500, color: up ? V2.green : V2.red }}>
            <IconArrow up={up} c={up ? V2.green : V2.red} />{Math.abs(deltaPct)}%
          </span>
        )}
      </div>
      {compare && <div style={{ marginTop: 14, fontSize: 14, color: V2.text3 }}>{compare}</div>}
    </div>
  );
}

// ── Definición de tarjetas ───────────────────────────────────────────────────
const V2_CARD_DEFS = [
  { id: "equity", title: "Equity curve", tall: true, info: "Evolución acumulada del PnL, día a día, de la cuenta seleccionada." },
  { id: "winRatio", title: "% de acierto", tall: true, info: "Porcentaje de días ganadores sobre días operados." },
  { id: "portfolio", title: "Balance", tall: false, info: "Saldo actual según el cierre del último día registrado." },
  { id: "profitFactor", title: "Profit factor", tall: false, info: "Ganancia bruta dividida entre pérdida bruta." },
  { id: "phase", title: "Fase del plan", tall: true, info: "Colchón hasta el umbral de liquidación de la cuenta más ajustada." },
  { id: "records", title: "Récords", tall: true, info: "Mejor y peor día operado, y las mayores rachas de días consecutivos ganando y perdiendo." },
];

// Composición inicial de cada hoja. A partir de aquí manda lo que el usuario
// haya ordenado, que se guarda en el navegador.
const V2_DEFAULT_LAYOUT = {
  dashboard: V2_CARD_DEFS.map(c => c.id),
};

// Barrido continuo menta → lima → ámbar → carmín: empieza en el verde de acento
// de la app y acaba en su rojo, así los tonos intermedios del arrastre no
// pasan por ningún gris sucio.
const V2_NAV = [
  { id: "dashboard", label: "Dashboard", Icon: IconGrid, accent: "#4ECCA3" },
  { id: "trades", label: "Trades", Icon: IconDoc, accent: "#E2B144" },
  { id: "calendar", label: "Calendario", Icon: IconCal, accent: "#E8536E" },
  { id: "settings", label: "Ajustes", Icon: IconGear, accent: "#A78BFA" },
];

// ── Menú inferior "Meniscus" ────────────────────────────────────────────────
// La bola vive SOBRE el borde superior de la barra: barra y bola son un único
// path y la superficie sube a buscarla con un filete cóncavo (el menisco).
// Toda la animación va por refs + rAF, fuera del ciclo de render de React.
// El SVG escala con el ancho de pantalla, así que una barra muy alargada se
// encoge demasiado en el móvil: con la geometría de escritorio los iconos
// quedaban a 13px y las etiquetas a 6px. En móvil se usa una barra más corta
// y proporcionalmente más alta para que todo se lea.
const MN_DESKTOP = {
  W: 1000, H: 147, CR: 34,
  R_REST: 54, R_DRAG: 64, F_RATIO: 0.6,
  ICON_Y: 73, LABEL_Y: 120, PITCH: 190, ICON_SIZE: 42, LABEL_SIZE: 20,
  VB: { x: -60, y: -130, w: 1120, h: 280 },
};
const MN_MOBILE = {
  W: 760, H: 172, CR: 30,
  R_REST: 58, R_DRAG: 68, F_RATIO: 0.6,
  ICON_Y: 84, LABEL_Y: 136, PITCH: 160, ICON_SIZE: 54, LABEL_SIZE: 28,
  VB: { x: -50, y: -145, w: 860, h: 320 },
};
const mnSlots = (G) => {
  const pad = (G.W - G.PITCH * (V2_NAV.length - 1)) / 2;
  return V2_NAV.map((_, i) => pad + i * G.PITCH);
};

const mnHexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mnRgbStr = (c) => `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
const mnMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mnClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mnSmooth = (e0, e1, x) => { const t = mnClamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const MN_ACCENTS = V2_NAV.map(t => mnHexToRgb(t.accent));
const MN_ICON_IDLE = [255, 255, 255];

// Silueta única: barra + filete cóncavo + lomo de la bola
function mnBuildPath(cx, r, G) {
  const { W, H, CR, F_RATIO } = G;
  const f = F_RATIO * r;
  const dx = Math.sqrt(r * r + 2 * r * f);
  const tx = dx * (r / (r + f));
  const ty = -r * f / (r + f);
  const lBase = cx - dx, rBase = cx + dx;
  const lTan = cx - tx, rTan = cx + tx;
  return [
    `M ${CR} 0`,
    `H ${lBase.toFixed(2)}`,
    `A ${f.toFixed(2)} ${f.toFixed(2)} 0 0 0 ${lTan.toFixed(2)} ${ty.toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${rTan.toFixed(2)} ${ty.toFixed(2)}`,
    `A ${f.toFixed(2)} ${f.toFixed(2)} 0 0 0 ${rBase.toFixed(2)} 0`,
    `H ${W - CR}`,
    `A ${CR} ${CR} 0 0 1 ${W} ${CR}`,
    `V ${H - CR}`,
    `A ${CR} ${CR} 0 0 1 ${W - CR} ${H}`,
    `H ${CR}`,
    `A ${CR} ${CR} 0 0 1 0 ${H - CR}`,
    `V ${CR}`,
    `A ${CR} ${CR} 0 0 1 ${CR} 0`,
    "Z",
  ].join(" ");
}

// Iconos en currentColor: el bucle de animación interpola su color entre el
// gris de la barra y el fondo oscuro conforme el icono entra en la bola.
const MN_ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor" /><rect x="14" y="3" width="7" height="4" rx="2" fill="currentColor" /><rect x="14" y="10" width="7" height="11" rx="2" fill="currentColor" /><rect x="3" y="13" width="7" height="8" rx="2" fill="currentColor" /></>,
  trades: <><rect x="4" y="3" width="16" height="18" rx="3" fill="currentColor" opacity="0.35" /><rect x="7" y="7" width="10" height="2" rx="1" fill="currentColor" /><rect x="7" y="11" width="10" height="2" rx="1" fill="currentColor" /><rect x="7" y="15" width="6" height="2" rx="1" fill="currentColor" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" fill="currentColor" opacity="0.35" /><rect x="3" y="5" width="18" height="5" rx="2" fill="currentColor" /><rect x="7" y="2" width="2" height="5" rx="1" fill="currentColor" /><rect x="15" y="2" width="2" height="5" rx="1" fill="currentColor" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2.4v2.4M12 19.2v2.4M21.6 12h-2.4M4.8 12H2.4M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7M18.8 18.8l-1.7-1.7M6.9 6.9 5.2 5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
};

function V2MeniscusNav({ active, onChange }) {
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const beadRef = useRef(null);
  const beadHitRef = useRef(null);
  const sheenRef = useRef(null);
  const iconRefs = useRef([]);
  const labelRefs = useRef([]);

  // Geometría según el ancho: el bucle de animación la lee por ref para no
  // recrearse en cada cambio.
  const [G, setG] = useState(MN_DESKTOP);
  const gRef = useRef(MN_DESKTOP);
  gRef.current = G;
  const SLOTS = mnSlots(G);
  const slotsRef = useRef(SLOTS);
  slotsRef.current = SLOTS;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setG(mq.matches ? MN_MOBILE : MN_DESKTOP);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const activeIdx = Math.max(0, V2_NAV.findIndex(n => n.id === active));
  const activeRef = useRef(activeIdx);
  activeRef.current = activeIdx;

  const st = useRef({
    x: mnSlots(MN_DESKTOP)[activeIdx], v: 0, target: mnSlots(MN_DESKTOP)[activeIdx],
    settle: 1, settleV: 0, color: MN_ACCENTS[activeIdx].slice(),
    dragging: false, lastX: 0, lastT: 0, reduced: false,
  });

  // Un cambio de sección desde fuera (o por tap) mueve el objetivo del muelle
  useEffect(() => { st.current.target = slotsRef.current[activeIdx]; }, [activeIdx, G]);

  const toLocal = useCallback((clientX) => {
    const rect = svgRef.current.getBoundingClientRect();
    const g = gRef.current;
    return g.VB.x + ((clientX - rect.left) / rect.width) * g.VB.w;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    st.current.reduced = mq.matches;
    const onMq = (e) => { st.current.reduced = e.matches; };
    mq.addEventListener?.("change", onMq);

    let raf, last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const s = st.current;

      if (!s.dragging) {
        if (s.reduced) { s.x += (s.target - s.x) * Math.min(1, dt * 12); s.v = 0; }
        else { const a = -300 * (s.x - s.target) - 28 * s.v; s.v += a * dt; s.x += s.v * dt; }
      }

      const parked = !s.dragging && Math.abs(s.x - s.target) < 2 && Math.abs(s.v) < 40;
      const settleT = parked ? 1 : 0;
      if (s.reduced) s.settle += (settleT - s.settle) * Math.min(1, dt * 14);
      else { const aa = -340 * (s.settle - settleT) - 36 * s.settleV; s.settleV += aa * dt; s.settle += s.settleV * dt; }
      s.settle = mnClamp(s.settle, 0, 1);

      // El color se toma de la POSICIÓN de la bola, no de la pestaña activa
      const g = gRef.current, sl = slotsRef.current;
      const p = mnClamp((s.x - sl[0]) / g.PITCH, 0, V2_NAV.length - 1);
      const i0 = Math.min(Math.floor(p), V2_NAV.length - 2);
      s.color = mnMix(s.color, mnMix(MN_ACCENTS[i0], MN_ACCENTS[i0 + 1], p - i0), Math.min(1, dt * 14));

      const r = g.R_DRAG + (g.R_REST - g.R_DRAG) * s.settle;
      const col = mnRgbStr(s.color);

      if (!pathRef.current) { raf = requestAnimationFrame(frame); return; }
      pathRef.current.setAttribute("d", mnBuildPath(s.x, r, g));
      beadRef.current.setAttribute("cx", s.x);
      beadRef.current.setAttribute("r", r - 1);
      beadRef.current.setAttribute("fill", col);
      beadHitRef.current.setAttribute("cx", s.x);
      sheenRef.current.setAttribute("cx", s.x);
      sheenRef.current.setAttribute("r", r - 1);

      for (let i = 0; i < V2_NAV.length; i++) {
        const t = i === activeRef.current ? s.settle : 0;
        const el = iconRefs.current[i];
        if (!el) continue;
        el.setAttribute("transform", `translate(${sl[i]} ${(g.ICON_Y * (1 - t)).toFixed(2)}) scale(${(1 + 0.06 * t).toFixed(3)})`);
        const ct = mnSmooth(0.45, 1, t);
        el.style.color = mnRgbStr(mnMix(MN_ICON_IDLE, mnHexToRgb(V2.bg), ct));
        el.style.opacity = String(0.5 + 0.5 * ct);
        const lb = labelRefs.current[i];
        if (lb) {
          lb.setAttribute("opacity", i === activeRef.current ? s.settle.toFixed(3) : "0");
          lb.setAttribute("fill", col);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); mq.removeEventListener?.("change", onMq); };
  }, []);

  const onDown = (e) => {
    e.preventDefault();
    const s = st.current;
    s.dragging = true;
    s.lastX = toLocal(e.clientX);
    s.lastT = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    const sl = slotsRef.current;
    const nx = mnClamp(toLocal(e.clientX), sl[0], sl[sl.length - 1]);
    const now = performance.now();
    const dt = Math.max((now - s.lastT) / 1000, 1 / 240);
    s.v = (nx - s.lastX) / dt;
    s.x = nx; s.lastX = nx; s.lastT = now;
  };
  const onUp = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // flick: proyecta la velocidad antes de buscar el slot más cercano
    const proj = s.x + mnClamp(s.v, -3000, 3000) * 0.11;
    let best = 0, bd = Infinity;
    slotsRef.current.forEach((sx, i) => { const d = Math.abs(sx - proj); if (d < bd) { bd = d; best = i; } });
    s.target = slotsRef.current[best];
    onChange(V2_NAV[best].id); // el título conmuta AL SOLTAR, no al cruzar
  };

  const onKeyDown = (e) => {
    const go = (i) => { e.preventDefault(); onChange(V2_NAV[mnClamp(i, 0, V2_NAV.length - 1)].id); };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") go(activeIdx + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(activeIdx - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(V2_NAV.length - 1);
  };

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 900,
      display: "flex", justifyContent: "center",
      // Se respeta la barra de gestos, pero sin duplicarla con separación
      // extra: antes la barra quedaba a 47px del borde y ahora a 21px.
      padding: "0 12px calc(env(safe-area-inset-bottom, 0px) * 0.45 + 4px)",
      pointerEvents: "none",
    }}>
      <svg
        ref={svgRef}
        className="mn-nav"
        viewBox={`${G.VB.x} ${G.VB.y} ${G.VB.w} ${G.VB.h}`}
        style={{ width: "100%", maxWidth: 720, aspectRatio: `${G.VB.w} / ${G.VB.h}`, touchAction: "none", overflow: "visible" }}
        role="tablist"
        aria-label="Secciones"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <defs>
          <linearGradient id="mn-sheen" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path ref={pathRef} d={mnBuildPath(SLOTS[activeIdx], G.R_REST, G)}
          fill="rgba(12,12,14,0.86)" stroke="rgba(255,255,255,0.13)" strokeWidth="1.6"
          style={{ pointerEvents: "auto" }} />

        <circle ref={beadRef} cx={SLOTS[activeIdx]} cy={0} r={G.R_REST - 1} fill={V2_NAV[activeIdx].accent} pointerEvents="none" />
        <circle ref={sheenRef} cx={SLOTS[activeIdx]} cy={0} r={G.R_REST - 1} fill="url(#mn-sheen)" pointerEvents="none" />

        {V2_NAV.map((t, i) => (
          <rect key={`hit${t.id}`} role="tab" aria-selected={i === activeIdx} aria-label={t.label}
            x={SLOTS[i] - G.PITCH / 2} y={0} width={G.PITCH} height={G.H}
            fill="transparent" style={{ cursor: "pointer", pointerEvents: "auto" }}
            onClick={() => onChange(t.id)} />
        ))}

        {V2_NAV.map((t, i) => (
          <g key={`ic${t.id}`} ref={el => (iconRefs.current[i] = el)}
            transform={`translate(${SLOTS[i]} ${G.ICON_Y})`}
            style={{ color: "#fff", opacity: 0.5 }} pointerEvents="none">
            <svg x={-G.ICON_SIZE / 2} y={-G.ICON_SIZE / 2} width={G.ICON_SIZE} height={G.ICON_SIZE} viewBox="0 0 24 24">{MN_ICON_PATHS[t.id]}</svg>
          </g>
        ))}

        {V2_NAV.map((t, i) => (
          <text key={`lb${t.id}`} ref={el => (labelRefs.current[i] = el)}
            x={SLOTS[i]} y={G.LABEL_Y} textAnchor="middle" fontSize={G.LABEL_SIZE} fontWeight="700"
            fill={t.accent} opacity="0" pointerEvents="none">{t.label}</text>
        ))}

        <circle ref={beadHitRef} cx={SLOTS[activeIdx]} cy={0} r={G.R_DRAG + 14}
          fill="transparent" style={{ cursor: "grab", touchAction: "none", pointerEvents: "auto" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </svg>
    </div>
  );
}

// Mismos valores que la clase .v2-settings de globals.css, en línea para que
// el recoloreado no dependa de que el navegador tenga el CSS más reciente.
const V2_SETTINGS_VARS = {
  colorScheme: "dark",
  "--color-background-primary": V2.card,
  "--color-background-secondary": V2.segBg,
  "--color-text-primary": V2.text,
  "--color-text-secondary": V2.text2,
  "--color-text-tertiary": V2.text3,
  "--color-border-secondary": V2.border,
  "--color-border-tertiary": V2.border,
  "--c-green": V2.green,
  "--c-red": V2.red,
  "--c-blue": "#5AA9E6",
  "--c-amber": "#E2B144",
  "--c-gray": V2.text3,
  "--c-green-bg": "rgba(78,204,163,0.16)",
  "--c-red-bg": "rgba(232,83,110,0.16)",
  "--c-blue-bg": "rgba(90,169,230,0.16)",
  "--c-green-text": V2.green,
  "--c-red-text": V2.red,
  "--c-blue-text": "#5AA9E6",
};

function DashboardV2({
  trades, accountsList, onExit, onRefresh, deployId,
  addingTrade, setAddingTrade, editingTrade, setEditingTrade,
  deleteConfirm, setDeleteConfirm, saveTrade, deleteTrade,
  activeAccountsForForm, allAccountsForForm, settingsPanel,
}) {
  const [nav, setNav] = useState("dashboard");
  // Cada hoja guarda su propio orden de tarjetas. `seen` registra los tipos ya
  // conocidos: así una tarjeta nueva de la app aparece sola, pero una que el
  // usuario quitó a mano no reaparece en el siguiente arranque.
  const [layout, setLayout] = useState(V2_DEFAULT_LAYOUT);
  const [widths, setWidths] = useState({});
  const [periods, setPeriods] = useState({});
  const [picker, setPicker] = useState(false);
  const [acct, setAcct] = useState("all");
  const [showClosed, setShowClosed] = useState(false);
  const [tradePage, setTradePage] = useState(1);
  useEffect(() => { setTradePage(1); }, [acct]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tj_v2_layout");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      const seen = Array.isArray(saved.seen) ? saved.seen : [];
      const nuevas = V2_CARD_DEFS.filter(c => !seen.includes(c.id)).map(c => c.id);
      const next = {};
      Object.keys(V2_DEFAULT_LAYOUT).forEach(sec => {
        const guardado = Array.isArray(saved.layout?.[sec])
          ? saved.layout[sec].filter(id => V2_CARD_DEFS.some(c => c.id === id))
          : V2_DEFAULT_LAYOUT[sec];
        // Las tarjetas que la app ha añadido desde la última visita se suman
        const añadir = nuevas.filter(id => V2_DEFAULT_LAYOUT[sec].includes(id) && !guardado.includes(id));
        next[sec] = [...guardado, ...añadir];
      });
      setLayout(next);
      if (saved.widths && typeof saved.widths === "object") setWidths(saved.widths);
    } catch (e) { /* sin preferencia guardada */ }
  }, []);

  const guardar = (nextLayout, nextWidths) => {
    setLayout(nextLayout); setWidths(nextWidths);
    try {
      localStorage.setItem("tj_v2_layout", JSON.stringify({
        layout: nextLayout, widths: nextWidths, seen: V2_CARD_DEFS.map(c => c.id),
      }));
    } catch (e) { /* almacenamiento no disponible */ }
  };
  const persist = (sec, lista) => guardar({ ...layout, [sec]: lista }, widths);
  const cardsOf = (sec) => layout[sec] || [];

  // Ancho elegido por tarjeta. Por defecto, gráficos y donuts a fila completa
  // y las de una sola cifra a media.
  const anchoDe = (id) => widths[id] ?? (V2_CARD_DEFS.find(c => c.id === id)?.tall ? "full" : "half");
  const toggleAncho = (id) => guardar(layout, { ...widths, [id]: anchoDe(id) === "full" ? "half" : "full" });

  // Una tarjeta a media anchura sin pareja detrás se estira a fila completa,
  // para no dejar medio hueco vacío.
  const anchosEfectivos = (lista) => {
    const out = []; let i = 0;
    while (i < lista.length) {
      if (anchoDe(lista[i]) === "full") { out[i] = true; i++; continue; }
      if (i + 1 < lista.length && anchoDe(lista[i + 1]) !== "full") { out[i] = false; out[i + 1] = false; i += 2; }
      else { out[i] = true; i++; }
    }
    return out;
  };
  const removeCard = (sec, id) => persist(sec, cardsOf(sec).filter(c => c !== id));
  const toggleCard = (sec, id) => persist(sec, cardsOf(sec).includes(id) ? cardsOf(sec).filter(c => c !== id) : [...cardsOf(sec), id]);
  const moveCard = (sec, id, dir) => {
    const lista = cardsOf(sec);
    const i = lista.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const next = [...lista];
    [next[i], next[j]] = [next[j], next[i]];
    persist(sec, next);
  };
  const periodOf = (id) => periods[id] || "month";
  // Cambiar de Year/Month/Week/Day vuelve siempre al periodo actual (offset 0)
  const setPeriod = (id, v) => { setPeriods(p => ({ ...p, [id]: v })); setOffsets(o => ({ ...o, [id]: 0 })); };
  const [offsets, setOffsets] = useState({});
  const offsetOf = (id) => offsets[id] || 0;
  const shiftOffset = (id, dir) => setOffsets(o => ({ ...o, [id]: Math.min(0, (o[id] || 0) + dir) }));

  // Una sola cuenta a la vez (o todas). Los ajustes de bróker no cuentan.
  // Las cuentas cerradas quedan fuera salvo que se activen con el
  // botón de la llama. Antes se ocultaban del selector pero sus trades seguían
  // sumando en el agregado de "Todas las cuentas".
  const isRetired = (a) => isClosedAcct(a);
  const visibleAccounts = accountsList.filter(a => showClosed || !isRetired(a));
  const visibleNames = new Set(visibleAccounts.map(a => a.name));
  const retiredCount = accountsList.filter(isRetired).length;

  const scoped = trades.filter(t =>
    t.instrument !== "Ajuste de Broker" &&
    (acct === "all" ? visibleNames.has(t.account) : t.account === acct)
  );
  const days = v2Agg(scoped);
  const anchor = days.length ? days[days.length - 1][0] : v2LocalIso(new Date());

  const statsFor = (id) => {
    const period = periodOf(id);
    const offset = offsetOf(id);
    const ranges = v2Ranges(period, anchor, offset);
    return {
      cur: v2Slice(days, ranges.cur),
      prev: v2Slice(days, ranges.prev),
      rangeLabel: v2RangeLabel(period, ranges.cur[0]),
      onPrevRange: () => shiftOffset(id, -1),
      onNextRange: () => shiftOffset(id, 1),
      canNextRange: offset < 0,
    };
  };

  // Serie mensual para barras y líneas

  // Al elegir una cuenta, Portfolio y Fase se acotan a ella
  const liveAccounts = visibleAccounts.filter(a => acct === "all" || a.name === acct);
  const phases = liveAccounts.map(a => {
    const { cushion, basis } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
    return { account: a, cushion, basis, phase: getPhase(cushion) };
  }).filter(p => p.phase);
  const tightest = phases.length ? phases.reduce((m, p) => (p.cushion < m.cushion ? p : m)) : null;

  // Récords: mejor/peor día operado y rachas máximas de días consecutivos
  // ganando/perdiendo. Un día en 0 rompe ambas rachas sin extenderlas.
  const records = (() => {
    let bestDay = null, worstDay = null;
    let curW = 0, curL = 0, maxW = 0, maxL = 0;
    days.forEach(([d, v]) => {
      if (!bestDay || v.pnl > bestDay.pnl) bestDay = { date: d, pnl: v.pnl };
      if (!worstDay || v.pnl < worstDay.pnl) worstDay = { date: d, pnl: v.pnl };
      if (v.pnl > 0) { curW++; curL = 0; }
      else if (v.pnl < 0) { curL++; curW = 0; }
      else { curW = 0; curL = 0; }
      maxW = Math.max(maxW, curW);
      maxL = Math.max(maxL, curL);
    });
    return { bestDay, worstDay, maxWinStreak: maxW, maxLoseStreak: maxL };
  })();

  const delta = (c, p) => (p ? Math.round(((c - p) / Math.abs(p)) * 100) : null);
  const periodWord = { year: "año", month: "mes", week: "semana", day: "día" };
  const periodArticle = { year: "el", month: "el", week: "la", day: "el" }; // "semana" es femenino

  // `sec` es la hoja en la que se pinta: cada una guarda su propio orden
  const renderCard = (id, sec = "dashboard", wide) => {
    const def = V2_CARD_DEFS.find(c => c.id === id);
    if (!def) return null;
    const lista = cardsOf(sec);
    const pos = lista.indexOf(id);
    const common = {
      title: def.title, subtitle: def.subtitle, info: def.info,
      wide: wide ?? (anchoDe(id) === "full"),
      onRemove: () => removeCard(sec, id), onToggleWide: () => toggleAncho(id),
      onUp: () => moveCard(sec, id, -1), onDown: () => moveCard(sec, id, 1),
      canUp: pos > 0, canDown: pos >= 0 && pos < lista.length - 1,
    };
    const { cur, prev, rangeLabel, onPrevRange, onNextRange, canNextRange } = statsFor(id);
    const rangeNav = { rangeLabel, onPrevRange, onNextRange, canNextRange };
    const pw = periodWord[periodOf(id)];
    const pa = periodArticle[periodOf(id)];

    if (id === "equity") {
      return (
        <V2Card key={id} {...common}
          footer={
            // Las tres claves caben en una sola línea a 12px: con la del footer
            // (14px) la de liquidación se caía a una segunda fila en móvil.
            <div style={{ display: "flex", gap: 12, flexWrap: "nowrap", fontSize: 12, whiteSpace: "nowrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: V2.green, display: "inline-block" }} />Zona positiva</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: V2.red, display: "inline-block" }} />Zona negativa</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: "rgba(232,83,110,0.16)", borderTop: `2px solid ${V2.red}`, display: "inline-block" }} />Liquidación</span>
            </div>
          }>
          <V2Equity trades={scoped} accountFilter={acct} accountsList={accountsList} />
        </V2Card>
      );
    }

    if (id === "winRatio") {
      // Fusiona el donut de acierto con el total de días operados: son la
      // misma información (ganadores+perdedores=total), separarlas era redundante.
      const diff = Math.round(cur.wr - prev.wr);
      const dDays = delta(cur.days, prev.days);
      return (
        <V2Card key={id} {...common} period={periodOf(id)} onPeriod={v => setPeriod(id, v)} {...rangeNav}
          footer={<>Tu acierto es {diff >= 0 ? "superior" : "inferior"} en <span style={{ color: diff >= 0 ? V2.green : V2.red, fontWeight: 600 }}>{Math.abs(diff)}%</span> frente a <span style={{ color: V2.green, fontWeight: 600 }}>{prev.wins} ganadores</span> / <span style={{ color: V2.text2, fontWeight: 600 }}>{prev.losses} perdedores</span> {pa} {pw} anterior</>}>
          {/* Donut a la izquierda y datos a la derecha, en filas compactas:
              la tarjeta ocupa la mitad de alto que apilándolos. */}
          <div className="v2-split">
            <V2Donut pct={cur.wr} />
            <div className="v2-rows">
              <div className="v2-row">
                <span>Días operados</span>
                <b style={{ color: V2.text }}>
                  {cur.days}
                  {dDays !== null && (
                    <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6, color: dDays >= 0 ? V2.green : V2.red }}>
                      {dDays >= 0 ? "↗" : "↘"}{Math.abs(dDays)}%
                    </span>
                  )}
                </b>
              </div>
              <div className="v2-row"><span>Ganadores</span><b style={{ color: V2.green }}>{cur.wins}</b></div>
              <div className="v2-row"><span>Perdedores</span><b style={{ color: V2.red }}>{cur.losses}</b></div>
            </div>
          </div>
        </V2Card>
      );
    }


    if (id === "phase") {
      const pct = tightest ? Math.min(100, (tightest.cushion / 1000) * 100) : 0;
      return (
        <V2Card key={id} {...common}
          footer={tightest
            ? <>Cuenta más ajustada: <span style={{ color: V2.text2 }}>{tightest.account.name}</span>{tightest.basis && <> · cierre {tightest.basis}</>}</>
            : "Sin umbral de liquidación definido"}>
          <div className="v2-split">
            <V2Donut pct={pct} />
            <div className="v2-rows">
              <div className="v2-row"><span>Colchón</span><b style={{ color: V2.text }}>${tightest ? Math.round(tightest.cushion).toLocaleString() : "—"}</b></div>
              <div className="v2-row">
                <span>Fase {tightest ? tightest.phase.n : "—"}</span>
                <b style={{ color: tightest ? (tightest.phase.n === 3 ? V2.green : tightest.phase.n === 2 ? "#E2B144" : V2.red) : V2.text }}>
                  {tightest ? `${tightest.phase.contracts} MNQ` : "—"}
                </b>
              </div>
              {tightest && (
                <div className="v2-row"><span>SL / TP</span><b style={{ color: V2.text2, fontSize: "0.85em" }}>${tightest.phase.sl} / ${tightest.phase.tp}</b></div>
              )}
            </div>
          </div>
        </V2Card>
      );
    }

    if (id === "records") {
      const rd = records;
      const statBlock = (label, day, pos) => (
        <div style={{ background: pos ? "rgba(78,204,163,0.14)" : "rgba(232,83,110,0.14)", border: `0.5px solid ${pos ? "rgba(78,204,163,0.4)" : "rgba(232,83,110,0.4)"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: pos ? V2.green : V2.red, opacity: 0.85, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: pos ? V2.green : V2.red, fontVariantNumeric: "tabular-nums" }}>{day ? fmt(Math.round(day.pnl)) : "—"}</div>
          <div style={{ fontSize: 11, color: V2.text3, marginTop: 2 }}>{day ? day.date : "Sin datos"}</div>
        </div>
      );
      const streakBlock = (label, n, pos) => (
        <div style={{ background: V2.segBg, border: `0.5px solid ${V2.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: V2.text2, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: pos ? V2.green : V2.red, fontVariantNumeric: "tabular-nums" }}>{n} {n === 1 ? "día" : "días"}</div>
        </div>
      );
      return (
        <V2Card key={id} {...common} footer={<>Histórico completo · {days.length} días operados</>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {statBlock("Mejor día", rd.bestDay, true)}
            {statBlock("Peor día", rd.worstDay, false)}
            {streakBlock("Mejor racha ganando", rd.maxWinStreak, true)}
            {streakBlock("Mejor racha perdiendo", rd.maxLoseStreak, false)}
          </div>
        </V2Card>
      );
    }

    if (id === "portfolio") {
      const rows = liveAccounts.map(a => {
        const { balance, basis } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
        const base = a.startSize ?? a.size;
        return { name: a.name, balance: balance || 0, base, pnl: (balance || 0) - base, basis, status: a.status };
      });

      // Una sola cuenta: cifra grande. Varias: lista con nombre y saldo.
      if (rows.length === 1) {
        const r = rows[0];
        const pct = r.base ? Math.round((r.pnl / r.base) * 100) : null;
        return (
          <V2Card key={id} {...common}
            footer={<>Base ${Math.round(r.base).toLocaleString()} · acumulado <span style={{ color: r.pnl >= 0 ? V2.green : V2.red }}>{fmt(Math.round(r.pnl))}</span>{r.basis && <> · cierre {r.basis}</>}</>}>
            <div style={{ fontSize: 15, color: V2.text2, marginBottom: 8 }}>{r.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="v2-metric" style={{ fontWeight: 700, color: V2.text, letterSpacing: "-0.03em", lineHeight: 1 }}>
                ${Math.round(r.balance).toLocaleString()}
              </span>
              {pct !== null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 16, fontWeight: 500, color: r.pnl >= 0 ? V2.green : V2.red }}>
                  <IconArrow up={r.pnl >= 0} c={r.pnl >= 0 ? V2.green : V2.red} />{Math.abs(pct)}%
                </span>
              )}
            </div>
          </V2Card>
        );
      }

      const total = rows.reduce((s, r) => s + r.balance, 0);
      return (
        <V2Card key={id} {...common}
          footer={<>Total <span style={{ color: V2.text2, fontWeight: 600 }}>${Math.round(total).toLocaleString()}</span> en {rows.length} cuentas</>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.length === 0 && <span style={{ color: V2.text3, fontSize: 14 }}>Sin cuentas activas</span>}
            {rows.map(r => {
              // Cerradas en el mismo rojo que el botón de la llama que las hace
              // aparecer, y con la palabra al lado para no depender del color.
              const retirada = normStatus(r.status) === "CLOSED";
              return (
              <div key={r.name} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: retirada ? V2.red : V2.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  {retirada && (
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: ".3px", color: V2.red, background: "rgba(232,83,110,0.16)", border: `0.5px solid rgba(232,83,110,0.45)`, borderRadius: 4, padding: "1px 4px" }}>
                      CERRADA
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: V2.text, fontVariantNumeric: "tabular-nums" }}>
                    ${Math.round(r.balance).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: r.pnl >= 0 ? V2.green : V2.red, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(Math.round(r.pnl))}
                  </span>
                </span>
              </div>
              );
            })}
          </div>
        </V2Card>
      );
    }

    if (id === "profitFactor") {
      const c = isFinite(cur.pf) ? cur.pf : 0, p = isFinite(prev.pf) ? prev.pf : 0;
      const d = p ? Math.round(((c - p) / p) * 100) : null;
      return (
        <V2Card key={id} {...common} period={periodOf(id)} onPeriod={v => setPeriod(id, v)} {...rangeNav}>
          <V2Metric value={fmtN(c, 2)} deltaPct={d} up={(d ?? 0) >= 0}
            compare={<>Frente a profit factor {fmtN(p, 2)} {pa} {pw} anterior</>} />
        </V2Card>
      );
    }

    return null;
  };

  // Botón de icono de la cabecera (los que antes vivían en la barra lateral)
  const hdrBtn = (onClick, title, Ico) => (
    <button onClick={onClick} title={title} aria-label={title}
      style={{
        width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center",
        background: V2.card, border: `1px solid ${V2.border}`, borderRadius: 10, cursor: "pointer",
      }}>
      <Ico c={V2.text2} s={19} />
    </button>
  );

  return (
    <div style={{ background: V2.bg, minHeight: "100vh" }}>
      {/* El contenido se desliza por detrás del menú inferior fijo */}
      <main className="v5-main" style={{ minWidth: 0 }}>
        {/* Fila 1: título a la izquierda y cuenta de usuario arriba a la derecha */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h1 className="v5-title" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, color: V2.text, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.15, minWidth: 0 }}>
            <img src="/icon.png" alt="" width={30} height={30} style={{ borderRadius: 8, flexShrink: 0 }} />
            {nav === "dashboard" ? (
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Trading Journal <span style={{ color: V2.green }}>v5</span>
                {deployId && <span className="v5-hash" style={{ fontSize: 13, fontWeight: 400, color: V2.text3, marginLeft: 8 }}>({deployId})</span>}
              </span>
            ) : <span style={{ whiteSpace: "nowrap" }}>{V2_NAV.find(n => n.id === nav)?.label}</span>}
          </h1>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* El plan solo en la principal: abre el PDF en el visor del sistema */}
            {nav === "dashboard" && (
              <a
                href="/plan-trading-nq.pdf"
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir el plan de trading"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px",
                  borderRadius: 10, background: V2.card, border: `1px solid ${V2.border}`,
                  color: V2.text2, fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
                }}
              >
                📄 Plan
              </a>
            )}
            <UserButton />
          </span>
        </div>

        {/* Fila 2: controles y selector de cuenta */}
        <div className="v5-toolbar">
          <button
            onClick={() => { setEditingTrade(null); setAddingTrade(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: V2.green, color: "#0A0A0A",
              border: "none", borderRadius: 10, padding: "0 16px", height: 42, fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            + <span className="v5-lbl-full">Añadir trade</span><span className="v5-lbl-short">Trade</span>
          </button>
          {hdrBtn(() => setPicker(true), "Añadir tarjeta", IconPlus)}
          {hdrBtn(onRefresh, "Sincronizar y recalcular fases", IconSync)}
          <button
            onClick={onExit}
            title="Volver al dashboard antiguo"
            style={{
              fontSize: 12, fontWeight: 600, padding: "0 12px", height: 42, borderRadius: 10, cursor: "pointer",
              background: "transparent", color: V2.text3, border: `1px solid ${V2.border}`, whiteSpace: "nowrap",
            }}
          >
            V4 (Old)
          </button>

          {/* Cuentas retiradas: ocultas por defecto, se recuperan para consultar
              sus estadísticas. Si se ocultan estando seleccionada una, se vuelve
              a "Todas" para no quedarse en una cuenta invisible. */}
          {retiredCount > 0 && (
            <button
              onClick={() => {
                const next = !showClosed;
                setShowClosed(next);
                if (!next && acct !== "all" && accountsList.some(a => a.name === acct && isRetired(a))) setAcct("all");
              }}
              aria-pressed={showClosed}
              title={showClosed ? "Ocultar cuentas cerradas" : `Mostrar ${retiredCount} cuenta${retiredCount > 1 ? "s cerradas" : " cerrada"}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 12px",
                borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600,
                background: showClosed ? "rgba(232,83,110,0.16)" : V2.card,
                border: `1px solid ${showClosed ? V2.red : V2.border}`,
                color: showClosed ? V2.red : V2.text3,
              }}
            >
              <IconFlame c={showClosed ? V2.red : V2.text3} />
              {retiredCount}
            </button>
          )}
          <select
            className="v5-acct"
            value={acct}
            onChange={e => setAcct(e.target.value)}
            aria-label="Cuenta"
            style={{
              background: V2.card, color: V2.text, border: `1px solid ${V2.border}`,
              borderRadius: 10, padding: "0 12px", height: 42, fontSize: 14, cursor: "pointer", outline: "none",
            }}
          >
            <option value="all">Todas las cuentas</option>
            {visibleAccounts.map(a => (
              <option key={a.id} value={a.name}>
                {a.name}{isRetired(a) ? " · cerrada" : ""}
              </option>
            ))}
          </select>
        </div>

        {addingTrade && <TradeForm trade={EMPTY_TRADE} onSave={saveTrade} onCancel={() => setAddingTrade(false)} isNew accounts={activeAccountsForForm} dark />}
        {editingTrade && <TradeForm trade={editingTrade} onSave={saveTrade} onCancel={() => setEditingTrade(null)} isNew={false} accounts={allAccountsForForm} dark />}

        {/* El selector actúa sobre la hoja en la que estás */}
        {picker && nav === "dashboard" && (
          <div style={{ background: V2.card, border: `1px solid ${V2.border}`, borderRadius: 16, padding: 20, marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 15, color: V2.text, fontWeight: 500 }}>
                Tarjetas del panel
              </span>
              <button onClick={() => setPicker(false)} style={{ background: "none", border: "none", color: V2.text3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {V2_CARD_DEFS.map(c => {
                const on = cardsOf(nav).includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCard(nav, c.id)}
                    style={{
                      fontSize: 13, padding: "7px 14px", borderRadius: 999, cursor: "pointer",
                      border: `1px solid ${on ? V2.green : V2.border}`,
                      background: on ? "rgba(78,204,163,0.12)" : "transparent",
                      color: on ? V2.green : V2.text3,
                    }}>
                    {on ? "✓ " : "+ "}{c.title}{c.subtitle ? ` (${c.subtitle})` : ""}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: V2.text3, marginTop: 12 }}>
              Cada hoja guarda su propia selección y su propio orden.
            </div>
          </div>
        )}

        {nav === "dashboard" && (
          cardsOf("dashboard").length === 0
            ? <div style={{ color: V2.text3, fontSize: 15 }}>No hay tarjetas. Pulsa ⊕ arriba para añadirlas.</div>
            : (() => {
                const lista = cardsOf("dashboard");
                const anchos = anchosEfectivos(lista);
                return <div className="v2-grid">{lista.map((id, i) => renderCard(id, "dashboard", anchos[i]))}</div>;
              })()
        )}

        {nav === "trades" && (() => {
          const sortedTrades = [...scoped].sort((a, b) => b.id - a.id);
          const perPage = 10;
          const totalPages = Math.max(1, Math.ceil(sortedTrades.length / perPage));
          const pageSafe = Math.min(tradePage, totalPages);
          const pageTrades = sortedTrades.slice((pageSafe - 1) * perPage, pageSafe * perPage);
          return (
            <div style={{ background: V2.card, border: `1px solid ${V2.border}`, borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 19, fontWeight: 500, color: V2.text, marginBottom: 18 }}>Días operados</div>
              <div className="v2-scroll-fade" style={{ overflowX: "auto", position: "relative" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr>
                      {["#", "Fecha", "Cuenta", "PnL", "Comisión", "Balance", "Umbral DD", "Res.", ""].map(h => (
                        <th key={h} style={{ fontSize: 11, fontWeight: 600, color: V2.text3, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${V2.border}`, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageTrades.map(t => (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${V2.border}` }}>
                        <td style={{ padding: "8px", color: V2.text3 }}>{t.id}</td>
                        <td style={{ padding: "8px", color: V2.text, whiteSpace: "nowrap" }}>{t.date}</td>
                        <td style={{ padding: "8px", color: V2.text2, whiteSpace: "nowrap" }}>{t.account.split(" ")[0]}</td>
                        <td style={{ padding: "8px", color: t.pnl > 0 ? V2.green : t.pnl < 0 ? V2.red : V2.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(t.pnl)}</td>
                        <td style={{ padding: "8px", color: V2.red, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                          {t.commission ? `-$${Math.abs(t.commission).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td style={{ padding: "8px", color: V2.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {t.balance !== null && t.balance !== undefined ? `$${t.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td style={{ padding: "8px", color: V2.text2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {t.threshold !== null && t.threshold !== undefined ? `$${t.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td style={{ padding: "8px" }}>
                          <span style={{ fontSize: 11, padding: "1.5px 7px", borderRadius: 4, background: t.result === "Win" ? "rgba(78,204,163,0.16)" : "rgba(232,83,110,0.16)", color: t.result === "Win" ? V2.green : V2.red }}>{t.result}</span>
                        </td>
                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                          <button onClick={() => { setAddingTrade(false); setEditingTrade(t); }} title="Editar" style={{ fontSize: 12, padding: "3px 7px", marginRight: 4, border: `0.5px solid ${V2.border}`, borderRadius: 4, background: "transparent", cursor: "pointer", color: V2.text2 }}>✏️</button>
                          <button onClick={() => setDeleteConfirm(t.id)} title="Eliminar" style={{ fontSize: 12, padding: "3px 7px", border: `0.5px solid ${V2.border}`, borderRadius: 4, background: "transparent", cursor: "pointer", color: V2.red }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {deleteConfirm && (
                <div style={{ padding: "10px 14px", background: "rgba(232,83,110,0.14)", border: "0.5px solid rgba(232,83,110,0.4)", borderRadius: 8, marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: V2.red }}>¿Seguro que deseas eliminar el trade #{deleteConfirm}?</span>
                  <button onClick={() => deleteTrade(deleteConfirm)} style={{ fontSize: 12, padding: "5px 12px", background: V2.red, color: "#0A0A0A", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>Confirmar</button>
                  <button onClick={() => setDeleteConfirm(null)} style={{ fontSize: 12, padding: "5px 12px", background: "transparent", border: `0.5px solid ${V2.border}`, borderRadius: 6, cursor: "pointer", color: V2.text2 }}>Cancelar</button>
                </div>
              )}

              {totalPages > 1 && (
                <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
                  <button onClick={() => setTradePage(p => Math.max(1, p - 1))} disabled={pageSafe === 1} style={{ padding: "4px 12px", fontSize: 12, border: `0.5px solid ${V2.border}`, borderRadius: 6, background: "transparent", color: V2.text2, cursor: pageSafe === 1 ? "default" : "pointer", opacity: pageSafe === 1 ? 0.4 : 1 }}>‹</button>
                  <span style={{ fontSize: 12, color: V2.text2 }}>{pageSafe} / {totalPages}</span>
                  <button onClick={() => setTradePage(p => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} style={{ padding: "4px 12px", fontSize: 12, border: `0.5px solid ${V2.border}`, borderRadius: 6, background: "transparent", color: V2.text2, cursor: pageSafe === totalPages ? "default" : "pointer", opacity: pageSafe === totalPages ? 0.4 : 1 }}>›</button>
                  <span style={{ fontSize: 12, color: V2.text3, marginLeft: 8 }}>{sortedTrades.length} trades total</span>
                </div>
              )}
            </div>
          );
        })()}

        {nav === "calendar" && (
          <div style={{ background: V2.card, border: `1px solid ${V2.border}`, borderRadius: 16, padding: 24 }}>
            <V2CalendarWidget trades={scoped} />
          </div>
        )}

        {/* Misma hoja de ajustes de siempre: el contenedor redefine sus
            variables de color para que salga en oscuro. Van en línea además de
            en la clase porque en dev el chunk CSS conserva el nombre entre
            builds y el navegador puede servir una copia cacheada. */}
        {/* Plan de trading. En escritorio va el PDF incrustado; en móvil,
            la versión nativa, porque iOS solo pinta la primera página de un
            PDF en iframe y no deja desplazarlo. */}
        {nav === "settings" && (
          <div className="v2-settings" style={V2_SETTINGS_VARS}>
            {settingsPanel}
          </div>
        )}
      </main>

      {/* El plan se abre a pantalla completa sobre la app, por encima del
          menú, y la ✕ devuelve a la sección en la que estabas. */}
      <V2MeniscusNav active={nav} onChange={setNav} />
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
  const [selectedAccounts, setSelectedAccounts] = useState(new Set()); // empty Set = all accounts
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
  // El dashboard V5 es la vista principal; el clásico queda tras "V4 (Old)".
  // Se arranca siempre en V5 y en su primera sección, sin recordar la anterior.
  const [currentTab, setCurrentTab] = useState("v2");

  // En V5 el documento entero pasa a negro. Hay que tocar html y body: body
  // lleva su propio fondo claro y unos degradados que, si no, asoman por la
  // franja de estado y al hacer overscroll. También la meta theme-color, que
  // es la que tiñe la barra de estado en iOS.
  useEffect(() => {
    const dark = currentTab === "v2";
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.background, bg: body.style.backgroundColor, img: body.style.backgroundImage };

    html.style.background = dark ? V2.bg : "";
    body.style.backgroundColor = dark ? V2.bg : "";
    body.style.backgroundImage = dark ? "none" : "";

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    const prevTheme = meta.getAttribute("content");
    meta.setAttribute("content", dark ? V2.bg : "#ffffff");

    return () => {
      html.style.background = prev.html;
      body.style.backgroundColor = prev.bg;
      body.style.backgroundImage = prev.img;
      if (prevTheme !== null) meta.setAttribute("content", prevTheme);
    };
  }, [currentTab]);
  const [theme, setTheme] = useState("light");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiKey, setAiKey] = useState("");
  const [selectedTradeImage, setSelectedTradeImage] = useState(null);
  const [imageImportLoading, setImageImportLoading] = useState(false);
  const [deployId, setDeployId] = useState("");
  // Informe de fases tras pulsar actualizar (null = sin verificación reciente)
  const [phaseReport, setPhaseReport] = useState(null);

  const PER_PAGE = 10;
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
      if (savedAcctFilter) setSelectedAccounts(deserializeAcctFilter(savedAcctFilter));
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
              setSelectedAccounts(deserializeAcctFilter(dbSettings.acctFilter));
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
          const serverCommit = data.commitSha;
          const serverDeployId = data.deploymentId;
          
          const sha = serverCommit === 'development' ? 'Local' : (serverCommit ? serverCommit.slice(0, 7) : 'Local');
          setDeployId(sha);

          // Auto-reload check if client is outdated compared to server deployment
          const clientCommit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'development';
          const clientDeployId = process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID || 'local';

          const hasNewCommit = serverCommit !== 'development' && clientCommit !== 'development' && serverCommit !== clientCommit;
          const hasNewDeploy = serverDeployId !== 'local' && clientDeployId !== 'local' && serverDeployId !== clientDeployId;

          if (hasNewCommit || hasNewDeploy) {
            // Only trigger reload in production (ignore on localhost)
            if (typeof window !== 'undefined' && 
                window.location.hostname !== 'localhost' && 
                window.location.hostname !== '127.0.0.1') {
              
              const urlParams = new URLSearchParams(window.location.search);
              const currentVParam = urlParams.get('v');
              const targetVersion = serverCommit || serverDeployId;

              if (currentVParam !== targetVersion && targetVersion && targetVersion !== 'development' && targetVersion !== 'local') {
                console.log(`Auto-reload: Client version (${clientCommit}) is out of date compared to Server version (${targetVersion}). Reloading...`);
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set('v', targetVersion);
                window.location.replace(nextUrl.toString());
              } else {
                console.warn(`Already reloaded with query param v=${targetVersion}, but client version is still ${clientCommit}. Stopping reload to prevent loop.`);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error during startup version check:", err);
      }
    };
    fetchVersion();
  }, []);

  // Sync state changes to LocalStorage and Database
  useEffect(() => {
    // Sync to LocalStorage (instant cache)
    try {
      localStorage.setItem("tj_layout", JSON.stringify(layout));
      localStorage.setItem("tj_visibility", JSON.stringify(visibility));
      localStorage.setItem("tj_acct_filter", serializeAcctFilter(selectedAccounts));
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
            acctFilter: serializeAcctFilter(selectedAccounts),
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
  }, [layout, visibility, theme, selectedAccounts, accountsPanelFilter, aiProvider, aiKey]);

  // Devuelven los datos además de guardarlos: la verificación de fases
  // necesita leerlos ya, sin esperar al siguiente render.
  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccountsList(data);
        return data;
      }
    } catch (err) {
      console.error("Error cargando cuentas:", err);
    }
    return null;
  };

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/trades');
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
        return data;
      }
    } catch (err) {
      console.error("Error cargando trades:", err);
    } finally {
      setLoading(false);
    }
    return null;
  };

  // Recalcula la fase de cada cuenta con los datos recién traídos y compara
  // con la que había, para avisar de los cambios de tamaño de posición.
  const refreshAndVerifyPhases = async () => {
    const before = new Map(accountsList.map(a => {
      const { cushion } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
      return [a.name, getPhase(cushion)?.n ?? null];
    }));

    const [freshAccts, freshTrades] = await Promise.all([fetchAccounts(), fetchTrades()]);
    const accts = freshAccts || accountsList;
    const trs = freshTrades || trades;

    const rows = accts
      .filter(a => !isClosedAcct(a))
      .map(a => {
        const { cushion, basis } = computeCushion(a, trs.filter(t => t.account === a.name), a.size);
        const ph = getPhase(cushion);
        const prev = before.get(a.name);
        return { name: a.name, phase: ph, cushion, basis, prev, changed: prev != null && ph != null && prev !== ph.n };
      })
      .sort((x, y) => (x.phase?.n ?? 9) - (y.phase?.n ?? 9));

    setPhaseReport({ at: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }), rows });
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

          const parseOptionalFloat = (val) => {
            if (val === undefined || val === null || val === "") return null;
            let cleaned = String(val).trim();
            if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
              cleaned = "-" + cleaned.slice(1, -1);
            }
            cleaned = cleaned.replace(/[^0-9.,-]/g, "");
            if (cleaned === "" || cleaned === "-") return null;

            const hasComma = cleaned.includes(",");
            const hasDot = cleaned.includes(".");
            if (hasComma && hasDot) {
              const commaIndex = cleaned.indexOf(",");
              const dotIndex = cleaned.indexOf(".");
              if (commaIndex < dotIndex) {
                cleaned = cleaned.replace(/,/g, "");
              } else {
                cleaned = cleaned.replace(/\./g, "").replace(",", ".");
              }
            } else if (hasComma) {
              cleaned = cleaned.replace(",", ".");
            }
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? null : parsed;
          };

          const parseOptionalInt = (val) => {
            const f = parseOptionalFloat(val);
            return f !== null ? Math.round(f) : null;
          };

          const newTradesData = rawTrades.map((t) => {
            // Normalize date
            let dateVal = t.date;
            if (dateVal && typeof dateVal === "string" && !dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
              dateVal = normalizeDateToYYYYMMDD(dateVal);
            } else if (!dateVal) {
              dateVal = null;
            }

            const grossVal = parseOptionalFloat(t.gross);
            const commissionVal = parseOptionalFloat(t.commission) ?? 0;
            let pnlVal = parseOptionalFloat(t.pnl);
            if (pnlVal === null && grossVal !== null) {
              pnlVal = grossVal + commissionVal;
            }
            const maeVal = parseOptionalFloat(t.mae);
            const mfeVal = parseOptionalFloat(t.mfe);
            const etdVal = parseOptionalFloat(t.etd);
            let rrVal = parseOptionalFloat(t.rr);
            if ((rrVal === null || rrVal === 0) && maeVal > 0 && grossVal !== null) {
              rrVal = parseFloat((grossVal / maeVal).toFixed(2));
            }
            const resultVal = t.result || (pnlVal !== null ? (pnlVal > 0 ? "Win" : pnlVal < 0 ? "Loss" : "Break Even") : null);

            const tradeCandidate = {
              date: dateVal,
              entry_time: t.entry_time || null,
              exit_time: t.exit_time || null,
              account: t.account || (accountsList[0]?.name || null),
              instrument: t.instrument || null,
              direction: t.direction || null,
              qty: parseOptionalInt(t.qty),
              entry: parseOptionalFloat(t.entry),
              exit_price: parseOptionalFloat(t.exit_price),
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
    const base = selectedAccounts.size === 0
      ? trades
      : trades.filter(t => selectedAccounts.has(t.account));
    return base.filter(t => t.instrument !== "Ajuste de Broker");
  }, [trades, selectedAccounts]);
  const stats = useMemo(() => calcStats(filtered), [filtered]);

  // Comisiones del mes corriente + media por día de trade (periodo = mes actual)
  // Periodo de los KPIs de comisiones (compartido por ambos tiles):
  // null = auto (mes corriente o último con datos), "TOTAL" = global, "YYYY-MM" = mes concreto
  const [commPeriod, setCommPeriod] = useState(null);

  const commissionStats = useMemo(() => {
    // Meses con datos, ascendente. La secuencia navegable es [...months, "TOTAL"]
    const months = [...new Set(filtered.map(t => normalizeDateToYYYYMMDD(t.date).slice(0, 7)))].sort();
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const fallback = months.includes(currentYm) ? currentYm : (months[months.length - 1] ?? currentYm);
    // Si el periodo elegido dejó de existir (cambio de filtro de cuenta), volver a auto
    const period = commPeriod === "TOTAL" || (commPeriod && months.includes(commPeriod)) ? commPeriod : fallback;

    const subset = period === "TOTAL"
      ? filtered
      : filtered.filter(t => normalizeDateToYYYYMMDD(t.date).slice(0, 7) === period);
    const total = subset.reduce((s, t) => s + Math.abs(t.commission || 0), 0);
    const days = new Set(subset.map(t => normalizeDateToYYYYMMDD(t.date))).size;
    const perDay = days ? total / days : 0;
    const label = period === "TOTAL"
      ? "Total"
      : new Date(period + "-01T00:00:00").toLocaleDateString("es-ES", { month: "short", year: "numeric" });

    const idx = period === "TOTAL" ? months.length : months.indexOf(period);
    const prev = idx > 0 ? months[idx - 1] : null;
    const next = idx < months.length ? (months[idx + 1] ?? "TOTAL") : null;
    return { total, days, perDay, label, period, prev, next };
  }, [filtered, commPeriod]);

  // Rachas de días TP/SL consecutivos sobre la secuencia de días operados.
  // Se agrega por fecha (multi-cuenta) y un día en 0 rompe ambas rachas.
  const streaks = useMemo(() => {
    const dayMap = new Map();
    filtered.forEach(t => {
      const d = normalizeDateToYYYYMMDD(t.date);
      dayMap.set(d, (dayMap.get(d) || 0) + (t.pnl || 0));
    });
    const dailyPnls = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, pnl]) => pnl);
    let curW = 0, curL = 0, maxW = 0, maxL = 0;
    dailyPnls.forEach(pnl => {
      if (pnl > 0) { curW++; curL = 0; }
      else if (pnl < 0) { curL++; curW = 0; }
      else { curW = 0; curL = 0; }
      maxW = Math.max(maxW, curW);
      maxL = Math.max(maxL, curL);
    });
    return { maxWin: maxW, maxLoss: maxL, curWin: curW, curLoss: curL };
  }, [filtered]);

  const accounts = useMemo(() => accountsList.map(a => a.name), [accountsList]);

  const activeAccountsForForm = useMemo(() => {
    return accountsList
      .filter(a => a.status === "ACTIVE" || !a.status)
      .map(a => ({ value: a.name, label: a.name }));
  }, [accountsList]);

  const allAccountsForForm = useMemo(() => {
    return accountsList.map(a => {
      let label = a.name;
      if (isClosedAcct(a)) label += " (Cerrada)";
      return { value: a.name, label };
    });
  }, [accountsList]);

  // accountsButtons kept for backward compat if needed elsewhere but not used in equity module anymore

  const trueNetPnl = useMemo(() => {
    // Get the accounts that are active in the filter (all if none selected)
    const activeAccounts = selectedAccounts.size === 0
      ? accountsList
      : accountsList.filter(a => selectedAccounts.has(a.name));
    if (activeAccounts.length === 1) {
      // Single account: use reconstructed balance
      return calcAccountDD(filtered, activeAccounts[0]).netPnl;
    }
    // Multiple or all: sum each account's reconstructed PnL
    return activeAccounts.reduce((acc, a) => {
      const acctTrades = filtered.filter(t => t.account === a.name);
      const { netPnl } = calcAccountDD(acctTrades, a);
      return acc + netPnl;
    }, 0);
  }, [filtered, selectedAccounts, accountsList]);

  const equitySpark = useMemo(() => {
    // Pass 'all' when multiple accounts are selected (portfolio view)
    const filterArg = selectedAccounts.size === 1 ? [...selectedAccounts][0] : "all";
    return calcReconstructedPnlHistory(filtered, filterArg, accountsList);
  }, [filtered, selectedAccounts, accountsList]);

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCard label="Net P&L" value={fmt(Math.round(trueNetPnl))} color={trueNetPnl >= 0 ? C.green : C.red} spark={equitySpark} />
          <KpiCard label="Win rate" value={`${fmtN(stats.wr || 0, 1)}%`} sub={`${stats.wins || 0}W · ${stats.losses || 0}L`} color={(stats.wr || 0) >= 50 ? C.green : C.red} rightElement={<MiniDonut wins={stats.wins || 0} losses={stats.losses || 0} />} />
          <KpiCard label="Trade mayor" value={fmt(Math.round(stats.maxWin || 0))} color={C.green} />
          <KpiCard label="Trade menor" value={fmt(Math.round(stats.maxLoss || 0))} color={C.red} />
          <KpiCard label="Profit factor" value={fmtN(stats.pf || 0, 2)} color={(stats.pf || 0) >= 1 ? C.green : C.red} />
          <KpiCard
            label="Comisiones"
            value={`-$${Math.round(commissionStats.total).toLocaleString()}`}
            color={C.red}
            sub={commissionStats.label}
            arrows={{ canPrev: !!commissionStats.prev, canNext: !!commissionStats.next, onPrev: () => commissionStats.prev && setCommPeriod(commissionStats.prev), onNext: () => commissionStats.next && setCommPeriod(commissionStats.next) }}
          />
          <KpiCard
            label="Comis./día trade"
            value={`-$${fmtN(commissionStats.perDay, 1)}`}
            color={C.red}
            sub={`${commissionStats.days} días de trade · ${commissionStats.label}`}
            arrows={{ canPrev: !!commissionStats.prev, canNext: !!commissionStats.next, onPrev: () => commissionStats.prev && setCommPeriod(commissionStats.prev), onNext: () => commissionStats.next && setCommPeriod(commissionStats.next) }}
          />
          <KpiCard
            label="Racha máx. (días)"
            value={
              <span>
                <span style={{ color: C.green }}>{streaks.maxWin}W</span>
                <span style={{ color: "var(--color-text-tertiary)", fontSize: 18, fontWeight: 500, margin: "0 6px" }}>/</span>
                <span style={{ color: C.red }}>{streaks.maxLoss}L</span>
              </span>
            }
            sub={streaks.curWin > 0 ? `Actual: ${streaks.curWin} ganando` : streaks.curLoss > 0 ? `Actual: ${streaks.curLoss} perdiendo` : "Sin racha activa"}
          />
        </div>
      </Module>
    );
    if (mod.id === "accounts") {
      const totalCount = accountsList.length;
      const examenCount = accountsList.filter(a => (a.status || "ACTIVE").toUpperCase() === "ACTIVE" && a.type === "EXAMEN").length;
      const realCount = accountsList.filter(a => (a.status || "ACTIVE").toUpperCase() === "ACTIVE" && a.type === "REAL").length;

      const filteredAccounts = accountsList.filter(a => {
        const status = a.status || "ACTIVE";
        if (accountsPanelFilter === "EXAMEN") return status.toUpperCase() === "ACTIVE" && a.type === "EXAMEN";
        if (accountsPanelFilter === "REAL") return status.toUpperCase() === "ACTIVE" && a.type === "REAL";
        return true;
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
              { id: "EXAMEN", label: "Examen 📝", count: examenCount },
              { id: "REAL", label: "Real 💼", count: realCount },
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
        <EquityChart trades={filtered} accountFilter={selectedAccounts.size === 1 ? [...selectedAccounts][0] : "all"} accountsList={accountsList} />
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
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                {["#", "Fecha", "Cuenta", "PnL", "Comisión", "Balance", "Umbral DD", "Res.", ""].map(h => (
                   <th key={h} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)", textAlign: "left", padding: "5px 6px", borderBottom: "0.5px solid var(--color-border-tertiary)", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedTrades.map(t => (
                <tr key={t.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <td style={{ padding: "5px 6px", color: "var(--color-text-secondary)" }}>{t.id}</td>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "5px 6px", fontSize: 10, whiteSpace: "nowrap" }}>{t.account.split(" ")[0]}</td>
                  <td style={{ padding: "5px 6px", color: t.pnl > 0 ? C.green : t.pnl < 0 ? C.red : "inherit", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt(t.pnl)}</td>
                  <td style={{ padding: "5px 6px", color: C.red, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                    {t.commission ? `-$${Math.abs(t.commission).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {t.balance !== null && t.balance !== undefined ? `$${t.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>
                    {t.threshold !== null && t.threshold !== undefined ? `$${t.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td style={{ padding: "5px 6px" }}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: t.result === "Win" ? C.greenBg : C.redBg, color: t.result === "Win" ? C.greenText : C.redText }}>{t.result}</span></td>
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
          <TradeForm trade={editingTrade} onSave={saveTrade} onCancel={() => setEditingTrade(null)} isNew={false} accounts={allAccountsForForm} />
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
    <div style={currentTab === "v2"
      ? { fontFamily: "var(--font-sans)" }
      : { maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem", fontFamily: "var(--font-sans)" }}>
      <SundayReminder />
      <h2 className="sr-only">Trading Journal Dashboard — NQ Futures Bulenox</h2>
      {currentTab !== "v2" && (
      <div className="flex flex-col md:flex-row justify-between gap-4 items-center md:items-center mb-5">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <h1 className="flex items-center justify-center md:justify-start gap-1.5" style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <img src="/icon.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />Trading Journal
            </span>
            <span style={{ fontSize: 10, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", padding: "2px 6px", borderRadius: 6, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              v4.1 (old) {deployId && `(${deployId})`}
            </span>
            <button
              onClick={refreshAndVerifyPhases}
              title="Sincronizar y recalcular la fase de cada cuenta"
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
            {/* En iOS Safari un <a target="_blank"> abre el PDF en el visor nativo */}
            <a
              href="/plan-trading-nq.pdf"
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir el plan de trading (PDF)"
              style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: C.blueBg, color: C.blueText, border: `0.5px solid ${C.blue}`, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              📄 Plan
            </a>
            <button
              onClick={() => setCurrentTab("v2")}
              title="Volver al dashboard principal"
              style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap", background: C.blue, color: "#fff", border: `0.5px solid ${C.blue}` }}
            >
              ✨ Volver a V5
            </button>
          </h1>
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

          {/* Filtro avanzado de cuentas */}
          {currentTab === "dashboard" && (
            <div className="w-full md:w-auto order-2 md:order-1 flex justify-center md:justify-end">
              <AccountFilterA
                accountsList={accountsList}
                selectedAccounts={selectedAccounts}
                onChange={setSelectedAccounts}
              />
            </div>
          )}

        </div>
      </div>
      )}
      
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12 }}>
          Cargando trades de Neon...
        </div>
      ) : (
        <>
          {currentTab === "v2" ? (
            <DashboardV2
              trades={trades}
              accountsList={accountsList}
              onExit={() => setCurrentTab("dashboard")}
              onRefresh={refreshAndVerifyPhases}
              deployId={deployId}
              addingTrade={addingTrade}
              setAddingTrade={setAddingTrade}
              editingTrade={editingTrade}
              setEditingTrade={setEditingTrade}
              deleteConfirm={deleteConfirm}
              setDeleteConfirm={setDeleteConfirm}
              saveTrade={saveTrade}
              deleteTrade={deleteTrade}
              activeAccountsForForm={activeAccountsForForm}
              allAccountsForForm={allAccountsForForm}
              settingsPanel={
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
              }
            />
          ) : currentTab === "settings" ? (
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

              {/* Verificación de fases tras pulsar actualizar */}
              {phaseReport && (
                <div style={{ background: "var(--color-background-primary)", border: `0.5px solid ${phaseReport.rows.some(r => r.changed) ? C.amber : "var(--color-border-secondary)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".7px" }}>
                      Fases recalculadas · {phaseReport.at}
                    </span>
                    <button onClick={() => setPhaseReport(null)} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                  {phaseReport.rows.some(r => r.changed) && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#8A5A0B", background: "#FDF3E2", borderRadius: 6, padding: "5px 8px", marginBottom: 8 }}>
                      ⚠ Cambio de fase: ajusta el tamaño de posición
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {phaseReport.rows.map(r => (
                      <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                        <span style={{ minWidth: 150, color: "var(--color-text-secondary)", fontWeight: r.changed ? 600 : 400 }}>{r.name}</span>
                        {r.phase ? (
                          <>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1.5px 6px", borderRadius: 4, background: r.phase.color === "amber" ? "#FDF3E2" : C[r.phase.color + "Bg"], color: r.phase.color === "amber" ? "#8A5A0B" : C[r.phase.color + "Text"] }}>
                              FASE {r.phase.n} · {r.phase.contracts} MNQ
                            </span>
                            <span style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                              colchón ${Math.round(r.cushion).toLocaleString()}
                              {r.basis && ` · cierre ${r.basis}`}
                            </span>
                            {r.changed && <span style={{ color: "#8A5A0B", fontWeight: 600 }}>antes fase {r.prev}</span>}
                          </>
                        ) : (
                          <span style={{ color: "var(--color-text-tertiary)" }}>sin umbral definido</span>
                        )}
                      </div>
                    ))}
                  </div>
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
                  {pendingImport.trades.map((trade, index) => {
                    const isCriticalMissing = (field, val) => {
                      if (field === "strategy" || field === "notes" || field === "commission") return false;
                      return val === null || val === undefined || String(val).trim() === "";
                    };
                    
                    const getInputStyle = (field, val) => {
                      const missing = isCriticalMissing(field, val);
                      return {
                        width: "100%",
                        fontSize: "11px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: missing 
                          ? `1.5px solid ${C.red}` 
                          : "0.5px solid var(--color-border-tertiary)",
                        background: missing
                          ? (theme === "dark" ? "rgba(239, 68, 68, 0.05)" : "#FEF2F2")
                          : "var(--color-background-primary)",
                        color: "var(--color-text-primary)",
                        outline: "none",
                        transition: "all 0.2s ease"
                      };
                    };

                    return (
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
                              value={trade.date || ""}
                              onChange={(e) => handleTradeFieldChange(index, "date", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("date", trade.date)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Hora Ent.</label>
                            <input
                              type="text"
                              value={trade.entry_time || ""}
                              onChange={(e) => handleTradeFieldChange(index, "entry_time", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("entry_time", trade.entry_time)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Hora Sal.</label>
                            <input
                              type="text"
                              value={trade.exit_time || ""}
                              onChange={(e) => handleTradeFieldChange(index, "exit_time", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("exit_time", trade.exit_time)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Cuenta</label>
                            <select
                              value={trade.account || ""}
                              onChange={(e) => handleTradeFieldChange(index, "account", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("account", trade.account)}
                            >
                              <option value="">Seleccionar...</option>
                              {allAccountsForForm.map(a => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Instrumento</label>
                            <input
                              type="text"
                              value={trade.instrument || ""}
                              onChange={(e) => handleTradeFieldChange(index, "instrument", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("instrument", trade.instrument)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Dirección</label>
                            <select
                              value={trade.direction || ""}
                              onChange={(e) => handleTradeFieldChange(index, "direction", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("direction", trade.direction)}
                            >
                              <option value="">Seleccionar...</option>
                              <option value="Long">Long</option>
                              <option value="Short">Short</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Contratos (Qty)</label>
                            <input
                              type="number"
                              value={trade.qty !== null && trade.qty !== undefined ? trade.qty : ""}
                              onChange={(e) => handleTradeFieldChange(index, "qty", e.target.value === "" ? null : parseInt(e.target.value, 10))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("qty", trade.qty)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Precio Ent.</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.entry !== null && trade.entry !== undefined ? trade.entry : ""}
                              onChange={(e) => handleTradeFieldChange(index, "entry", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("entry", trade.entry)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Precio Sal.</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.exit_price !== null && trade.exit_price !== undefined ? trade.exit_price : ""}
                              onChange={(e) => handleTradeFieldChange(index, "exit_price", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("exit_price", trade.exit_price)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Comisión</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.commission !== null && trade.commission !== undefined ? trade.commission : ""}
                              onChange={(e) => handleTradeFieldChange(index, "commission", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("commission", trade.commission)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Net PnL</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.pnl !== null && trade.pnl !== undefined ? trade.pnl : ""}
                              onChange={(e) => handleTradeFieldChange(index, "pnl", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("pnl", trade.pnl)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>MAE</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.mae !== null && trade.mae !== undefined ? trade.mae : ""}
                              onChange={(e) => handleTradeFieldChange(index, "mae", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("mae", trade.mae)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>MFE</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.mfe !== null && trade.mfe !== undefined ? trade.mfe : ""}
                              onChange={(e) => handleTradeFieldChange(index, "mfe", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("mfe", trade.mfe)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>ETD</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.etd !== null && trade.etd !== undefined ? trade.etd : ""}
                              onChange={(e) => handleTradeFieldChange(index, "etd", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("etd", trade.etd)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>R Múltiple</label>
                            <input
                              type="number"
                              step="any"
                              value={trade.rr !== null && trade.rr !== undefined ? trade.rr : ""}
                              onChange={(e) => handleTradeFieldChange(index, "rr", e.target.value === "" ? null : parseFloat(e.target.value))}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("rr", trade.rr)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Estrategia</label>
                            <input
                              type="text"
                              value={trade.strategy || ""}
                              onChange={(e) => handleTradeFieldChange(index, "strategy", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("strategy", trade.strategy)}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 9, color: "var(--color-text-secondary)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Notas</label>
                            <input
                              type="text"
                              value={trade.notes || ""}
                              onChange={(e) => handleTradeFieldChange(index, "notes", e.target.value)}
                              disabled={wizardStatus !== "" && wizardStatus !== "error"}
                              style={getInputStyle("notes", trade.notes)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

