export function normalizeDateToYYYYMMDD(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  
  let cleaned = String(dateStr).trim();
  
  // Extraer parte de la fecha si incluye hora (espacio o T)
  if (cleaned.includes(" ")) {
    cleaned = cleaned.split(" ")[0];
  } else if (cleaned.includes("T")) {
    cleaned = cleaned.split("T")[0];
  }
  
  // Normalizar separadores (. o \ a /)
  cleaned = cleaned.replace(/[\.\\]/g, "/");
  
  // Si ya tiene el formato correcto YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Dividir por guion o barra
  const separator = cleaned.includes("-") ? "-" : "/";
  const parts = cleaned.split(separator);
  
  if (parts.length === 3) {
    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    
    // YYYY/MM/DD
    if (p0.length === 4) {
      return `${p0}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`;
    }
    
    // DD/MM/YYYY o MM/DD/YYYY
    if (p2.length === 4) {
      const val0 = parseInt(p0, 10);
      const val1 = parseInt(p1, 10);
      
      if (val0 > 12) {
        // Formato DD/MM/YYYY
        return `${p2}-${p1.padStart(2, "0")}-${p0.padStart(2, "0")}`;
      } else if (val1 > 12) {
        // Formato MM/DD/YYYY
        return `${p2}-${p0.padStart(2, "0")}-${p1.padStart(2, "0")}`;
      } else {
        // Ambiguo (ej: 05/06/2026), por defecto asumimos DD/MM/YYYY (español)
        return `${p2}-${p1.padStart(2, "0")}-${p0.padStart(2, "0")}`;
      }
    }
  }
  
  // Fallback usando Date de JS
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch (e) {}
  
  return cleaned;
}

export function parseLocaleFloat(val) {
  if (val === undefined || val === null || val === "") return 0;
  let cleaned = String(val).trim();
  
  // Support for accounting parenthesis for negative numbers: (150.00) -> -150.00
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1);
  }
  
  // Remove currency symbols (like $) and other non-numeric chars except digits, dot, comma, and minus sign
  cleaned = cleaned.replace(/[^0-9.,-]/g, "");
  
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
  return isNaN(parsed) ? 0 : parsed;
}

