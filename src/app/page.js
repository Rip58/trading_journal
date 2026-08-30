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

// Saldo de partida y objetivo, en dólares, de lo que se está pintando. La curva
// de equity va en absoluto, así que necesita el suelo sobre el que se levanta y
// la meta a la que apunta. Con "todas" se suman los de las cuentas que tienen
// operaciones, que son las que entran en la curva.
function calcEquityRefs(trades, filter, accountsList) {
  if (!trades || trades.length === 0) return { base: 0, objetivo: null };
  const historias = buildAccountHistories(trades, accountsList);
  let base = 0, target = 0, cuentas = 0;
  accountsList.forEach(acc => {
    if (filter !== "all" && acc.name !== filter) return;
    const h = historias[acc.name];
    if (!h || h.sortedTrades.length === 0) return;
    base += h.originalStartSize;
    target += Number(acc.target) || 0;
    cuentas++;
  });
  // La línea de objetivo solo se dibuja cuando hay UNA cuenta en juego: sumar
  // los objetivos de varias da una meta que no es la de ninguna.
  return { base, objetivo: (target > 0 && cuentas === 1) ? base + target : null };
}


const EMPTY_TRADE = { date: new Date().toISOString().slice(0, 10), entry_time: "", exit_time: "", account: "", instrument: "NQ", direction: "", qty: 1, entry: 0, exit_price: 0, gross: 0, commission: 4, pnl: 0, mae: 0, mfe: 0, etd: 0, rr: 0, result: "Win", strategy: "Resumen diario", timeframe: "Diario", notes: "", image: "", balance: "", threshold: "" };

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
    // Momentum Qualification: al aprobar se pasa directo a fondeada sin volver a
    // pagar el examen. Trae un trailing DD más corto que la Opción 1 de siempre
    // ($1.000 en vez de $1.500), así que el umbral arranca en $24.000, no en
    // $23.500. Datos tomados del panel de Bulenox del propio usuario.
    // Reserva safety y consistencia se dejan sin poner: no venían en la ficha y
    // son editables al crear la cuenta.
    { id: "bx-m-25", label: "25K · Momentum Qualification (Opción 1) · DD $1.000", size: 25000, target: 1500, dd_limit: 1000, threshold: 24000, maxContracts: 3 },
    { id: "bx-t-25", label: "25K · Opción 1 (Trailing DD $1.500)", size: 25000, target: 1500, dd_limit: 1500, threshold: 23500, safetyReserve: 26600, maxContracts: 3, consistency: "40%" },
    { id: "bx-t-50", label: "50K · Opción 1 (Trailing DD $2.500)", size: 50000, target: 3000, dd_limit: 2500, threshold: 47500, safetyReserve: 52600, maxContracts: 7, consistency: "40%" },
    { id: "bx-e-25", label: "25K · Opción 2 (EOD + DLL $500)", size: 25000, target: 1500, dd_limit: 1500, threshold: 23500, safetyReserve: 26600, maxContracts: 3, consistency: "40%", daily_limit: 500 },
    { id: "bx-e-50", label: "50K · Opción 2 (EOD + DLL $1.100)", size: 50000, target: 3000, dd_limit: 2500, threshold: 47500, safetyReserve: 52600, maxContracts: 7, consistency: "40%", daily_limit: 1100 },
  ],
  Lucid: [
    { id: "lp-25", label: "25K · LucidPro", size: 25000, target: 1250, dd_limit: 1000, threshold: 24000, safetyReserve: 26100, maxContracts: 2, consistency: "40%" },
    { id: "lp-50", label: "50K · LucidPro", size: 50000, target: 3000, dd_limit: 2000, threshold: 48000, safetyReserve: 52100, maxContracts: 4, consistency: "40%", daily_limit: 1200 },
  ],
};

// Paleta de los popups: sigue el tema claro/oscuro clásico por defecto, o la
// paleta fija de V2 cuando se abren desde el dashboard nuevo (dark=true).
const paletaPopup = (dark) => (dark
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
    });

// Fondo común de los popups: la capa oscura con desenfoque que los centra.
const veloPopup = {
  position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};

// ── Trade Form ───────────────────────────────────────────────────────────────
function TradeForm({ trade, onSave, onCancel, onDelete, isNew, accounts = [], dark = false }) {
  const t = paletaPopup(dark);
  // Guardar un día tarda lo suyo (POST, y luego recargar días y cuentas). Sin
  // señal de que está en marcha se vuelve a pulsar y se crean dos registros.
  const [guardando, setGuardando] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

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

  const handleSave = async () => {
    if (guardando) return;
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

    setGuardando(true);
    try {
      await onSave({
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
    } finally {
      // Si guardó bien, el padre ya ha cerrado el popup y este componente ya
      // no existe: solo se reactiva el botón si sigue montado (falló y hay
      // que poder reintentar).
      if (montado.current) setGuardando(false);
    }
  };

  // Popup centrado vía portal al body: los módulos tienen overflow:hidden y
  // transform en hover, que romperían un position:fixed anidado.
  return createPortal(
    <div style={veloPopup}>
      <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 14, padding: 18, width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
      {/* Barra de guardado pegada al borde superior del popup. Se reserva su
          hueco siempre (margen inferior de 16 = los 18 de padding menos sus 2
          de alto) para que al aparecer no salte todo el contenido. Sticky y no
          absolute: el popup puede tener scroll y debe quedarse arriba. */}
      <div aria-hidden="true" style={{ position: "sticky", top: 0, zIndex: 2, margin: "-18px -18px 16px", height: 2, background: guardando ? t.greenBg : "transparent", overflow: "hidden" }}>
        {guardando && <span className="v5-barrido" style={{ background: t.green }} />}
      </div>
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

      {/* Mientras guarda no se puede volver a pulsar —era lo que duplicaba el
          día— ni cancelar, que dejaría el registro a medias. */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={guardando} style={{ flex: 1, padding: "9px 16px", background: t.green, color: t.saveTextColor, border: "none", borderRadius: 8, fontSize: 13, cursor: guardando ? "default" : "pointer", fontWeight: 700, opacity: guardando ? 0.55 : 1 }}>{guardando ? "Guardando…" : "Guardar"}</button>
        <button onClick={onCancel} disabled={guardando} style={{ flex: 1, padding: "9px 16px", background: t.secondaryBg, color: t.cancelText, border: `0.5px solid ${t.secondaryBorder}`, borderRadius: 8, fontSize: 13, cursor: guardando ? "default" : "pointer", opacity: guardando ? 0.55 : 1 }}>Cancelar</button>
      </div>
      {/* Borrar vive aquí, separado de guardar, para que abrir un día desde la
          lista deje editarlo o eliminarlo sin más botones en la propia lista. */}
      {onDelete && !isNew && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${t.secondaryBorder}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onDelete} disabled={guardando} style={{ padding: "7px 14px", background: "transparent", color: t.redText, border: `0.5px solid ${t.red}`, borderRadius: 8, fontSize: 12, cursor: guardando ? "default" : "pointer", fontWeight: 600, opacity: guardando ? 0.55 : 1 }}>
            Borrar este día
          </button>
        </div>
      )}
      </div>
    </div>,
    document.body
  );
}

// ── Confirmación de borrado ──────────────────────────────────────────────────
// Antes esto era una banda al final de la lista de días operados: con la
// pantalla a media lista quedaba varios cientos de píxeles por debajo y
// parecía que el botón de borrar no hacía nada. Ahora es un diálogo centrado,
// como el resto de popups de la app.
function ConfirmarBorrado({ trade, onConfirm, onCancel, dark = false }) {
  const t = paletaPopup(dark);
  const [borrando, setBorrando] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const pulsar = async () => {
    if (borrando) return;
    setBorrando(true);
    try {
      await onConfirm();
    } finally {
      if (montado.current) setBorrando(false);
    }
  };

  const pnl = Number(trade?.pnl) || 0;

  return createPortal(
    <div style={veloPopup}>
      <div role="alertdialog" aria-label="Borrar este día" style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 14, padding: 18, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.red} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 4h4M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" /></svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Borrar este día</span>
        </div>

        <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5, marginBottom: 12 }}>
          Se elimina el registro y no se puede deshacer.
        </div>

        {/* Qué registro se va a borrar. Con un día duplicado los dos se ven
            idénticos y el número de registro es lo único que los distingue. */}
        {trade && (
          <div style={{ border: `0.5px solid ${t.border}`, background: t.inputBg, borderRadius: 8, padding: "10px 11px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{normalizeDateToYYYYMMDD(trade.date)}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: pnl >= 0 ? t.green : t.red, fontVariantNumeric: "tabular-nums" }}>
                {pnl >= 0 ? "+" : "−"}${Math.abs(Math.round(pnl)).toLocaleString()}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 11, color: t.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trade.account}</span>
              <span style={{ fontSize: 11, color: t.text3, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>registro #{trade.id}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={pulsar} disabled={borrando} style={{ flex: 1, padding: "9px 16px", background: t.red, color: t.saveTextColor, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: borrando ? "default" : "pointer", opacity: borrando ? 0.55 : 1 }}>
            {borrando ? "Borrando…" : "Borrar"}
          </button>
          <button onClick={onCancel} disabled={borrando} style={{ flex: 1, padding: "9px 16px", background: t.secondaryBg, color: t.cancelText, border: `0.5px solid ${t.secondaryBorder}`, borderRadius: 8, fontSize: 13, cursor: borrando ? "default" : "pointer", opacity: borrando ? 0.55 : 1 }}>
            Cancelar
          </button>
        </div>

      </div>
    </div>,
    document.body
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
  // Cada control con su nombre fijo a la derecha. Antes el nombre vivía en el
  // placeholder, así que en una cuenta con datos se veían siete cajas de
  // números sin saber cuál era cuál.
  const campoAcct = (control, etiqueta, nota) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: "0 0 140px", minWidth: 0, display: "flex" }}>{control}</span>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.3 }}>
        {etiqueta}
        {nota ? <span style={{ color: "var(--color-text-tertiary)" }}> · {nota}</span> : null}
      </span>
    </div>
  );
  const inputAcct = { width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box", fontVariantNumeric: "tabular-nums" };

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
                  ["Límite diario ($)", "daily_limit", "number"],
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
                <div className="w-full" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {campoAcct(
                    <input type="text" value={editAcct.name} onChange={e => setEditAcct({...editAcct, name: e.target.value})} style={inputAcct} />,
                    "Nombre"
                  )}
                  {campoAcct(
                    <select value={editAcct.type || "EXAMEN"} onChange={e => setEditAcct({...editAcct, type: e.target.value})} style={inputAcct}>
                      <option value="EXAMEN">Examen 📝</option>
                      <option value="REAL">Real 💼</option>
                    </select>,
                    "Tipo"
                  )}
                  {campoAcct(
                    <select value={normStatus(editAcct.status)} onChange={e => setEditAcct({...editAcct, status: e.target.value})} style={inputAcct}>
                      <option value="ACTIVE">Activa</option>
                      <option value="CLOSED">Cerrada</option>
                    </select>,
                    "Estado"
                  )}
                  {campoAcct(
                    <select
                      value={editPfCustom ? "__custom__" : (editAcct.propfirm || "Bulenox")}
                      onChange={e => {
                        if (e.target.value === "__custom__") { setEditPfCustom(true); setEditAcct({ ...editAcct, propfirm: "" }); }
                        else { setEditPfCustom(false); setEditAcct({ ...editAcct, propfirm: e.target.value }); }
                      }}
                      style={inputAcct}
                    >
                      {propfirmOpts.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                      <option value="__custom__">➕ Otra…</option>
                    </select>,
                    "Propfirm"
                  )}
                  {editPfCustom && campoAcct(
                    <input
                      type="text"
                      placeholder="Nombre de la propfirm"
                      value={editAcct.propfirm ?? ""}
                      onChange={e => setEditAcct({ ...editAcct, propfirm: e.target.value })}
                      autoFocus
                      style={{ ...inputAcct, borderColor: C.blue }}
                    />,
                    "Nueva propfirm"
                  )}
                  {campoAcct(
                    <select
                      value={editPlanId}
                      onChange={e => { setEditPlanId(e.target.value); applyPlan(e.target.value, editAcct.propfirm, editAcct, setEditAcct); }}
                      disabled={!(PROPFIRM_PLANS[editAcct.propfirm] || []).length}
                      style={{ ...inputAcct, borderColor: editPlanId ? C.blue : "var(--color-border-secondary)", opacity: (PROPFIRM_PLANS[editAcct.propfirm] || []).length ? 1 : 0.5 }}
                    >
                      <option value="">{(PROPFIRM_PLANS[editAcct.propfirm] || []).length ? "Personalizado…" : "Sin planes"}</option>
                      {(PROPFIRM_PLANS[editAcct.propfirm] || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>,
                    "Plan"
                  )}

                  <div style={{ height: 1, background: "var(--color-border-tertiary)", margin: "2px 0" }} />

                  {[
                    ["Objetivo ($)", "target", "number", null],
                    ["DD máximo ($)", "dd_limit", "number", "pierdes la cuenta"],
                    ["Límite diario ($)", "daily_limit", "number", null],
                    ["Umbral autoliq. ($)", "threshold", "number", null],
                    ["Reserva safety ($)", "safetyReserve", "number", null],
                    ["Máx. contratos", "maxContracts", "int", null],
                    ["Consistencia", "consistency", "text", null],
                  ].map(([etiqueta, field, kind, nota]) => (
                    <Fragment key={field}>
                      {campoAcct(
                        <input
                          type={kind === "text" ? "text" : "number"}
                          value={editAcct[field] !== undefined && editAcct[field] !== null ? editAcct[field] : ""}
                          onChange={e => {
                            const v = e.target.value;
                            if (kind === "text") setEditAcct({...editAcct, [field]: v === "" ? null : v});
                            else if (kind === "int") setEditAcct({...editAcct, [field]: v === "" ? null : parseInt(v)});
                            else setEditAcct({...editAcct, [field]: v === "" ? null : parseFloat(v)});
                          }}
                          style={{ ...inputAcct, borderColor: field === "threshold" ? C.red : "var(--color-border-secondary)" }}
                        />,
                        etiqueta,
                        nota
                      )}
                    </Fragment>
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
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      {a.type === "REAL" ? (
                        <span style={{ flexShrink: 0, fontSize: 9, padding: "1px 6px", borderRadius: 4, background: C.greenBg, color: C.greenText, fontWeight: 600 }}>Real</span>
                      ) : (
                        <span style={{ flexShrink: 0, fontSize: 9, padding: "1px 6px", borderRadius: 4, background: C.blueBg, color: C.blueText, fontWeight: 600 }}>Examen</span>
                      )}
                      {isClosedAcct(a) && <span style={{ flexShrink: 0, fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--color-border-secondary)", color: "var(--color-text-secondary)", fontWeight: 600 }}>Cerrada</span>}
                    </span>
                    {/* Editar y borrar suben a la cabecera: así se ahorra una fila por cuenta */}
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => { setEditingAcctId(a.id); setEditAcct(a); setEditPfCustom(false); setEditPlanId(""); }}
                        aria-label={`Editar ${a.name}`}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, cursor: "pointer", padding: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3z" /></svg>
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(a.id)}
                        aria-label={`Borrar ${a.name}`}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, cursor: "pointer", padding: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 4h4M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" /></svg>
                      </button>
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    {a.propfirm && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{a.propfirm}</span>}
                    {a.propfirm && <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>·</span>}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                      ${Math.round(a.balance ?? a.size).toLocaleString()}
                    </span>
                  </div>

                  {/* Las reglas del plan, etiquetadas: en una frase corrida se partían en dos líneas */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, borderTop: "1px solid var(--color-border-tertiary)", paddingTop: 8 }}>
                    {[
                      ["Objetivo", a.target, null],
                      ["DD máx.", a.dd_limit, null],
                      ["Diario", a.daily_limit, null],
                      ["Umbral", a.threshold, C.red],
                    ].map(([et, valor, color]) => (
                      <span key={et} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: ".4px" }}>{et}</span>
                        <span style={{ fontSize: 12, color: valor ? (color || "var(--color-text-primary)") : "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {valor ? `$${Math.round(valor).toLocaleString()}` : "—"}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
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

// El periodo en curso se compara contra el MISMO tramo del anterior. Si esta
// semana solo lleva lunes y martes, el anterior se recorta a su lunes y su
// martes: comparar dos días contra una semana entera no dice nada, y hacía que
// el acierto y el profit factor parecieran desplomarse cada lunes.
// El corte se hace por días transcurridos desde el inicio del periodo, así vale
// igual para semana, mes y año, y se acota al final del periodo anterior por si
// era más corto (febrero contra marzo).
function v2AlineaPrev(cur, prev, anchor) {
  if (anchor >= cur[1]) return { prev, parcial: false, dias: 0 };
  const dia = 86400000;
  const transcurridos = Math.round((new Date(anchor + "T00:00:00") - new Date(cur[0] + "T00:00:00")) / dia);
  if (transcurridos < 0) return { prev, parcial: false, dias: 0 };
  const finPrev = new Date(new Date(prev[0] + "T00:00:00").getTime() + transcurridos * dia);
  const fin = v2LocalIso(finPrev);
  return { prev: [prev[0], fin < prev[1] ? fin : prev[1]], parcial: true, dias: transcurridos + 1 };
}

// `offset` desplaza el periodo hacia atrás (-1 = el anterior) para poder
// navegar semana a semana o mes a mes sin perder la comparación.
function v2Ranges(period, anchor, offset = 0) {
  const a = new Date(anchor + "T00:00:00");
  const iso = v2LocalIso;
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  let cur, prev;
  if (period === "day") {
    const c = shift(a, offset);
    const p = shift(c, -1);
    cur = [iso(c), iso(c)]; prev = [iso(p), iso(p)];
  } else if (period === "week") {
    // Lunes de la semana del ancla, desplazado `offset` semanas
    const mon = shift(a, -((a.getDay() + 6) % 7) + offset * 7);
    const pm = shift(mon, -7);
    cur = [iso(mon), iso(shift(mon, 6))]; prev = [iso(pm), iso(shift(pm, 6))];
  } else if (period === "month") {
    const y = a.getFullYear(), m = a.getMonth() + offset;
    const s = new Date(y, m, 1), e = new Date(y, m + 1, 0);
    const ps = new Date(y, m - 1, 1), pe = new Date(y, m, 0);
    cur = [iso(s), iso(e)]; prev = [iso(ps), iso(pe)];
  } else {
    const y = a.getFullYear() + offset;
    cur = [`${y}-01-01`, `${y}-12-31`]; prev = [`${y - 1}-01-01`, `${y - 1}-12-31`];
  }

  const al = v2AlineaPrev(cur, prev, anchor);
  return { cur, prev: al.prev, prevParcial: al.parcial, prevDias: al.dias };
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

// Usa calcReconstructedPnlHistory, con la paleta oscura fija de V2.
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

  const rel = useMemo(() => calcReconstructedPnlHistory(trades, accountFilter, accountsList || []), [trades, accountFilter, accountsList]);
  const liqRel = useMemo(() => calcLiquidationHistory(trades, accountFilter, accountsList || []), [trades, accountFilter, accountsList]);
  const refs = useMemo(() => calcEquityRefs(trades, accountFilter, accountsList || []), [trades, accountFilter, accountsList]);

  if (rel.length < 2) return <div style={{ padding: "20px 0", color: V2.text3, fontSize: 13 }}>Sin datos suficientes</div>;

  // El eje va en dólares, no en PnL acumulado. Con la escala relativa el umbral
  // caía al sótano y aplastaba la curva contra el techo; en absoluto caben a la
  // vez las cuatro referencias que importan —base, saldo, umbral y objetivo— y la
  // distancia hasta la liquidación se lee sola.
  const { base, objetivo } = refs;
  const pts = rel.map(v => v + base);
  const liq = liqRel.map(v => (v === null || v === undefined ? null : v + base));

  const hasLiq = liq.length === pts.length && liq.some(v => v !== null && v !== undefined);
  const liqVals = hasLiq ? liq.filter(v => v !== null && v !== undefined) : [];

  const W = width || 620, H = 150, PAD = 38;  // más bajo: la tarjeta no debe comerse la pantalla
  const min = Math.min(base, ...pts, ...liqVals);
  const max = Math.max(base, ...pts, ...(objetivo !== null ? [objetivo] : []));
  const range = max - min || 1;
  const toX = i => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD / 2 - ((v - min) / range) * (H - PAD);
  const baseY = toY(base);
  const areaGreenPts = `${toX(0)},${baseY} ` + pts.map((v, i) => `${toX(i)},${Math.min(toY(v), baseY)}`).join(" ") + ` ${toX(pts.length - 1)},${baseY}`;
  const areaRedPts = `${toX(0)},${baseY} ` + pts.map((v, i) => `${toX(i)},${Math.max(toY(v), baseY)}`).join(" ") + ` ${toX(pts.length - 1)},${baseY}`;
  // La marca más próxima a la base se clava en la base, para que la línea del
  // saldo de partida lleve su cifra en el eje en vez de una etiqueta que dice
  // casi lo mismo justo al lado.
  const ticks = Array.from({ length: 5 }, (_, i) => min + (i / 4) * range);
  if (base > min && base < max) {
    let nearest = 0;
    ticks.forEach((v, i) => { if (Math.abs(v - base) < Math.abs(ticks[nearest] - base)) nearest = i; });
    ticks[nearest] = base;
  }

  const formatTick = (v) => {
    const abs = Math.abs(Math.round(v));
    return abs >= 1000 ? `$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${abs}`;
  };
  const fmtDolar = (v) => `$${Math.round(v).toLocaleString()}`;

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
            const esBase = Math.abs(v - base) < range * 0.01;
            return (
              <g key={i}>
                <line x1={PAD} y1={y} x2={W - 10} y2={y} stroke={esBase ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)"} strokeWidth={esBase ? 1 : 0.5} />
                <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={9} fill={V2.text3}>{formatTick(v)}</text>
              </g>
            );
          })}
          <polygon points={areaGreenPts} fill="url(#v2eqGreen)" />
          <polygon points={areaRedPts} fill="url(#v2eqRed)" />
          {pts.map((v, i) => {
            if (i === 0) return null;
            const avg = (pts[i - 1] + v) / 2;
            return <line key={i} x1={toX(i - 1)} y1={toY(pts[i - 1])} x2={toX(i)} y2={toY(v)} stroke={avg >= base ? V2.green : V2.red} strokeWidth={2} strokeLinecap="round" />;
          })}
          {/* Saldo de partida */}
          <line x1={PAD} y1={baseY} x2={W - 10} y2={baseY} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          {/* Objetivo: la meta a la que apunta la cuenta, en la misma escala */}
          {objetivo !== null && (
            <>
              <line x1={PAD} y1={toY(objetivo)} x2={W - 10} y2={toY(objetivo)} stroke={V2_AMBER} strokeWidth={1} strokeDasharray="5,4" opacity={0.8} pointerEvents="none" />
              <text x={PAD + 2} y={toY(objetivo) - 4} fontSize={9} fontWeight="600" fill={V2_AMBER} opacity={0.9} pointerEvents="none">Objetivo {fmtDolar(objetivo)}</text>
            </>
          )}
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
          <circle cx={toX(pts.length - 1)} cy={toY(pts[pts.length - 1])} r={3.5} fill={pts[pts.length - 1] >= base ? V2.green : V2.red} stroke={V2.card} strokeWidth={1.5} pointerEvents="none" />

          {hoverIdx !== null && (() => {
            const x = toX(hoverIdx), y = toY(pts[hoverIdx]), val = pts[hoverIdx];
            const trade = sorted[hoverIdx];
            // El saldo de ese día, en dólares, y debajo lo acumulado sobre la base
            const txt = fmtDolar(val);
            const dateStr = trade?.date ? normalizeDateToYYYYMMDD(trade.date) : "";
            const liqVal = hasLiq ? liq[hoverIdx] : null;
            // Colchón = distancia de la cuenta al umbral de liquidación
            const cushion = (liqVal === null || liqVal === undefined) ? null : val - liqVal;
            const tooltipW = 104, tooltipH = cushion === null ? 36 : 49;
            let tx = x - tooltipW / 2;
            if (tx < 5) tx = 5;
            if (tx + tooltipW > W - 5) tx = W - tooltipW - 5;
            const showBelow = y - tooltipH - 12 < 5;
            const ty = showBelow ? y + 12 : y - tooltipH - 12;
            return (
              <g pointerEvents="none">
                <line x1={x} y1={PAD / 2} x2={x} y2={H - PAD / 2} stroke={V2.border} strokeWidth={1} strokeDasharray="3,3" />
                {cushion !== null && <circle cx={x} cy={toY(liqVal)} r={3} fill={V2.red} stroke={V2.card} strokeWidth={1.5} />}
                <circle cx={x} cy={y} r={6} fill={val >= base ? V2.green : V2.red} opacity={0.3} />
                <circle cx={x} cy={y} r={3.5} fill={val >= base ? V2.green : V2.red} stroke={V2.card} strokeWidth={1.5} />
                <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={7} fill={V2.segActive} stroke={V2.border} strokeWidth={1} />
                <text x={tx + tooltipW / 2} y={ty + 15} textAnchor="middle" fontSize={11} fontWeight="700" fill={val >= base ? V2.green : V2.red}>{txt}</text>
                <text x={tx + tooltipW / 2} y={ty + 28} textAnchor="middle" fontSize={9} fill={V2.text3}>{dateStr} · {fmt(Math.round(val - base))}</text>
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

// calStats, weeks, historial mensual — con la paleta oscura fija de V2.
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
          <button className="v2-btn-ancho" onClick={onToggleWide} title={wide ? "Media anchura" : "Anchura completa"} aria-pressed={wide} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>{wide ? <IconHalf c={V2.text3} /> : <IconWide c={V2.text3} />}</button>
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
  { id: "pnlPeriodo", title: "PnL del periodo", tall: false, info: "Resultado del periodo en curso frente al mismo tramo del anterior. Si la semana lleva dos días, se compara contra esos dos días de la semana pasada." },
  { id: "profitFactor", title: "Profit factor", tall: false, info: "Ganancia bruta dividida entre pérdida bruta. Sin días en pérdida no tiene valor finito: mide calidad, no crecimiento." },
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
  trades, accountsList, onOpenV6, onRefresh, deployId,
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

  // Antes, una tarjeta a media anchura sin pareja detrás se estiraba a fila
  // completa para no dejar medio hueco. El efecto secundario era peor que el
  // hueco: mover cualquier tarjeta cambiaba el ancho de otra, y el botón de
  // anchura no hacía nada visible en la que se estiraba. Ahora el ancho es
  // siempre el que se ha elegido.
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
      prevParcial: ranges.prevParcial,
      prevDias: ranges.prevDias,
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
    const { cushion, basis, balance, threshold } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
    return { account: a, cushion, basis, balance, threshold, phase: getPhase(cushion) };
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
  const renderCard = (id, sec = "dashboard") => {
    const def = V2_CARD_DEFS.find(c => c.id === id);
    if (!def) return null;
    const lista = cardsOf(sec);
    const pos = lista.indexOf(id);
    const common = {
      title: def.title, subtitle: def.subtitle, info: def.info,
      wide: anchoDe(id) === "full",
      onRemove: () => removeCard(sec, id), onToggleWide: () => toggleAncho(id),
      onUp: () => moveCard(sec, id, -1), onDown: () => moveCard(sec, id, 1),
      canUp: pos > 0, canDown: pos >= 0 && pos < lista.length - 1,
    };
    const { cur, prev, prevParcial, prevDias, rangeLabel, onPrevRange, onNextRange, canNextRange } = statsFor(id);
    const rangeNav = { rangeLabel, onPrevRange, onNextRange, canNextRange };
    const pw = periodWord[periodOf(id)];
    const pa = periodArticle[periodOf(id)];
    // Con el periodo a medias se compara solo el mismo tramo del anterior, y hay
    // que decirlo: si no, el lector cree que enfrenta semanas completas.
    const cmpPeriodo = prevParcial
      ? <>{pa} {pw} anterior <span style={{ opacity: 0.75 }}>(mismos {prevDias} {prevDias === 1 ? "día" : "días"})</span></>
      : <>{pa} {pw} anterior</>;

    if (id === "equity") {
      return (
        <V2Card key={id} {...common}
          footer={
            // Las tres claves caben en una sola línea a 12px: con la del footer
            // (14px) la de liquidación se caía a una segunda fila en móvil.
            // Con el eje en dólares las claves útiles son las tres referencias
            // del gráfico, no el signo del área, que ya se ve por el color.
            <div style={{ display: "flex", gap: 12, flexWrap: "nowrap", fontSize: 12, whiteSpace: "nowrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 0, borderTop: "2px solid rgba(255,255,255,0.5)", display: "inline-block" }} />Base</span>
              {/* La línea de objetivo solo existe con una cuenta en juego */}
              {new Set(scoped.map(t => t.account)).size === 1 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 0, borderTop: `2px dashed ${V2_AMBER}`, display: "inline-block" }} />Objetivo</span>
              )}
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
          footer={prev.days === 0
            // Sin días operados en el periodo anterior no hay con qué comparar:
            // el porcentaje salía siempre contra cero y no significaba nada.
            ? <>Sin días operados {pa} {pw} anterior: no hay con qué comparar.</>
            : <>Tu acierto es {diff >= 0 ? "superior" : "inferior"} en <span style={{ color: diff >= 0 ? V2.green : V2.red, fontWeight: 600 }}>{Math.abs(diff)}%</span> frente a <span style={{ color: V2.green, fontWeight: 600 }}>{prev.wins} ganadores</span> / <span style={{ color: V2.text2, fontWeight: 600 }}>{prev.losses} perdedores</span> {cmpPeriodo}</>}>
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
      // El colchón es el dato más crítico de la app: cuánto queda hasta que la
      // cuenta se autoliquida. Vivía como una fila más al lado de un donut que
      // repetía lo mismo; pasa a ser la cifra principal, con el medidor de las
      // tres fases del plan debajo.
      const faseCol = (n) => (n === 3 ? V2.green : n === 2 ? V2_AMBER : V2.red);
      const col = tightest ? faseCol(tightest.phase.n) : V2.text3;
      // Lo que falta para caer a la fase de abajo. La fase 1 ya es el suelo.
      const margen = tightest && tightest.phase.min > 0 ? tightest.cushion - tightest.phase.min : null;
      return (
        <V2Card key={id} {...common}
          footer={tightest
            ? <>Cuenta más ajustada: <span style={{ color: V2.text2 }}>{tightest.account.name}</span>{tightest.basis && <> · cierre {tightest.basis}</>}</>
            : "Sin umbral de liquidación definido"}>
          <div style={{ fontSize: 12, color: V2.text2, marginBottom: 4 }}>Colchón hasta liquidación</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <span className="v2-metric" style={{ fontWeight: 700, color: V2.text, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {tightest ? `$${Math.round(tightest.cushion).toLocaleString()}` : "—"}
            </span>
            {tightest && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: col, background: `${col}29`, border: `0.5px solid ${col}73`, borderRadius: 999, padding: "3px 9px" }}>
                Fase {tightest.phase.n} · {tightest.phase.contracts} MNQ
              </span>
            )}
          </div>
          {tightest && (
            <div style={{ fontSize: 12, color: V2.text3, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
              ${Math.round(tightest.balance).toLocaleString()} de cierre · umbral en ${Math.round(tightest.threshold).toLocaleString()}
            </div>
          )}

          {/* Medidor de las tres fases: los cortes salen de PHASES */}
          {tightest && (
            <>
              <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                {PHASES.map(p => (
                  <div key={p.n} style={{
                    flex: p.n === 3 ? "2 1 0" : "1 1 0", height: 8,
                    borderRadius: p.n === 1 ? "4px 0 0 4px" : p.n === 3 ? "0 4px 4px 0" : 0,
                    background: p.n === tightest.phase.n ? faseCol(p.n) : `${faseCol(p.n)}59`,
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
                {PHASES.map(p => (
                  <span key={p.n} style={{
                    flex: p.n === 3 ? "2 1 0" : "1 1 0", fontSize: 9,
                    color: p.n === tightest.phase.n ? faseCol(p.n) : V2.text3,
                    fontWeight: p.n === tightest.phase.n ? 600 : 400,
                  }}>
                    {p.name}{p.n === tightest.phase.n ? " · estás aquí" : ""}
                  </span>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            {tightest && (
              <div className="v2-row"><span>SL / TP de la fase</span><b style={{ color: V2.text }}>${tightest.phase.sl} / ${tightest.phase.tp}</b></div>
            )}
            {margen !== null && (
              <div className="v2-row" style={{ borderBottom: "none" }}>
                <span>Margen antes de bajar de fase</span>
                <b style={{ color: V2_AMBER }}>${Math.round(margen).toLocaleString()}</b>
              </div>
            )}
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
        const { balance, basis, threshold } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
        const base = a.startSize ?? a.size;
        return { name: a.name, balance: balance || 0, base, pnl: (balance || 0) - base, basis, status: a.status, target: Number(a.target) || 0, threshold };
      });

      // Cuánto falta para el objetivo. El ámbar es el mismo de la línea de
      // objetivo del gráfico, para que se lean como la misma cosa. A partir del
      // 95% pasa a ámbar también la barra: es el momento en que toca mirar la
      // regla de consistencia, no cuando ya has pasado.
      const progreso = (r) => {
        if (!r.target) return null;
        const objetivo = r.base + r.target;
        const falta = objetivo - r.balance;
        const pct = Math.max(0, Math.min(100, ((r.balance - r.base) / r.target) * 100));
        // Dónde cae el cierre de la cuenta en esta misma escala. Con drawdown
        // trailing y la cuenta en ganancias el umbral sube y queda DENTRO de
        // la barra; al principio (o con las cuentas EOD) está por debajo de la
        // base y no cabe: entonces la marca se pega al extremo izquierdo en
        // vez de estirar la barra, que descuadraría el porcentaje.
        const liq = r.threshold
          ? {
              pct: Math.max(0, Math.min(100, ((r.threshold - r.base) / r.target) * 100)),
              colchon: r.balance - r.threshold,
              fuera: r.threshold <= r.base,
            }
          : null;
        return { objetivo, falta, pct, cerca: pct >= 95, liq };
      };

      // Una sola cuenta: cifra grande. Varias: lista con nombre y saldo.
      if (rows.length === 1) {
        const r = rows[0];
        const pct = r.base ? Math.round((r.pnl / r.base) * 100) : null;
        return (
          <V2Card key={id} {...common}
            footer={<span style={{ fontSize: 12 }}>Base ${Math.round(r.base).toLocaleString()} · acumulado <span style={{ color: r.pnl >= 0 ? V2.green : V2.red }}>{fmt(Math.round(r.pnl))}</span>{r.basis && <> · cierre {r.basis}</>}</span>}>
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
            {(() => {
              const pr = progreso(r);
              if (!pr) return null;
              const col = pr.cerca ? V2_AMBER : V2.green;
              // El tramo a la izquierda de la marca roja se apaga: si el
              // balance llega ahí la cuenta ya está cerrada, así que ese verde
              // no es colchón de nada. El vivo mide el colchón exacto.
              const colApagado = pr.cerca ? "rgba(226,177,68,0.28)" : "rgba(78,204,163,0.28)";
              const apagado = pr.liq ? Math.min(pr.liq.pct, pr.pct) : 0;
              const vivo = Math.max(0, pr.pct - apagado);
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: V2.text2 }}>
                      {pr.falta > 0
                        ? <>Faltan <span style={{ color: V2_AMBER, fontWeight: 700 }}>${Math.round(pr.falta).toLocaleString()}</span> para el objetivo</>
                        : <span style={{ color: V2_AMBER, fontWeight: 700 }}>Objetivo alcanzado</span>}
                    </span>
                    <span style={{ fontSize: 12, color: V2.text3, fontVariantNumeric: "tabular-nums" }}>{Math.round(pr.pct)}%</span>
                  </div>
                  {/* La barra sube a 8px: sobre 6px una marca de 2px no se
                      distingue de la propia barra. */}
                  <div style={{ position: "relative", height: 8 }}>
                    <div style={{ position: "absolute", inset: 0, background: V2.segActive, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                      {apagado > 0 && <span style={{ width: `${apagado}%`, background: colApagado }} />}
                      {/* Solo se redondea el extremo derecho cuando el tramo
                          apagado va delante: si no, queda una muesca. */}
                      {vivo > 0 && <span style={{ width: `${vivo}%`, background: col, borderRadius: apagado > 0 ? "0 4px 4px 0" : 4 }} />}
                    </div>
                    {pr.liq && (
                      <span
                        title={`Cierre de la cuenta en $${Math.round(r.threshold).toLocaleString()}${pr.liq.fuera ? " (por debajo de la base, fuera de la barra)" : ""}`}
                        style={{
                          position: "absolute", top: -3, bottom: -3,
                          left: `${pr.liq.pct}%`, width: pr.liq.fuera ? 3 : 2,
                          background: V2.red, borderRadius: 1,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 7 }}>
                    <span style={{ fontSize: 12, color: V2.text2 }}>
                      {!pr.liq
                        ? <span style={{ color: V2.text3 }}>Sin umbral de liquidación</span>
                        : pr.liq.colchon > 0
                          ? <>Faltan <span style={{ color: V2.red, fontWeight: 700 }}>${Math.round(pr.liq.colchon).toLocaleString()}</span> para la liquidación</>
                          : <span style={{ color: V2.red, fontWeight: 700 }}>Por debajo de la liquidación</span>}
                    </span>
                    <span style={{ fontSize: 12, color: V2_AMBER, fontVariantNumeric: "tabular-nums" }}>${Math.round(pr.objetivo).toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}
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
              <div key={r.name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
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
              {(() => {
                const pr = progreso(r);
                if (!pr) return <span style={{ fontSize: 10, color: V2.text3 }}>Sin objetivo definido</span>;
                const col = pr.cerca ? V2_AMBER : V2.green;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: "1 1 0", height: 3, background: V2.segActive, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pr.pct}%`, height: "100%", background: col, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: pr.cerca ? V2_AMBER : V2.text3, fontWeight: pr.cerca ? 700 : 400, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {pr.falta > 0 ? `faltan $${Math.round(pr.falta).toLocaleString()}` : "objetivo alcanzado"}
                    </span>
                  </div>
                );
              })()}
              </div>
              );
            })}
          </div>
        </V2Card>
      );
    }

    if (id === "pnlPeriodo") {
      const dif = cur.pnl - prev.pnl;
      // El porcentaje solo con una base positiva de la que crecer. Con el tramo
      // anterior en cero o en rojo la división no significa nada: pasar de -$100
      // a +$200 no es "+300%". En esos casos manda la diferencia en dinero, que
      // se entiende siempre.
      const d = prev.pnl > 0 ? Math.round((dif / prev.pnl) * 100) : null;
      return (
        <V2Card key={id} {...common} period={periodOf(id)} onPeriod={v => setPeriod(id, v)} {...rangeNav}>
          <V2Metric value={fmt(Math.round(cur.pnl))} deltaPct={d} up={dif >= 0}
            compare={<>
              Frente a <span style={{ color: prev.pnl >= 0 ? V2.green : V2.red, fontWeight: 600 }}>{fmt(Math.round(prev.pnl))}</span> {cmpPeriodo}
              {" · "}
              <span style={{ color: dif >= 0 ? V2.green : V2.red, fontWeight: 600 }}>{fmt(Math.round(dif))}</span>
            </>} />
        </V2Card>
      );
    }

    if (id === "profitFactor") {
      // Sin días perdedores el profit factor no es cero, es infinito: no hay
      // pérdida bruta entre la que dividir. Se pintaba 0.00 y con una semana
      // impecable la tarjeta decía justo lo contrario de lo que había pasado.
      const pfTexto = (s) => {
        if (!s.wins && !s.losses) return "—";
        return isFinite(s.pf) ? fmtN(s.pf, 2) : "∞";
      };
      // El porcentaje solo tiene sentido entre dos cifras finitas
      const comparables = isFinite(cur.pf) && isFinite(prev.pf) && prev.pf > 0;
      const d = comparables ? Math.round(((cur.pf - prev.pf) / prev.pf) * 100) : null;
      const mejor = isFinite(cur.pf) && isFinite(prev.pf) ? cur.pf >= prev.pf : !isFinite(cur.pf);
      return (
        <V2Card key={id} {...common} period={periodOf(id)} onPeriod={v => setPeriod(id, v)} {...rangeNav}>
          <V2Metric value={pfTexto(cur)} deltaPct={d} up={mejor}
            compare={<>Frente a profit factor {pfTexto(prev)} {cmpPeriodo}{!isFinite(cur.pf) && cur.wins ? " · sin días en pérdida" : ""}</>} />
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

        {/* Fila 2: controles y selector de cuenta. En Ajustes no pinta nada:
            ni se añaden trades ni se filtra por cuenta desde ahí. */}
        {nav !== "settings" && (
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
            onClick={onOpenV6}
            title="Probar el diseño V6 (estética de terminal)"
            style={{
              fontSize: 12, fontWeight: 600, padding: "0 12px", height: 42, borderRadius: 10, cursor: "pointer",
              background: "transparent", color: V2.text3, border: `1px solid ${V2.border}`, whiteSpace: "nowrap",
            }}
          >
            V6
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
        )}

        {/* Fuera de la pestaña de días: se puede pedir borrar desde cualquier
            sitio y la confirmación tiene que salir esté donde esté la vista. */}
        {deleteConfirm && (
          <ConfirmarBorrado
            trade={trades.find(t => t.id === deleteConfirm)}
            onConfirm={() => deleteTrade(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
            dark
          />
        )}

        {addingTrade && <TradeForm trade={EMPTY_TRADE} onSave={saveTrade} onCancel={() => setAddingTrade(false)} isNew accounts={activeAccountsForForm} dark />}
        {editingTrade && (
          <TradeForm
            trade={editingTrade}
            onSave={saveTrade}
            onCancel={() => setEditingTrade(null)}
            onDelete={() => { setDeleteConfirm(editingTrade.id); setEditingTrade(null); }}
            isNew={false}
            accounts={allAccountsForForm}
            dark
          />
        )}

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
            : <div className="v2-grid">{cardsOf("dashboard").map(id => renderCard(id, "dashboard"))}</div>
        )}

        {nav === "trades" && (() => {
          const sortedTrades = [...scoped].sort((a, b) => b.id - a.id);
          const perPage = 10;
          const totalPages = Math.max(1, Math.ceil(sortedTrades.length / perPage));
          const pageSafe = Math.min(tradePage, totalPages);
          const pageTrades = sortedTrades.slice((pageSafe - 1) * perPage, pageSafe * perPage);
          return (
            <div className="v5-dias-card" style={{ background: V2.card, border: `1px solid ${V2.border}`, borderRadius: 16 }}>
              <div style={{ fontSize: 19, fontWeight: 500, color: V2.text, marginBottom: 14 }}>Días operados</div>
              {/* Móvil: una ficha por día. La tabla no baja de 720px y el
                  contenedor en un iPhone son 355, así que allí no cabía.
                  La ficha entera abre el popup del día, donde se edita o se
                  borra: dos botones por fila alargaban la lista sin necesidad. */}
              <div className="v5-dias-fichas" style={{ flexDirection: "column", gap: 6 }}>
                {pageTrades.map(t => {
                  const colchon = (t.balance !== null && t.balance !== undefined && t.threshold !== null && t.threshold !== undefined)
                    ? t.balance - t.threshold
                    : null;
                  const dato = (etiqueta, valor, color) => (
                    <span style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 9, color: V2.text3, textTransform: "uppercase", letterSpacing: ".4px" }}>{etiqueta}</span>
                      <span style={{ fontSize: 12, color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{valor}</span>
                    </span>
                  );
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setAddingTrade(false); setEditingTrade(t); }}
                      aria-label={`Abrir ${t.date}`}
                      style={{
                        width: "100%", textAlign: "left", font: "inherit", cursor: "pointer",
                        background: V2.segBg, border: `0.5px solid ${V2.border}`,
                        borderLeft: `2px solid ${t.pnl === 0 ? V2.border : t.pnl > 0 ? V2.green : V2.red}`,
                        borderRadius: 8, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: V2.text, whiteSpace: "nowrap" }}>{t.date}</span>
                          <span style={{ fontSize: 11, color: V2.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.account}</span>
                        </span>
                        <span style={{ fontSize: 19, fontWeight: 700, color: t.pnl > 0 ? V2.green : t.pnl < 0 ? V2.red : V2.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", flexShrink: 0 }}>{fmt(t.pnl)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        {dato("Cierre", t.balance !== null && t.balance !== undefined ? `$${Math.round(t.balance).toLocaleString()}` : "—", V2.text2)}
                        {dato("Umbral", t.threshold !== null && t.threshold !== undefined ? `$${Math.round(t.threshold).toLocaleString()}` : "—", V2.red)}
                        {dato("Colchón", colchon !== null ? `$${Math.round(colchon).toLocaleString()}` : "—", colchon === null ? V2.text3 : colchon > 0 ? V2.green : V2.red)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="v5-dias-tabla" style={{ overflowX: "auto", position: "relative" }}>
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


// ── V6 — estética de terminal ────────────────────────────────────────────────
// Reskin visual sobre las mismas pantallas, mismos datos y mismas acciones de
// V2: por ahora solo "trades" está construida; el resto abre un aviso hasta
// que se rediseñen. Solo tema oscuro, sin equivalente en claro.
const V6 = {
  bg: "#0A0A0A",
  fg: "#E8E8E8",
  green: "#4ECCA3",
  amber: "#E2B144",
  orange: "#E0793C",
  red: "#E8536E",
  violet: "#A78BFA",
  blue: "#5AA9E6",
  dim: "#5C5C5C",
  dim2: "#8C8C8C",
  white: "#FFFFFF",
  border: "#1E1E1E",
};
const V6_MONO = "var(--font-mono-v6), ui-monospace, SFMono-Regular, Menlo, monospace";

const V6_NAV = [
  { id: "dashboard", label: "dashboard", accent: V6.green },
  { id: "trades", label: "trades", accent: V6.amber },
  { id: "calendar", label: "calendario", accent: V6.red },
  { id: "settings", label: "ajustes", accent: V6.violet },
];

// Desplegable propio: el <select> nativo abre un popover que pinta el
// sistema operativo (no se puede restylear), así que en V6 se sustituye por
// este — mismo comportamiento de selección, pero con la caja cuadrada y la
// tipografía mono del resto de la hoja.
function V6Select({ value, onChange, options, disabled, placeholder, style, error }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const norm = options.map(o => (typeof o === "object" && o !== null ? o : { value: o, label: o }));
  const current = norm.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          fontFamily: V6_MONO, fontSize: 12, color: disabled ? V6.dim : V6.fg, background: "#101010",
          border: `1px solid ${open ? V6.green : error ? V6.red : V6.border}`, borderRadius: 2, padding: "5px 8px",
          outline: "none", width: "100%", boxSizing: "border-box", cursor: disabled ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? current.label : (placeholder || "—")}
        </span>
        <span style={{ fontSize: 9, color: V6.dim, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "#101010", border: `1px solid ${V6.border}`, borderRadius: 2,
          maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {norm.map((o, i) => {
            const sel = String(o.value) === String(value);
            return (
              <div
                key={`${o.value}-${i}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  fontFamily: V6_MONO, fontSize: 12, padding: "6px 8px", cursor: "pointer",
                  color: sel ? V6.green : V6.fg, background: sel ? "rgba(78,204,163,0.08)" : "transparent",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {sel ? "✓ " : "  "}{o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// El prompt hace de menú: el cursor parpadea junto al nombre de la hoja
// abierta y los cuatro destinos van entre corchetes debajo. La zona de toque
// es la celda entera (un cuarto del ancho x 44px), no el texto del corchete.
function V6Nav({ active, onChange }) {
  const cur = V6_NAV.find(n => n.id === active) || V6_NAV[0];
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 900,
      background: V6.bg, borderTop: `1px solid ${V6.border}`,
      padding: "8px 14px calc(8px + env(safe-area-inset-bottom, 0px))", fontFamily: V6_MONO,
    }}>
      <div style={{ fontSize: 12, color: V6.dim2 }}>
        <span style={{ color: V6.green }}>$</span> <span style={{ color: V6.dim }}>cd</span>{" "}
        <span style={{ color: cur.accent, fontWeight: 700 }}>{cur.label}</span>
        <span aria-hidden="true" className="v6-cursor" style={{ background: cur.accent }} />
      </div>
      <div style={{ display: "flex", alignItems: "stretch", height: 44, marginTop: 2 }}>
        {V6_NAV.map(n => (
          <button
            key={n.id}
            onClick={() => onChange(n.id)}
            aria-current={n.id === active ? "page" : undefined}
            aria-label={n.label}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", fontFamily: V6_MONO,
              fontSize: 11, color: n.id === active ? n.accent : V6.dim,
              fontWeight: n.id === active ? 700 : 400, cursor: "pointer", padding: 0,
            }}
          >
            [{n.label}]
          </button>
        ))}
      </div>
    </div>
  );
}

// Lista de días operados como un diff: + verde para un día ganador, − rojo
// para uno perdido, con el fondo teñido. Toca la fila para editar o borrar.
function V6Trades({ scoped, tradePage, setTradePage, onOpen }) {
  const sorted = [...scoped].sort((a, b) => b.id - a.id);
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageSafe = Math.min(tradePage, totalPages);
  const pageTrades = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const totalPnl = sorted.reduce((s, t) => s + (t.pnl || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <span style={{ color: V6.amber }}>▸</span>
        <span style={{ color: V6.white, fontWeight: 700, fontSize: 14 }}>días operados</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: V6.dim }}>{sorted.length} registros</span>
      </div>
      <div style={{ fontSize: 11, color: V6.dim, marginBottom: 10, paddingLeft: 18 }}>
        {"// toca un día para editarlo o borrarlo"}
      </div>

      {pageTrades.length === 0 ? (
        <div style={{ fontSize: 12, color: V6.dim, padding: "10px 0" }}>{"// sin días registrados"}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pageTrades.map(t => {
            const win = t.pnl > 0, loss = t.pnl < 0;
            const colchon = (t.balance != null && t.threshold != null) ? t.balance - t.threshold : null;
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                aria-label={`Abrir ${t.date}`}
                style={{
                  textAlign: "left", font: "inherit", cursor: "pointer", width: "100%",
                  background: win ? "rgba(78,204,163,0.07)" : loss ? "rgba(232,83,110,0.07)" : "transparent",
                  border: "none", borderLeft: `2px solid ${win ? V6.green : loss ? V6.red : V6.border}`,
                  padding: "5px 8px", display: "flex", flexDirection: "column", gap: 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ color: win ? V6.green : loss ? V6.red : V6.dim, fontWeight: 700 }}>
                    {win ? "+" : loss ? "-" : "·"}
                  </span>
                  <span style={{ color: V6.white }}>{t.date}</span>
                  <span style={{ fontSize: 12, color: V6.dim, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.account}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 700, color: win ? V6.green : loss ? V6.red : V6.white, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmt(t.pnl)}</span>
                </div>
                <div style={{ fontSize: 11, color: V6.dim, paddingLeft: 18 }}>
                  cierre {t.balance != null ? `$${Math.round(t.balance).toLocaleString()}` : "—"} · umbral{" "}
                  <span style={{ color: V6.red }}>{t.threshold != null ? `$${Math.round(t.threshold).toLocaleString()}` : "—"}</span> · colchón{" "}
                  <span style={{ color: colchon == null ? V6.dim : colchon > 0 ? V6.green : V6.red }}>
                    {colchon != null ? `$${Math.round(colchon).toLocaleString()}` : "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, fontSize: 12, fontFamily: V6_MONO }}>
          <button onClick={() => setTradePage(p => Math.max(1, p - 1))} disabled={pageSafe === 1} style={{ background: "none", border: "none", color: pageSafe === 1 ? V6.border : V6.dim2, cursor: pageSafe === 1 ? "default" : "pointer", fontFamily: "inherit" }}>[‹]</button>
          <span style={{ color: V6.dim2 }}>{pageSafe}/{totalPages}</span>
          <button onClick={() => setTradePage(p => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} style={{ background: "none", border: "none", color: pageSafe === totalPages ? V6.border : V6.green, cursor: pageSafe === totalPages ? "default" : "pointer", fontFamily: "inherit" }}>[›]</button>
          <span style={{ marginLeft: "auto", color: V6.dim }}>{`// ${sorted.length} días · ${fmt(totalPnl)}`}</span>
        </div>
      )}
    </div>
  );
}

// Cabecera de sección: ▸ del color de la hoja + título, con línea de
// comentario opcional debajo. Mismo ritmo en las cuatro fichas del dashboard.
function V6Sec({ accent, title, right, comment, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ color: accent }}>▸</span>
        <span style={{ color: V6.white, fontWeight: 700, fontSize: 14 }}>{title}</span>
        {right && <span style={{ marginLeft: "auto", fontSize: 11, color: V6.dim, whiteSpace: "nowrap" }}>{right}</span>}
      </div>
      {comment && <div style={{ fontSize: 11, color: V6.dim, paddingLeft: 18, marginTop: 2, marginBottom: 8 }}>{comment}</div>}
      <div style={{ paddingLeft: 18 }}>{children}</div>
    </div>
  );
}

// Carril punteado + relleno segmentado: se lee como una regla, no como una
// pastilla lisa, y es lo bastante fino para no distraer a 13px de tipo.
const v6Track = { position: "relative", height: 8, borderRadius: 1, background: "#141414", backgroundImage: "repeating-linear-gradient(90deg, #262626 0 2px, transparent 2px 4px)" };
const v6Fill = (pct, color) => ({ position: "absolute", inset: 0, width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 1, backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 14px, #0A0A0A 14px 16px)` });

// Mismo cálculo que la ficha Balance de V5 (computeCushion + objetivo/umbral
// en la misma escala): una cuenta muestra la cifra grande con su barra, varias
// muestran la lista. La marca roja de la barra es el umbral de liquidación.
function V6Balance({ liveAccounts, trades }) {
  const rows = liveAccounts.map(a => {
    const { balance, basis, threshold } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
    const base = a.startSize ?? a.size;
    return { name: a.name, balance: balance || 0, base, pnl: (balance || 0) - base, basis, status: a.status, target: Number(a.target) || 0, threshold };
  });

  const progreso = (r) => {
    if (!r.target) return null;
    const objetivo = r.base + r.target;
    const falta = objetivo - r.balance;
    const pct = Math.max(0, Math.min(100, ((r.balance - r.base) / r.target) * 100));
    const liq = r.threshold
      ? { pct: Math.max(0, Math.min(100, ((r.threshold - r.base) / r.target) * 100)), colchon: r.balance - r.threshold, fuera: r.threshold <= r.base }
      : null;
    return { objetivo, falta, pct, liq };
  };

  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: V6.dim }}>{"// sin cuentas activas"}</div>;
  }

  if (rows.length === 1) {
    const r = rows[0];
    const pct = r.base ? Math.round((r.pnl / r.base) * 100) : null;
    const pr = progreso(r);
    return (
      <div>
        <div style={{ fontSize: 12, color: V6.dim, marginBottom: 4 }}>{r.name}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: V6.white }}>${Math.round(r.balance).toLocaleString()}</span>
          {pct !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: r.pnl >= 0 ? V6.green : V6.red }}>{r.pnl >= 0 ? "↗" : "↘"} {Math.abs(pct)}%</span>
          )}
        </div>
        {pr && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: V6.dim2 }}>
                {pr.falta > 0
                  ? <>faltan <span style={{ color: V6.amber, fontWeight: 700 }}>${Math.round(pr.falta).toLocaleString()}</span> para el objetivo</>
                  : <span style={{ color: V6.amber, fontWeight: 700 }}>objetivo alcanzado</span>}
              </span>
              <span style={{ color: V6.dim }}>{Math.round(pr.pct)}%</span>
            </div>
            <div style={v6Track}>
              <div style={v6Fill(pr.pct, V6.green)} />
              {pr.liq && <div style={{ position: "absolute", top: -3, bottom: -3, left: `${pr.liq.pct}%`, width: pr.liq.fuera ? 3 : 2, background: V6.red }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 5, fontSize: 12 }}>
              <span style={{ color: V6.dim2 }}>
                {!pr.liq
                  ? <span style={{ color: V6.dim }}>sin umbral de liquidación</span>
                  : pr.liq.colchon > 0
                    ? <>faltan <span style={{ color: V6.red, fontWeight: 700 }}>${Math.round(pr.liq.colchon).toLocaleString()}</span> para la liquidación</>
                    : <span style={{ color: V6.red, fontWeight: 700 }}>por debajo de la liquidación</span>}
              </span>
              <span style={{ color: V6.amber }}>${Math.round(pr.objetivo).toLocaleString()}</span>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>
          {`base $${Math.round(r.base).toLocaleString()} · acumulado ${fmt(Math.round(r.pnl))}${r.basis ? ` · cierre ${r.basis}` : ""}`}
        </div>
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + r.balance, 0);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(r => {
          const retirada = normStatus(r.status) === "CLOSED";
          const pr = progreso(r);
          return (
            <div key={r.name}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, color: retirada ? V6.red : V6.fg, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.name}{retirada ? " [cerrada]" : ""}
                </span>
                <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: V6.white }}>${Math.round(r.balance).toLocaleString()}</span>
                  <span style={{ fontSize: 12, color: r.pnl >= 0 ? V6.green : V6.red }}>{fmt(Math.round(r.pnl))}</span>
                </span>
              </div>
              {pr ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <div style={{ ...v6Track, height: 3, flex: 1 }}><div style={v6Fill(pr.pct, V6.green)} /></div>
                  <span style={{ fontSize: 10, color: V6.dim, whiteSpace: "nowrap", flexShrink: 0 }}>{pr.falta > 0 ? `faltan $${Math.round(pr.falta).toLocaleString()}` : "objetivo alcanzado"}</span>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: V6.dim, marginTop: 2 }}>{"// sin objetivo definido"}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>{`total $${Math.round(total).toLocaleString()} en ${rows.length} cuentas`}</div>
    </div>
  );
}

// Mismo cálculo que la ficha % de acierto de V5 (v2Slice sobre el periodo
// elegido). El donut pasa a barra: a este tamaño de letra dice lo mismo en
// una línea y deja sitio a los tres datos de debajo.
function V6Acierto({ days, anchor, period, setPeriod }) {
  const ranges = v2Ranges(period, anchor, 0);
  const cur = v2Slice(days, ranges.cur);
  const prev = v2Slice(days, ranges.prev);
  const diff = Math.round(cur.wr - prev.wr);
  const cmpTxt = ranges.prevParcial ? ` (mismos ${ranges.prevDias} días)` : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: V6.green }}>{Math.round(cur.wr)}%</span>
        <div style={{ ...v6Track, flex: 1 }}><div style={v6Fill(cur.wr, V6.green)} /></div>
      </div>
      <div style={{ fontSize: 12, color: V6.dim2 }}>días operados: <b style={{ color: V6.white }}>{cur.days}</b></div>
      <div style={{ fontSize: 12, color: V6.dim2 }}>ganadores: <b style={{ color: V6.green }}>{cur.wins}</b></div>
      <div style={{ fontSize: 12, color: V6.dim2 }}>perdedores: <b style={{ color: V6.red }}>{cur.losses}</b></div>

      <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>
        {prev.days === 0
          ? `// sin días operados el periodo anterior: no hay con qué comparar`
          : `// ${diff >= 0 ? "superior" : "inferior"} en ${Math.abs(diff)}% frente a ${prev.wins}g/${prev.losses}p${cmpTxt}`}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11 }}>
        {["year", "month", "week"].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: p === period ? V6.green : V6.dim, fontWeight: p === period ? 700 : 400 }}>
            [{p === "year" ? "año" : p === "month" ? "mes" : "semana"}]
          </button>
        ))}
      </div>
    </div>
  );
}

// Mismo cálculo que la ficha PnL del periodo de V5. Fijo al mes en curso: el
// dashboard de V6 no lleva selector de periodo aquí, solo en % de acierto.
function V6PnlPeriodo({ days, anchor }) {
  const ranges = v2Ranges("month", anchor, 0);
  const cur = v2Slice(days, ranges.cur);
  const prev = v2Slice(days, ranges.prev);
  const dif = cur.pnl - prev.pnl;
  const cmpTxt = ranges.prevParcial ? ` (mismos ${ranges.prevDias} días)` : "";
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 700, color: cur.pnl >= 0 ? V6.green : V6.red }}>{fmt(Math.round(cur.pnl))}</div>
      <div style={{ fontSize: 11, color: V6.dim, marginTop: 8 }}>
        {prev.days === 0
          ? `// sin días operados el mes anterior`
          : `// frente a ${fmt(Math.round(prev.pnl))} el mes anterior${cmpTxt} · ${fmt(Math.round(dif))}`}
      </div>
    </div>
  );
}

// Las cuatro fichas ya aprobadas en el lienzo, en orden fijo. Sin gestión de
// tarjetas (añadir/quitar/reordenar): es la simplificación de esta primera
// versión, igual que Trades no lleva el filtro de cuentas cerradas todavía.
// Rejilla del mes con el pnl de cada día debajo del número, y el resumen del
// mes con mejor/peor día y el reparto ganadores/perdedores. Sin la sección
// "global desde el primer trade" ni el historial mensual de V5 todavía.
function V6Calendario({ scoped }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const sorted = [...scoped].sort((a, b) => normalizeDateToYYYYMMDD(b.date).localeCompare(normalizeDateToYYYYMMDD(a.date)));
    return sorted[0]?.date ? normalizeDateToYYYYMMDD(sorted[0].date).slice(0, 7) : v2LocalIso(new Date()).slice(0, 7);
  });

  const year = parseInt(currentMonth.split("-")[0]);
  const mo = parseInt(currentMonth.split("-")[1]) - 1;

  const handlePrev = () => { let y = year, m = mo - 1; if (m < 0) { m = 11; y -= 1; } setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`); };
  const handleNext = () => { let y = year, m = mo + 1; if (m > 11) { m = 0; y += 1; } setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`); };

  const byDate = {};
  scoped.forEach(t => {
    const d = normalizeDateToYYYYMMDD(t.date);
    if (d.startsWith(currentMonth)) {
      if (!byDate[d]) byDate[d] = { pnl: 0, count: 0 };
      byDate[d].pnl += t.pnl || 0;
      byDate[d].count++;
    }
  });

  // Semanas completas de 7 huecos (con null en los bordes del mes) para poder
  // calcular el total de cada una y ponerlo en su domingo: V6 no tiene todavía
  // la fila de "total semana" aparte que lleva V5.
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const startDow = (new Date(year, mo, 1).getDay() + 6) % 7;
  const weeks = [];
  let week = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentMonth}-${String(d).padStart(2, "0")}`;
    const dow = (new Date(year, mo, d).getDay() + 6) % 7;
    week.push({ d, key, dow, info: byDate[key] });
    if (dow === 6) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

  const entries = Object.entries(byDate);
  const daysOperados = entries.length;
  const pnlMes = entries.reduce((s, [, v]) => s + v.pnl, 0);
  const mejor = entries.reduce((m, e) => (!m || e[1].pnl > m[1].pnl ? e : m), null);
  const peor = entries.reduce((m, e) => (!m || e[1].pnl < m[1].pnl ? e : m), null);
  const wins = entries.filter(([, v]) => v.pnl > 0).length;
  const losses = entries.filter(([, v]) => v.pnl < 0).length;

  // Mismo cálculo que calStats en V5: global desde el primer trade e
  // historial por mes, sobre TODOS los trades filtrados, no solo el mes visto.
  const calStats = useMemo(() => {
    const dayMap = new Map();
    scoped.forEach(t => {
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
    return { global, months };
  }, [scoped]);
  const rangoFechas = calStats.global.first && calStats.global.last
    ? `${V2_MN[parseInt(calStats.global.first.slice(5, 7)) - 1].toLowerCase()} ${calStats.global.first.slice(0, 4)} – ${V2_MN[parseInt(calStats.global.last.slice(5, 7)) - 1].toLowerCase()} ${calStats.global.last.slice(0, 4)}`
    : "";
  const globalWr = calStats.global.winDays + calStats.global.loseDays > 0
    ? Math.round((calStats.global.winDays / (calStats.global.winDays + calStats.global.loseDays)) * 100)
    : null;

  const fmtCorto = (v) => {
    const abs = Math.abs(Math.round(v));
    return (v < 0 ? "-" : "+") + "$" + (abs >= 1000 ? `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k` : abs);
  };
  const fmtDia = (key) => { const d = new Date(`${key}T00:00:00`); return `${d.getDate()} ${V2_MN[d.getMonth()].toLowerCase()}`; };
  const navBtn = (color) => ({ background: "none", border: "none", color, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: "6px" });

  return (
    <div>
      <V6Sec
        accent={V6.red}
        title={`${V2_MFULL[mo].toLowerCase()} ${year}`}
        comment={"// pnl de cada día operado"}
        right={<span><button onClick={handlePrev} style={navBtn(V6.dim2)}>[‹]</button><button onClick={handleNext} style={navBtn(V6.dim2)}>[›]</button></span>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3, fontSize: 11 }}>
          {["lu", "ma", "mi", "ju", "vi", "sá", "do"].map(d => (
            <div key={d} style={{ textAlign: "center", color: V6.dim, paddingBottom: 2 }}>{d}</div>
          ))}
          {weeks.map((w, wi) => {
            const weekPnl = w.reduce((s, c) => s + (c?.info ? c.info.pnl : 0), 0);
            const weekHasData = w.some(c => c?.info);
            return (
              <Fragment key={wi}>
                {w.map((c, ci) => {
                  // El domingo de una semana con datos se convierte en el total
                  // de esa semana: es fin de semana, así que nunca pisa un día
                  // real operado.
                  if (ci === 6 && weekHasData) {
                    const pos = weekPnl >= 0;
                    return (
                      <div key={`t${wi}`} style={{ border: `1px solid ${pos ? V6.green : V6.red}`, borderRadius: 2, padding: "3px 0 4px", textAlign: "center", background: pos ? "rgba(78,204,163,0.08)" : "rgba(232,83,110,0.08)" }}>
                        <div style={{ fontSize: 8, color: V6.dim, textTransform: "uppercase", letterSpacing: ".3px" }}>total</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: pos ? V6.green : V6.red }}>{fmtCorto(weekPnl)}</div>
                      </div>
                    );
                  }
                  if (!c) return <div key={`e${wi}-${ci}`} />;
                  const finde = c.dow >= 5 && !c.info;
                  const col = c.info ? (c.info.pnl > 0 ? V6.green : c.info.pnl < 0 ? V6.red : V6.fg) : V6.dim;
                  const border = c.info ? (c.info.pnl > 0 ? V6.green : V6.red) : (finde ? "#141414" : V6.border);
                  return (
                    <div key={c.key} style={{ border: `1px solid ${border}`, borderRadius: 2, padding: "3px 0 4px", textAlign: "center", background: finde ? "#101010" : "transparent" }}>
                      <div style={{ fontSize: 12, color: c.info ? V6.white : (finde ? V6.dim : V6.dim2) }}>{c.d}</div>
                      <div style={{ fontSize: 9, color: col }}>{c.info ? fmtCorto(c.info.pnl) : (finde ? "·" : "—")}</div>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>
          <span style={{ color: V6.green }}>+</span> ganador &nbsp; <span style={{ color: V6.red }}>−</span> perdedor &nbsp; — sin operar &nbsp; · fin de semana &nbsp; total = suma de la semana, en el domingo
        </div>
      </V6Sec>

      <V6Sec accent={V6.red} title="resumen del mes" comment={`// ${V2_MFULL[mo].toLowerCase()} ${year}`}>
        <div style={{ fontSize: 12, color: V6.dim2 }}>días operados: <b style={{ color: V6.white }}>{daysOperados}</b></div>
        <div style={{ fontSize: 12, color: V6.dim2 }}>pnl del mes: <b style={{ color: pnlMes >= 0 ? V6.green : V6.red }}>{fmt(Math.round(pnlMes))}</b></div>
        <div style={{ fontSize: 12, color: V6.dim2 }}>
          mejor día: {mejor
            ? <><b style={{ color: V6.green }}>{fmt(Math.round(mejor[1].pnl))}</b> <span style={{ color: V6.dim }}>({fmtDia(mejor[0])})</span></>
            : <span style={{ color: V6.dim }}>—</span>}
        </div>
        <div style={{ fontSize: 12, color: V6.dim2 }}>
          peor día: {peor
            ? <><b style={{ color: V6.red }}>{fmt(Math.round(peor[1].pnl))}</b> <span style={{ color: V6.dim }}>({fmtDia(peor[0])})</span></>
            : <span style={{ color: V6.dim }}>—</span>}
        </div>

        {daysOperados > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: V6.dim }}>ganadores {wins}</span><span style={{ color: V6.dim }}>{Math.round((wins / daysOperados) * 100)}%</span>
            </div>
            <div style={{ ...v6Track, marginTop: 3, marginBottom: 6 }}><div style={v6Fill((wins / daysOperados) * 100, V6.green)} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: V6.dim }}>perdedores {losses}</span><span style={{ color: V6.dim }}>{Math.round((losses / daysOperados) * 100)}%</span>
            </div>
            <div style={{ ...v6Track, marginTop: 3 }}><div style={v6Fill((losses / daysOperados) * 100, V6.red)} /></div>
          </div>
        )}
      </V6Sec>

      {calStats.global.days > 0 && (
        <V6Sec accent={V6.red} title="global" comment={"// desde el primer trade"}>
          <div style={{ fontSize: 12, color: V6.dim2 }}>pnl total: <b style={{ color: calStats.global.pnl >= 0 ? V6.green : V6.red }}>{fmt(Math.round(calStats.global.pnl))}</b></div>
          <div style={{ fontSize: 12, color: V6.dim2 }}>win rate: <b style={{ color: V6.white }}>{globalWr !== null ? `${globalWr}%` : "—"}</b></div>
          <div style={{ fontSize: 12, color: V6.dim2 }}>
            ganado: <b style={{ color: V6.green }}>{fmt(Math.round(calStats.global.win))}</b> · perdido: <b style={{ color: V6.red }}>{fmt(Math.round(calStats.global.lose))}</b>
          </div>
          <div style={{ fontSize: 12, color: V6.dim2 }}>comisiones: <b style={{ color: V6.white }}>-${Math.round(calStats.global.comm).toLocaleString()}</b></div>
          <div style={{ fontSize: 12, color: V6.dim2 }}>días: <b style={{ color: V6.white }}>{calStats.global.days}</b> <span style={{ color: V6.dim }}>({rangoFechas})</span></div>
        </V6Sec>
      )}

      {calStats.months.length > 0 && (
        <V6Sec accent={V6.red} title="historial mensual" comment={"// pnl y días ganados/perdidos por mes"}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "4px 12px", fontSize: 11 }}>
            <span style={{ color: V6.dim }}>mes</span>
            <span style={{ color: V6.dim, textAlign: "right" }}>pnl</span>
            <span style={{ color: V6.dim, textAlign: "right" }}>g/p</span>
            <span style={{ color: V6.dim, textAlign: "right" }}>win%</span>
            {calStats.months.map(([ym, m]) => {
              const wr = m.winDays + m.loseDays > 0 ? Math.round((m.winDays / (m.winDays + m.loseDays)) * 100) : null;
              const label = `${V2_MN[parseInt(ym.slice(5, 7)) - 1].toLowerCase()} ${ym.slice(0, 4)}`;
              return (
                <Fragment key={ym}>
                  <span style={{ color: V6.fg }}>{label}</span>
                  <span style={{ color: m.pnl >= 0 ? V6.green : V6.red, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(Math.round(m.pnl))}</span>
                  <span style={{ color: V6.dim2, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.winDays}/{m.loseDays}</span>
                  <span style={{ color: V6.dim2, textAlign: "right" }}>{wr !== null ? `${wr}%` : "—"}</span>
                </Fragment>
              );
            })}
          </div>
        </V6Sec>
      )}
    </div>
  );
}

// Mismo cálculo que la ficha Fase del plan de V5: la cuenta con menos
// colchón manda, con el medidor de las tres fases (PHASES) debajo.
function V6Phase({ tightest }) {
  if (!tightest) {
    return <div style={{ fontSize: 12, color: V6.dim }}>{"// sin umbral de liquidación definido"}</div>;
  }
  const faseCol = (n) => (n === 3 ? V6.green : n === 2 ? V6.amber : V6.red);
  const col = faseCol(tightest.phase.n);
  const margen = tightest.phase.min > 0 ? tightest.cushion - tightest.phase.min : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: V6.white }}>${Math.round(tightest.cushion).toLocaleString()}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: col, border: `1px solid ${col}`, borderRadius: 2, padding: "2px 6px" }}>
          fase {tightest.phase.n} · {tightest.phase.contracts} mnq
        </span>
      </div>
      <div style={{ fontSize: 11, color: V6.dim, marginBottom: 10 }}>
        {`$${Math.round(tightest.balance).toLocaleString()} de cierre · umbral en $${Math.round(tightest.threshold).toLocaleString()}`}
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
        {PHASES.map(p => (
          <div key={p.n} style={{ flex: p.n === 3 ? 2 : 1, height: 6, background: p.n === tightest.phase.n ? faseCol(p.n) : `${faseCol(p.n)}59` }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 10, fontSize: 9 }}>
        {PHASES.map(p => (
          <span key={p.n} style={{ flex: p.n === 3 ? 2 : 1, color: p.n === tightest.phase.n ? faseCol(p.n) : V6.dim, fontWeight: p.n === tightest.phase.n ? 700 : 400 }}>
            {p.name.toLowerCase()}{p.n === tightest.phase.n ? " ·" : ""}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 12, color: V6.dim2 }}>sl / tp de la fase: <b style={{ color: V6.white }}>${tightest.phase.sl} / ${tightest.phase.tp}</b></div>
      {margen !== null && (
        <div style={{ fontSize: 12, color: V6.dim2 }}>margen antes de bajar de fase: <b style={{ color: V6.amber }}>${Math.round(margen).toLocaleString()}</b></div>
      )}
      <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>
        {`cuenta más ajustada: ${tightest.account.name}${tightest.basis ? ` · cierre ${tightest.basis}` : ""}`}
      </div>
    </div>
  );
}

// Mismo cálculo que la ficha Récords de V5: mejor/peor día operado y
// mayores rachas de días consecutivos ganando/perdiendo, sobre todo el
// histórico (no depende del periodo elegido en % de acierto).
function V6Records({ days }) {
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

  const stat = (label, day, pos) => (
    <div style={{ border: `1px solid ${pos ? V6.green : V6.red}`, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: pos ? V6.green : V6.red, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: pos ? V6.green : V6.red }}>{day ? fmt(Math.round(day.pnl)) : "—"}</div>
      <div style={{ fontSize: 10, color: V6.dim, marginTop: 2 }}>{day ? day.date : "sin datos"}</div>
    </div>
  );
  const streak = (label, n, pos) => (
    <div style={{ border: `1px solid ${V6.border}`, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: V6.dim2, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: pos ? V6.green : V6.red }}>{n} {n === 1 ? "día" : "días"}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {stat("mejor día", records.bestDay, true)}
        {stat("peor día", records.worstDay, false)}
        {streak("mejor racha ganando", records.maxWinStreak, true)}
        {streak("mejor racha perdiendo", records.maxLoseStreak, false)}
      </div>
      <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>{`histórico completo · ${days.length} días operados`}</div>
    </div>
  );
}

function V6Dashboard({ scoped, acct, accountsList, liveAccounts, trades, period, setPeriod }) {
  const days = v2Agg(scoped);
  const anchor = days.length ? days[days.length - 1][0] : v2LocalIso(new Date());

  // Igual que en V5: la fase se calcula sobre la cuenta con menos colchón de
  // las que están a la vista, no sobre una suma de todas.
  const phases = liveAccounts.map(a => {
    const { cushion, basis, balance, threshold } = computeCushion(a, trades.filter(t => t.account === a.name), a.size);
    return { account: a, cushion, basis, balance, threshold, phase: getPhase(cushion) };
  }).filter(p => p.phase);
  const tightest = phases.length ? phases.reduce((m, p) => (p.cushion < m.cushion ? p : m)) : null;

  return (
    <div>
      <V6Sec accent={V6.green} title="equity" comment={"// valor de la cuenta contra el umbral"}>
        <V2Equity trades={scoped} accountFilter={acct} accountsList={accountsList} />
        {tightest && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, color: V6.dim2 }}>balance: <b style={{ color: V6.white }}>${Math.round(tightest.balance).toLocaleString()}</b></div>
            <div style={{ fontSize: 12, color: V6.dim2 }}>umbral: <b style={{ color: V6.red }}>${Math.round(tightest.threshold).toLocaleString()}</b></div>
            <div style={{ fontSize: 12, color: V6.dim2 }}>colchón: <b style={{ color: tightest.cushion >= 0 ? V6.green : V6.red }}>${Math.round(tightest.cushion).toLocaleString()}</b></div>
          </div>
        )}
      </V6Sec>

      <V6Sec accent={V6.amber} title="balance" comment={"// saldo del último cierre registrado"}>
        <V6Balance liveAccounts={liveAccounts} trades={trades} />
      </V6Sec>

      <V6Sec accent={V6.violet} title="% de acierto" comment={"// días ganadores sobre días operados"}>
        <V6Acierto days={days} anchor={anchor} period={period} setPeriod={setPeriod} />
      </V6Sec>

      <V6Sec accent={V6.blue} title="pnl del periodo" comment={"// resultado del mes en curso"}>
        <V6PnlPeriodo days={days} anchor={anchor} />
      </V6Sec>

      <V6Sec accent={V6.red} title="fase del plan" comment={"// colchón hasta el umbral de liquidación"}>
        <V6Phase tightest={tightest} />
      </V6Sec>

      <V6Sec accent={V6.green} title="récords" comment={"// mejor y peor día, mayores rachas"}>
        <V6Records days={days} />
      </V6Sec>
    </div>
  );
}

// Formulario de edición completo: mismos campos que V5 (nombre, tipo,
// estado, propfirm con opción "otra…", plan, y los siete campos de riesgo),
// mismo payload al guardar. Sustituye a la fila normal de la cuenta mientras
// está en edición.
function V6EditAccount({
  editAcct, setEditAcct, editPfCustom, setEditPfCustom, editPlanId, setEditPlanId,
  applyEditPlan, propfirmOpts, updating, updateError, onSave, onCancel,
}) {
  const selStyle = { fontFamily: "inherit", fontSize: 12, color: V6.fg, background: "#101010", border: `1px solid ${V6.border}`, borderRadius: 2, padding: "5px 8px", outline: "none", width: "100%", boxSizing: "border-box" };
  const row = (label, control, note) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: V6.dim, flex: "0 0 88px", fontSize: 11 }}>
        {label}{note && <span style={{ opacity: 0.7 }}> · {note}</span>}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{control}</span>
    </div>
  );
  const numField = (label, field, kind, note) => row(label, (
    <input
      type={kind === "text" ? "text" : "number"}
      value={editAcct[field] !== undefined && editAcct[field] !== null ? editAcct[field] : ""}
      onChange={e => {
        const v = e.target.value;
        setEditAcct(cur => ({ ...cur, [field]: v === "" ? null : (kind === "text" ? v : kind === "int" ? parseInt(v) : parseFloat(v)) }));
      }}
      style={{ ...selStyle, borderColor: field === "threshold" ? V6.red : V6.border }}
    />
  ), note);

  return (
    <div style={{ border: `1px solid ${V6.violet}`, padding: "10px 10px 12px", background: "rgba(167,139,250,0.05)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
        {row("nombre", <input value={editAcct.name} onChange={e => setEditAcct(cur => ({ ...cur, name: e.target.value }))} style={selStyle} />)}
        {row("tipo", (
          <V6Select
            value={editAcct.type || "EXAMEN"}
            onChange={v => setEditAcct(cur => ({ ...cur, type: v }))}
            options={[{ value: "EXAMEN", label: "examen" }, { value: "REAL", label: "real" }]}
          />
        ))}
        {row("estado", (
          <V6Select
            value={normStatus(editAcct.status)}
            onChange={v => setEditAcct(cur => ({ ...cur, status: v }))}
            options={[{ value: "ACTIVE", label: "activa" }, { value: "CLOSED", label: "cerrada" }]}
          />
        ))}
        {row("propfirm", (
          <V6Select
            value={editPfCustom ? "__custom__" : (editAcct.propfirm || "Bulenox")}
            onChange={v => {
              if (v === "__custom__") { setEditPfCustom(true); setEditAcct(cur => ({ ...cur, propfirm: "" })); }
              else { setEditPfCustom(false); setEditAcct(cur => ({ ...cur, propfirm: v })); }
            }}
            options={[...propfirmOpts.map(pf => ({ value: pf, label: pf })), { value: "__custom__", label: "otra…" }]}
          />
        ))}
        {editPfCustom && row("nueva propfirm", (
          <input value={editAcct.propfirm ?? ""} onChange={e => setEditAcct(cur => ({ ...cur, propfirm: e.target.value }))} autoFocus style={{ ...selStyle, borderColor: V6.violet }} />
        ))}
        {row("plan", (
          <V6Select
            value={editPlanId}
            onChange={v => { setEditPlanId(v); applyEditPlan(v, editAcct.propfirm); }}
            disabled={!(PROPFIRM_PLANS[editAcct.propfirm] || []).length}
            placeholder={(PROPFIRM_PLANS[editAcct.propfirm] || []).length ? "personalizado…" : "sin planes"}
            options={(PROPFIRM_PLANS[editAcct.propfirm] || []).map(p => ({ value: p.id, label: p.label }))}
          />
        ))}

        <div style={{ height: 1, background: V6.border, margin: "2px 0" }} />

        {numField("objetivo ($)", "target", "number")}
        {numField("dd máximo ($)", "dd_limit", "number", "pierdes la cuenta")}
        {numField("límite diario ($)", "daily_limit", "number")}
        {numField("umbral autoliq. ($)", "threshold", "number")}
        {numField("reserva safety ($)", "safetyReserve", "number")}
        {numField("máx. contratos", "maxContracts", "int")}
        {numField("consistencia", "consistency", "text")}

        {updateError && <div style={{ fontSize: 11, color: V6.red }}>{updateError}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onSave} disabled={updating} style={{ flex: 1, fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: updating ? V6.dim : V6.green, background: "none", border: `1px solid ${updating ? V6.border : V6.green}`, borderRadius: 2, padding: "6px 10px", cursor: updating ? "default" : "pointer" }}>
            {updating ? "guardando…" : "guardar"}
          </button>
          <button onClick={onCancel} disabled={updating} style={{ flex: 1, fontFamily: "inherit", fontSize: 12, color: V6.dim2, background: "none", border: `1px solid ${V6.border}`, borderRadius: 2, padding: "6px 10px", cursor: updating ? "default" : "pointer" }}>
            cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Nueva cuenta (crea de verdad), listado agrupado por propfirm con
// paginación y borrado (de verdad), edición completa (mismos campos que V5)
// y una única acción real de sistema. Importar CSV, sincronizar con el
// broker y borrar todos los datos aún no existen en ninguna versión.
function V6Ajustes({ accountsList, fetchAccounts }) {
  const DEFAULT_PLAN = PROPFIRM_PLANS.Bulenox[0];
  const [propfirm, setPropfirm] = useState("Bulenox");
  const [planId, setPlanId] = useState(DEFAULT_PLAN.id);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const plans = PROPFIRM_PLANS[propfirm] || [];

  const handleCreate = async () => {
    if (creating) return;
    const plan = plans.find(p => p.id === planId);
    if (!plan) { setCreateError("Elige un plan"); return; }
    if (!name.trim()) { setCreateError("Falta el nombre"); return; }
    setCreating(true);
    setCreateError("");
    try {
      const payload = {
        name: name.trim(), propfirm, status: "ACTIVE", type: "EXAMEN",
        size: plan.size, startSize: plan.size, target: plan.target,
        dd_limit: plan.dd_limit, threshold: plan.threshold,
        safetyReserve: plan.safetyReserve, maxContracts: plan.maxContracts,
        consistency: plan.consistency, daily_limit: plan.daily_limit ?? 0,
        balance: plan.size,
      };
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setName("");
        await fetchAccounts();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || "No se pudo crear la cuenta");
      }
    } catch {
      setCreateError("Error de conexión");
    } finally {
      setCreating(false);
    }
  };

  const [statusF, setStatusF] = useState("ACTIVE");
  const [pages, setPages] = useState({});
  const [deleting, setDeleting] = useState(null);
  const PER_PAGE = 5;

  const counts = { ACTIVE: 0, CLOSED: 0, ALL: accountsList.length };
  accountsList.forEach(a => { const s = normStatus(a.status); if (counts[s] !== undefined) counts[s]++; });

  const groups = useMemo(() => {
    const filtradas = accountsList.filter(a => statusF === "ALL" || normStatus(a.status) === statusF);
    const g = [];
    filtradas.forEach(a => {
      const pf = a.propfirm || "sin propfirm";
      let entry = g.find(x => x.pf === pf);
      if (!entry) { entry = { pf, items: [] }; g.push(entry); }
      entry.items.push(a);
    });
    return g;
  }, [accountsList, statusF]);

  const handleDelete = async (id) => {
    if (deleting) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (res.ok) await fetchAccounts();
    } finally {
      setDeleting(null);
    }
  };

  // Editar cuenta: mismo formulario y mismo payload que V5 (se manda la
  // cuenta entera; la API ignora los campos que no reconoce), salvo
  // sincronizar con el broker, que se queda en V5.
  const propfirmOpts = [...new Set(["Bulenox", "Lucid", ...accountsList.map(a => a.propfirm).filter(Boolean)])];
  const [editingId, setEditingId] = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [editPfCustom, setEditPfCustom] = useState(false);
  const [editPlanId, setEditPlanId] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");

  const startEdit = (a) => {
    setEditingId(a.id);
    setEditAcct(a);
    setEditPfCustom(false);
    setEditPlanId("");
    setUpdateError("");
  };
  const cancelEdit = () => { setEditingId(null); setEditAcct(null); setUpdateError(""); };
  const applyEditPlan = (pid, propfirmVal) => {
    const plan = (PROPFIRM_PLANS[propfirmVal] || []).find(p => p.id === pid);
    if (!plan) return;
    setEditAcct(cur => ({
      ...cur, size: plan.size, startSize: plan.size, target: plan.target,
      dd_limit: plan.dd_limit, threshold: plan.threshold, safetyReserve: plan.safetyReserve,
      maxContracts: plan.maxContracts, consistency: plan.consistency, daily_limit: plan.daily_limit ?? 0,
    }));
  };
  const handleUpdate = async () => {
    if (updating || !editAcct) return;
    if (!editAcct.name) { setUpdateError("Falta el nombre"); return; }
    setUpdating(true);
    setUpdateError("");
    try {
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editAcct),
      });
      if (res.ok) {
        await fetchAccounts();
        cancelEdit();
      } else {
        const data = await res.json().catch(() => ({}));
        setUpdateError(data.error || "No se pudo actualizar la cuenta");
      }
    } catch {
      setUpdateError("Error de conexión");
    } finally {
      setUpdating(false);
    }
  };

  const selStyle = { fontFamily: V6_MONO, fontSize: 12, color: V6.fg, background: "#101010", border: `1px solid ${V6.border}`, borderRadius: 2, padding: "5px 8px", outline: "none" };
  // Cada propfirm con su propio color de acento en la línea lateral, para
  // distinguirlas de un vistazo en el listado agrupado.
  const pfColor = (pf) => {
    const p = (pf || "").toLowerCase();
    if (p.includes("lucid")) return V6.amber;
    if (p.includes("bulenox")) return V6.orange;
    return V6.violet;
  };
  const dato = (label, val, color) => (
    <div>
      <div style={{ fontSize: 9, color: V6.dim, textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</div>
      <div style={{ fontSize: 12, color: color || V6.fg, fontVariantNumeric: "tabular-nums" }}>{val}</div>
    </div>
  );

  return (
    <div>
      <V6Sec accent={V6.violet} title="nueva cuenta" comment={"// el plan rellena objetivo, dd y umbral"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: V6.dim, flex: "0 0 62px" }}>propfirm</span>
            <V6Select
              value={propfirm}
              onChange={pf => { setPropfirm(pf); const first = (PROPFIRM_PLANS[pf] || [])[0]; setPlanId(first ? first.id : ""); }}
              options={Object.keys(PROPFIRM_PLANS).map(pf => ({ value: pf, label: pf }))}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: V6.dim, flex: "0 0 62px" }}>plan</span>
            <V6Select
              value={planId}
              onChange={setPlanId}
              options={plans.map(p => ({ value: p.id, label: p.label }))}
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: V6.dim, flex: "0 0 62px" }}>nombre</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="BX101840-16"
              style={{ ...selStyle, flex: 1, minWidth: 0 }}
            />
            <button onClick={handleCreate} disabled={creating} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: creating ? V6.dim : V6.green, background: "none", border: `1px solid ${creating ? V6.border : V6.green}`, borderRadius: 2, padding: "5px 10px", cursor: creating ? "default" : "pointer", whiteSpace: "nowrap" }}>
              {creating ? "creando…" : "crear"}
            </button>
          </div>
          {createError && <div style={{ fontSize: 11, color: V6.red }}>{createError}</div>}
        </div>
      </V6Sec>

      <V6Sec
        accent={V6.violet}
        title="cuentas"
        right={
          <span>
            {[["ACTIVE", "activas"], ["CLOSED", "cerradas"], ["ALL", "todas"]].map(([id, label]) => (
              <button key={id} onClick={() => setStatusF(id)} style={{ fontFamily: "inherit", fontSize: 11, color: id === statusF ? V6.violet : V6.dim, fontWeight: id === statusF ? 700 : 400, background: "none", border: "none", padding: "6px 4px", cursor: "pointer" }}>
                [{label} {counts[id]}]
              </button>
            ))}
          </span>
        }
      >
        {groups.length === 0 ? (
          <div style={{ fontSize: 12, color: V6.dim }}>{"// sin cuentas en este filtro"}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groups.map(g => {
              const page = pages[g.pf] || 1;
              const totalPages = Math.max(1, Math.ceil(g.items.length / PER_PAGE));
              const pageSafe = Math.min(page, totalPages);
              const shown = g.items.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);
              const setPage = (n) => setPages(p => ({ ...p, [g.pf]: n }));
              return (
                <div key={g.pf}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: V6.dim2, textTransform: "lowercase" }}>{g.pf} <span style={{ opacity: 0.7 }}>· {g.items.length}</span></span>
                    {totalPages > 1 && (
                      <span style={{ fontSize: 11 }}>
                        <button onClick={() => setPage(Math.max(1, pageSafe - 1))} disabled={pageSafe === 1} style={{ background: "none", border: "none", fontFamily: "inherit", color: pageSafe === 1 ? V6.border : V6.dim2, cursor: pageSafe === 1 ? "default" : "pointer", padding: "6px" }}>[‹]</button>
                        <span style={{ color: V6.dim }}>{pageSafe}/{totalPages}</span>
                        <button onClick={() => setPage(Math.min(totalPages, pageSafe + 1))} disabled={pageSafe === totalPages} style={{ background: "none", border: "none", fontFamily: "inherit", color: pageSafe === totalPages ? V6.border : V6.dim2, cursor: pageSafe === totalPages ? "default" : "pointer", padding: "6px" }}>[›]</button>
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {shown.map(a => {
                      const cerrada = normStatus(a.status) === "CLOSED";
                      if (editingId === a.id) {
                        return (
                          <V6EditAccount
                            key={a.id}
                            editAcct={editAcct}
                            setEditAcct={setEditAcct}
                            editPfCustom={editPfCustom}
                            setEditPfCustom={setEditPfCustom}
                            editPlanId={editPlanId}
                            setEditPlanId={setEditPlanId}
                            applyEditPlan={applyEditPlan}
                            propfirmOpts={propfirmOpts}
                            updating={updating}
                            updateError={updateError}
                            onSave={handleUpdate}
                            onCancel={cancelEdit}
                          />
                        );
                      }
                      return (
                        <div key={a.id} style={{ border: `1px solid ${V6.border}`, borderLeft: `2px solid ${cerrada ? V6.red : pfColor(a.propfirm)}`, padding: "8px 10px" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: cerrada ? V6.red : V6.white, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                            {cerrada && <span style={{ fontSize: 10, color: V6.red, flexShrink: 0 }}>[cerrada]</span>}
                            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: V6.white, flexShrink: 0 }}>${Math.round(a.size || 0).toLocaleString()}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginBottom: 8 }}>
                            {dato("objetivo", a.target ? `$${Math.round(a.target).toLocaleString()}` : "—")}
                            {dato("dd máx.", a.dd_limit ? `$${Math.round(a.dd_limit).toLocaleString()}` : "—")}
                            {dato("diario", a.daily_limit ? `$${Math.round(a.daily_limit).toLocaleString()}` : "—")}
                            {dato("umbral", a.threshold ? `$${Math.round(a.threshold).toLocaleString()}` : "—", V6.red)}
                          </div>
                          <div style={{ fontSize: 11 }}>
                            <button onClick={() => startEdit(a)} style={{ fontFamily: "inherit", color: V6.green, background: "none", border: "none", padding: 0, marginRight: 14, cursor: "pointer" }}>[editar]</button>
                            <button onClick={() => handleDelete(a.id)} disabled={deleting === a.id} style={{ fontFamily: "inherit", color: deleting === a.id ? V6.dim : V6.red, background: "none", border: "none", padding: 0, cursor: deleting === a.id ? "default" : "pointer" }}>
                              [{deleting === a.id ? "borrando…" : "borrar"}]
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </V6Sec>

      <V6Sec accent={V6.violet} title="sistema" comment={"// importar CSV, sincronizar con el bróker y borrar todo: por hacer"}>
        <V6ForceUpdate />
      </V6Sec>
    </div>
  );
}

// Misma lógica que "actualizar --forzar" de V5: versión sin caché, borra
// cachés y service workers, recarga con el parámetro de versión.
function V6ForceUpdate() {
  const [state, setState] = useState("idle");

  const run = async () => {
    if (state === "working") return;
    setState("working");
    let target = "";
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        target = (data.commitSha && data.commitSha !== "development") ? data.commitSha : data.deploymentId;
      }
    } catch (e) {
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

  return (
    <button onClick={run} disabled={state === "working"} style={{ fontFamily: "inherit", fontSize: 12, background: "none", border: "none", padding: 0, cursor: state === "working" ? "default" : "pointer", color: state === "working" ? V6.dim : V6.fg }}>
      <span style={{ color: V6.green }}>$</span> {state === "working" ? "actualizando…" : "actualizar --forzar"}
    </button>
  );
}

// Mismos campos, misma validación y el mismo payload de guardado que
// TradeForm; solo cambia el traje a cuadrado/mono para que combine con el
// resto de V6, en vez de reusar el popup redondeado de V5.
function V6TradeForm({ trade, onSave, onCancel, onDelete, isNew, accounts = [] }) {
  const [guardando, setGuardando] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

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
    const comm = parseLocaleFloat(initial.commission) || 0;
    initial.commission = comm === 0 ? "" : String(Math.abs(comm));
    const pnlVal = parseLocaleFloat(initial.pnl) || 0;
    initial.pnl = pnlVal === 0 ? "" : String(Math.abs(pnlVal));
    initial.balance = initial.balance === null || initial.balance === undefined ? "" : initial.balance;
    initial.threshold = initial.threshold === null || initial.threshold === undefined ? "" : initial.threshold;
    if (/^Balance cierre: \$[\d.]+ \| Umbral autoliq\.: \$[\d.]+$/.test((initial.notes || "").trim())) {
      initial.notes = "";
    }
    return initial;
  });

  const [isLoss, setIsLoss] = useState(() => (parseLocaleFloat(trade?.pnl) || 0) < 0);
  const [aviso, setAviso] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setPnl = (raw) => {
    const cleaned = raw.replace(/[^0-9.,-]/g, "");
    if (cleaned.includes("-")) setIsLoss(true);
    setForm(f => ({ ...f, pnl: cleaned.replace(/-/g, "") }));
  };

  const vacio = (v) => v === "" || v === null || v === undefined;
  const malo = (field) => !!(aviso && vacio(form[field]));

  const inputStyle = (field) => ({
    fontFamily: V6_MONO, fontSize: 12, padding: "5px 8px", borderRadius: 2,
    border: `1px solid ${malo(field) ? V6.red : V6.border}`,
    background: "#101010", color: V6.fg, outline: "none", width: "100%", boxSizing: "border-box",
  });

  const renderField = (label, field, type = "text", placeholder) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 10, color: malo(field) ? V6.red : V6.dim, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</label>
      <input
        type={type === "number" ? "text" : type}
        inputMode={type === "number" ? "decimal" : undefined}
        placeholder={placeholder}
        value={form[field] ?? ""}
        onChange={e => {
          const val = e.target.value;
          set(field, type === "number" ? val.replace(/[^0-9.,-]/g, "") : val);
        }}
        style={inputStyle(field)}
      />
    </div>
  );

  const accountOpts = accounts.some(a => a.value === form.account)
    ? accounts
    : form.account
      ? [{ value: form.account, label: form.account }, ...accounts]
      : [{ value: "", label: "selecciona una cuenta" }, ...accounts];

  const signedPnl = (isLoss ? -1 : 1) * Math.abs(parseLocaleFloat(form.pnl) || 0);
  const pnlPreview = signedPnl;
  const commPreview = Math.abs(parseLocaleFloat(form.commission) || 0);

  const faltan = [
    ["date", "fecha"],
    ["account", "cuenta"],
    ["pnl", "pnl neto"],
    ["commission", "comisión"],
    ["balance", "balance cierre"],
    ["threshold", "umbral autoliq."],
  ].filter(([k]) => vacio(form[k])).map(([, etiqueta]) => etiqueta);

  const handleSave = async () => {
    if (guardando) return;
    if (faltan.length) {
      setAviso(`falta rellenar: ${faltan.join(", ")}.`);
      return;
    }
    setAviso("");
    const pnlNum = signedPnl;
    const commNum = -Math.abs(parseLocaleFloat(form.commission) || 0);
    const balanceNum = form.balance === "" || form.balance === null || form.balance === undefined
      ? null : parseLocaleFloat(form.balance);
    const thresholdNum = form.threshold === "" || form.threshold === null || form.threshold === undefined
      ? null : parseLocaleFloat(form.threshold);

    const autoNotes = (balanceNum !== null && thresholdNum !== null)
      ? `Balance cierre: $${balanceNum} | Umbral autoliq.: $${thresholdNum}`
      : "";
    const notes = (form.notes || "").trim() || autoNotes;

    setGuardando(true);
    try {
      await onSave({
        ...form,
        date: form.date,
        account: form.account,
        pnl: pnlNum,
        commission: commNum,
        gross: pnlNum + Math.abs(commNum),
        balance: balanceNum,
        threshold: thresholdNum,
        notes,
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
    } finally {
      if (montado.current) setGuardando(false);
    }
  };

  return createPortal(
    <div style={veloPopup}>
      <div style={{ background: V6.bg, border: `1px solid ${V6.border}`, borderRadius: 2, padding: 16, width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", fontFamily: V6_MONO, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>

        <div aria-hidden="true" style={{ position: "sticky", top: 0, zIndex: 2, margin: "-16px -16px 14px", height: 2, background: guardando ? "rgba(78,204,163,0.16)" : "transparent", overflow: "hidden" }}>
          {guardando && <span className="v5-barrido" style={{ background: V6.green }} />}
        </div>

        <div style={{ fontSize: 13, marginBottom: 2 }}>
          <span style={{ color: V6.green }}>$</span> <span style={{ color: V6.white, fontWeight: 700 }}>{isNew ? "añadir día operado" : `editar día #${form.id}`}</span>
        </div>
        <div style={{ fontSize: 11, color: V6.dim, marginBottom: 14 }}>
          {"// resumen diario Bulenox · un registro por día operado"}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
          {renderField("fecha", "date", "date")}

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: malo("account") ? V6.red : V6.dim, textTransform: "uppercase", letterSpacing: ".3px" }}>cuenta</label>
            <V6Select value={form.account || ""} onChange={v => set("account", v)} options={accountOpts} error={malo("account")} />
          </div>

          {/* PnL: magnitud + selector de signo win/loss */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <label style={{ fontSize: 10, color: malo("pnl") ? V6.red : V6.dim, textTransform: "uppercase", letterSpacing: ".3px" }}>pnl neto ($)</label>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => setIsLoss(false)} aria-pressed={!isLoss} style={{ fontFamily: V6_MONO, fontSize: 10, fontWeight: 700, padding: "2px 8px", background: "none", border: `1px solid ${!isLoss ? V6.green : V6.border}`, borderRadius: 2, color: !isLoss ? V6.green : V6.dim, cursor: "pointer" }}>win</button>
                <button type="button" onClick={() => setIsLoss(true)} aria-pressed={isLoss} style={{ fontFamily: V6_MONO, fontSize: 10, fontWeight: 700, padding: "2px 8px", background: "none", border: `1px solid ${isLoss ? V6.red : V6.border}`, borderRadius: 2, color: isLoss ? V6.red : V6.dim, cursor: "pointer" }}>loss</button>
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 700, color: isLoss ? V6.red : V6.green, pointerEvents: "none" }}>
                {isLoss ? "−" : "+"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ej: 417.46"
                value={form.pnl ?? ""}
                onChange={e => setPnl(e.target.value)}
                style={{ ...inputStyle("pnl"), paddingLeft: 20, color: isLoss ? V6.red : V6.green, fontWeight: 700 }}
              />
            </div>
          </div>

          {renderField("comisión ($)", "commission", "number", "Ej: 13")}
          {renderField("balance cierre ($)", "balance", "number", "Ej: 25417")}
          {renderField("umbral autoliq. / dd ($)", "threshold", "number", "Ej: 23917")}
        </div>

        <div style={{ fontSize: 11, color: V6.dim, marginBottom: 10 }}>
          {"// pnl a guardar: "}
          <strong style={{ color: isLoss ? V6.red : V6.green }}>{pnlPreview >= 0 ? "+" : "−"}${Math.abs(pnlPreview).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
          {` · bruto: $${(pnlPreview + commPreview).toLocaleString(undefined, { maximumFractionDigits: 2 })} · la comisión se guarda en negativo automáticamente`}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: V6.dim, textTransform: "uppercase", letterSpacing: ".3px", display: "block", marginBottom: 3 }}>notas (opcional)</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="si lo dejas vacío se generan notas automáticas con balance y umbral" style={{ ...inputStyle("notes"), resize: "vertical" }} />
        </div>

        {aviso && (
          <div role="alert" style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 10px",
            borderRadius: 2, fontSize: 12, fontWeight: 600,
            background: "rgba(232,83,110,0.1)", color: V6.red, border: `1px solid ${V6.red}`,
          }}>
            <span aria-hidden="true">⚠</span>{aviso}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} disabled={guardando} style={{ flex: 1, fontFamily: V6_MONO, fontSize: 12, fontWeight: 700, padding: "8px 10px", background: "none", border: `1px solid ${guardando ? V6.border : V6.green}`, borderRadius: 2, color: guardando ? V6.dim : V6.green, cursor: guardando ? "default" : "pointer" }}>
            {guardando ? "guardando…" : "guardar"}
          </button>
          <button onClick={onCancel} disabled={guardando} style={{ flex: 1, fontFamily: V6_MONO, fontSize: 12, padding: "8px 10px", background: "none", border: `1px solid ${V6.border}`, borderRadius: 2, color: V6.dim2, cursor: guardando ? "default" : "pointer" }}>
            cancelar
          </button>
        </div>

        {onDelete && !isNew && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${V6.border}`, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onDelete} disabled={guardando} style={{ fontFamily: V6_MONO, fontSize: 12, fontWeight: 600, padding: "6px 12px", background: "none", border: `1px solid ${V6.red}`, borderRadius: 2, color: V6.red, cursor: guardando ? "default" : "pointer" }}>
              borrar este día
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Misma lógica que ConfirmarBorrado; solo cambia el traje a cuadrado/mono.
function V6ConfirmarBorrado({ trade, onConfirm, onCancel }) {
  const [borrando, setBorrando] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const pulsar = async () => {
    if (borrando) return;
    setBorrando(true);
    try {
      await onConfirm();
    } finally {
      if (montado.current) setBorrando(false);
    }
  };

  const pnl = Number(trade?.pnl) || 0;

  return createPortal(
    <div style={veloPopup}>
      <div role="alertdialog" aria-label="Borrar este día" style={{ background: V6.bg, border: `1px solid ${V6.red}`, borderRadius: 2, padding: 16, width: "100%", maxWidth: 380, fontFamily: V6_MONO, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>

        <div style={{ fontSize: 13, marginBottom: 2 }}>
          <span style={{ color: V6.red }}>$</span> <span style={{ color: V6.white, fontWeight: 700 }}>borrar este día</span>
        </div>
        <div style={{ fontSize: 11, color: V6.dim, marginBottom: 14 }}>
          {"// se elimina el registro y no se puede deshacer"}
        </div>

        {trade && (
          <div style={{ border: `1px solid ${V6.border}`, background: "#101010", borderRadius: 2, padding: "10px 11px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: V6.fg }}>{normalizeDateToYYYYMMDD(trade.date)}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: pnl >= 0 ? V6.green : V6.red, fontVariantNumeric: "tabular-nums" }}>
                {pnl >= 0 ? "+" : "−"}${Math.abs(Math.round(pnl)).toLocaleString()}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 11, color: V6.dim2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trade.account}</span>
              <span style={{ fontSize: 11, color: V6.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>registro #{trade.id}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={pulsar} disabled={borrando} style={{ flex: 1, fontFamily: V6_MONO, fontSize: 12, fontWeight: 700, padding: "8px 10px", background: "none", border: `1px solid ${borrando ? V6.border : V6.red}`, borderRadius: 2, color: borrando ? V6.dim : V6.red, cursor: borrando ? "default" : "pointer" }}>
            {borrando ? "borrando…" : "borrar"}
          </button>
          <button onClick={onCancel} disabled={borrando} style={{ flex: 1, fontFamily: V6_MONO, fontSize: 12, padding: "8px 10px", background: "none", border: `1px solid ${V6.border}`, borderRadius: 2, color: V6.dim2, cursor: borrando ? "default" : "pointer" }}>
            cancelar
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

// Mismo aviso y misma lógica ("un dismiss por domingo", vía localStorage)
// que SundayReminder; solo cambia el traje al estilo cuadrado/mono de V6,
// igual que el resto de popups de esta hoja.
function V6SundayReminder() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const today = new Date();
    if (today.getDay() !== 0) return; // 0 = domingo
    const key = `tj_sunday_dismissed_${today.toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    const key = `tj_sunday_dismissed_${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(key, "1");
    setVisible(false);
  };

  return (
    <div style={veloPopup}>
      <div style={{
        background: V6.bg, border: `1px solid ${V6.amber}`, borderRadius: 2, padding: 18,
        maxWidth: 380, width: "100%", fontFamily: V6_MONO, boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: 13, marginBottom: 2 }}>
          <span style={{ color: V6.amber }}>$</span> <span style={{ color: V6.white, fontWeight: 700 }}>recordatorio de domingo</span>
        </div>
        <div style={{ fontSize: 12, color: V6.dim2, lineHeight: 1.6, margin: "10px 0 16px" }}>
          Es domingo — recuerda actualizar los <strong style={{ color: V6.fg }}>importes de cada cuenta</strong> con los saldos reales del bróker antes de empezar la semana. Una vez actualizados, usa <strong style={{ color: V6.fg }}>&quot;Sincronizar Base&quot;</strong> en cada cuenta para que el seguimiento empiece desde cero el lunes.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={dismiss} style={{ flex: 1, fontFamily: V6_MONO, fontSize: 12, padding: "8px 10px", background: "none", border: `1px solid ${V6.border}`, borderRadius: 2, color: V6.dim2, cursor: "pointer" }}>
            ya lo hice
          </button>
          <button onClick={dismiss} style={{ flex: 1, fontFamily: V6_MONO, fontSize: 12, fontWeight: 700, padding: "8px 10px", background: "none", border: `1px solid ${V6.amber}`, borderRadius: 2, color: V6.amber, cursor: "pointer" }}>
            entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardV6({
  trades, accountsList, onExit, fetchAccounts,
  addingTrade, setAddingTrade, editingTrade, setEditingTrade,
  deleteConfirm, setDeleteConfirm, saveTrade, deleteTrade,
  activeAccountsForForm, allAccountsForForm,
}) {
  const [nav, setNav] = useState("dashboard");
  const [acct, setAcct] = useState("all");
  const [showClosed, setShowClosed] = useState(false);
  const [tradePage, setTradePage] = useState(1);
  const [acertPeriod, setAcertPeriod] = useState("month");

  const isRetired = (a) => isClosedAcct(a);
  const visibleAccounts = accountsList.filter(a => showClosed || !isRetired(a));
  const retiredCount = accountsList.filter(isRetired).length;
  const visibleNames = new Set(visibleAccounts.map(a => a.name));
  const scoped = trades.filter(t =>
    t.instrument !== "Ajuste de Broker" &&
    (acct === "all" ? visibleNames.has(t.account) : t.account === acct)
  );
  const liveAccounts = visibleAccounts.filter(a => acct === "all" || a.name === acct);

  const cur = V6_NAV.find(n => n.id === nav) || V6_NAV[0];

  return (
    <div style={{ background: V6.bg, minHeight: "100vh", fontFamily: V6_MONO, color: V6.fg }}>
      <main className="v5-main" style={{ minWidth: 0, fontSize: 13, lineHeight: 1.55 }}>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ color: V6.green }}>rip58</span><span style={{ color: V6.blue }}>@trading</span>
            <span style={{ color: V6.dim }}>:~</span><span style={{ color: V6.green }}>$</span>{" "}
            <span style={{ color: V6.white, fontWeight: 700 }}>{cur.label}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button
              onClick={() => { setEditingTrade(null); setAddingTrade(true); }}
              style={{ fontFamily: V6_MONO, fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: "8px 0", whiteSpace: "nowrap" }}
            >
              [<span style={{ color: V6.green, fontWeight: 700 }}>+ trade</span>]
            </button>
            <button
              onClick={onExit}
              title="Volver a V5"
              style={{ fontFamily: V6_MONO, fontSize: 11, color: V6.dim, background: "none", border: `1px solid ${V6.border}`, borderRadius: 2, padding: "5px 9px", cursor: "pointer" }}
            >
              v5
            </button>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: {
                    borderRadius: "2px",
                    padding: "2px",
                    background: `linear-gradient(135deg, ${V6.green}, ${V6.red})`,
                  },
                  userButtonAvatarImage: { borderRadius: "1px" },
                },
              }}
            />
          </span>
        </div>

        {/* En ajustes no pinta nada: ni se filtran trades ni se añaden desde
            ahí, y esa hoja ya tiene su propio filtro de estado por cuenta. */}
        {/* Cuentas quemadas: ocultas por defecto, se recuperan para consultar
            sus estadísticas. Si se ocultan estando seleccionada una, se vuelve
            a "todas las cuentas" para no quedarse en una cuenta invisible. */}
        {nav !== "settings" && (visibleAccounts.length > 0 || retiredCount > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            {visibleAccounts.length > 0 && (
              <div style={{ flex: "1 1 200px", minWidth: 0, maxWidth: 260 }}>
                <V6Select
                  value={acct}
                  onChange={v => { setAcct(v); setTradePage(1); }}
                  options={[
                    { value: "all", label: "todas las cuentas" },
                    ...visibleAccounts.map(a => ({ value: a.name, label: `${a.name}${isRetired(a) ? " · cerrada" : ""}` })),
                  ]}
                />
              </div>
            )}
            {retiredCount > 0 && (
              <button
                onClick={() => {
                  const next = !showClosed;
                  setShowClosed(next);
                  if (!next && acct !== "all" && accountsList.some(a => a.name === acct && isRetired(a))) setAcct("all");
                }}
                aria-pressed={showClosed}
                title={showClosed ? "Ocultar cuentas quemadas" : `Mostrar ${retiredCount} cuenta${retiredCount > 1 ? "s quemadas" : " quemada"}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontFamily: V6_MONO, fontSize: 12, fontWeight: 700,
                  padding: "5px 10px", borderRadius: 2, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  background: showClosed ? "rgba(232,83,110,0.12)" : "#101010",
                  border: `1px solid ${showClosed ? V6.red : V6.border}`,
                  color: showClosed ? V6.red : V6.dim,
                }}
              >
                <IconFlame s={13} c={showClosed ? V6.red : V6.dim} />
                {retiredCount}
              </button>
            )}
          </div>
        )}

        {deleteConfirm && (
          <V6ConfirmarBorrado
            trade={trades.find(t => t.id === deleteConfirm)}
            onConfirm={() => deleteTrade(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
        {addingTrade && <V6TradeForm trade={EMPTY_TRADE} onSave={saveTrade} onCancel={() => setAddingTrade(false)} isNew accounts={activeAccountsForForm} />}
        {editingTrade && (
          <V6TradeForm
            trade={editingTrade}
            onSave={saveTrade}
            onCancel={() => setEditingTrade(null)}
            onDelete={() => { setDeleteConfirm(editingTrade.id); setEditingTrade(null); }}
            isNew={false}
            accounts={allAccountsForForm}
          />
        )}

        {nav === "dashboard" ? (
          <V6Dashboard
            scoped={scoped}
            acct={acct}
            accountsList={accountsList}
            liveAccounts={liveAccounts}
            trades={trades}
            period={acertPeriod}
            setPeriod={setAcertPeriod}
          />
        ) : nav === "trades" ? (
          <V6Trades
            scoped={scoped}
            tradePage={tradePage}
            setTradePage={setTradePage}
            onOpen={(t) => { setAddingTrade(false); setEditingTrade(t); }}
          />
        ) : nav === "calendar" ? (
          <V6Calendario scoped={scoped} />
        ) : (
          <V6Ajustes accountsList={accountsList} fetchAccounts={fetchAccounts} />
        )}

      </main>
      <V6Nav active={nav} onChange={setNav} />
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [trades, setTrades] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [loading, setLoading] = useState(true);
  // Las cuentas se cargan en paralelo a los trades, pero el panel solo esperaba
  // a los trades. Con la lista de cuentas todavía vacía, la curva de equity se
  // reconstruye sin ninguna cuenta y sale plana en cero durante un instante,
  // hasta que llegan y se repinta. De ahí la sensación de que tarda.
  const [acctsReady, setAcctsReady] = useState(false);
  // La barra de carga arranca vacía y sube a 100% en rAF (no con una animación
  // CSS de "width", que en el arranque compite con el JS de las peticiones y
  // se ve saltar directa al final en vez de recorrerse). Hasta que llega a
  // 100% no se enseña V6, aunque los datos ya hayan llegado antes. Con
  // movimiento reducido se salta directa, sin esperar una animación que no se
  // verá.
  const [introPct, setIntroPct] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  // La barra llega a 100% y se queda ahí, quieta, hasta que el usuario pulsa
  // "abrir" — así se ve el final de la animación en vez de saltar solo a la
  // app en cuanto termina.
  const [appAbierta, setAppAbierta] = useState(false);
  useEffect(() => {
    const reducido = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duracion = reducido ? 0 : 3000;
    const inicio = performance.now();
    let frame;
    const tick = (ahora) => {
      const t = duracion === 0 ? 1 : Math.min(1, (ahora - inicio) / duracion);
      setIntroPct(Math.round(t * 100));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setIntroDone(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const [editingTrade, setEditingTrade] = useState(null);
  const [addingTrade, setAddingTrade] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // V6 (estética de terminal) es la vista principal; V5 sigue accesible desde
  // su botón "v5". Se arranca siempre en V6 y en su primera sección, sin
  // recordar la anterior.
  const [currentTab, setCurrentTab] = useState("v6");

  // En V5 y V6 el documento entero pasa a negro. Hay que tocar html y body:
  // body lleva su propio fondo claro y unos degradados que, si no, asoman por
  // la franja de estado y al hacer overscroll. También la meta theme-color,
  // que es la que tiñe la barra de estado en iOS.
  useEffect(() => {
    const dark = currentTab === "v2" || currentTab === "v6";
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
  const [deployId, setDeployId] = useState("");

  const PER_PAGE = 10;
  const isSettingsLoaded = useRef(false);

  // Load clientside options on mount
  useEffect(() => {
    // 1. Initial local cache/fallback values from LocalStorage
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

    // 2. Fetch authoritative preferences from Database and override
    const loadDbSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const dbSettings = await res.json();
          if (dbSettings && dbSettings.clerkUserId) {
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
            theme,
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
  }, [theme, aiProvider, aiKey]);

  // Devuelven los datos además de guardarlos: la verificación de fases
  // necesita leerlos ya, sin esperar al siguiente render.
  const fetchAccounts = async () => {
    try {
      // no-store: sin cabeceras de caché el navegador puede servir la lista
      // anterior, y entonces editar una cuenta no se refleja en ningún cálculo.
      const res = await fetch('/api/accounts', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAccountsList(data);
        return data;
      }
    } catch (err) {
      console.error("Error cargando cuentas:", err);
    } finally {
      setAcctsReady(true);
    }
    return null;
  };

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/trades', { cache: 'no-store' });
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

  const refreshAndVerifyPhases = async () => {
    await Promise.all([fetchAccounts(), fetchTrades()]);
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

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      {currentTab === "v6" ? <V6SundayReminder /> : <SundayReminder />}
      <h2 className="sr-only">Trading Journal Dashboard — NQ Futures Bulenox</h2>

      {!appAbierta ? (
        <div className="v5-carga-pantalla" style={{ background: V6.bg }}>
          <div style={{ width: "100%", maxWidth: 340, fontFamily: V6_MONO, boxSizing: "border-box" }}>
            <div style={{ fontSize: 13, marginBottom: 16 }}>
              <span style={{ color: V6.green }}>rip58</span><span style={{ color: V6.blue }}>@trading</span>
              <span style={{ color: V6.dim }}>:~</span><span style={{ color: V6.green }}>$</span>{" "}
              <span style={{ color: V6.white }}>cargando</span>
              <span className="v6-cursor" style={{ color: V6.white }}>_</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: V6.green, minWidth: 54, fontVariantNumeric: "tabular-nums" }}>
                {introPct}%
              </span>
              <div style={{ ...v6Track, flex: 1 }}>
                <div style={v6Fill(introPct, V6.green)} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>
              {"// cargando tus cuentas y tus días"}
            </div>
            {!loading && acctsReady && introDone && (
              <button
                onClick={() => setAppAbierta(true)}
                style={{
                  fontFamily: V6_MONO, fontSize: 12, fontWeight: 700, marginTop: 20, width: "100%",
                  padding: "9px 10px", background: "none", border: `1px solid ${V6.green}`, borderRadius: 2,
                  color: V6.green, cursor: "pointer",
                }}
              >
                [abrir]
              </button>
            )}
          </div>
        </div>
      ) : currentTab === "v2" ? (
        <DashboardV2
          trades={trades}
          accountsList={accountsList}
          onOpenV6={() => setCurrentTab("v6")}
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
      ) : (
        <DashboardV6
          trades={trades}
          accountsList={accountsList}
          onExit={() => setCurrentTab("v2")}
          fetchAccounts={fetchAccounts}
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
        />
      )}
    </div>
  );
}
