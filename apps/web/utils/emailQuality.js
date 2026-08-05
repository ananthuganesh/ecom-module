/** Reject obvious fake / typo emails (e.g. ddsgmail.com → gmail.com). */

const BASIC = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPO_DOMAINS = {
  "ddsgmail.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmailcom.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "googlemail.co": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoocom.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "ymail.con": "ymail.com",
  "icloud.con": "icloud.com",
  "rediffmail.con": "rediffmail.com",
  "rediffmai.com": "rediffmail.com",
};

const BRAND_DOMAINS = {
  gmail: ["gmail.com", "googlemail.com"],
  googlemail: ["gmail.com", "googlemail.com"],
  yahoo: ["yahoo.com", "yahoo.co.in", "ymail.com"],
  ymail: ["ymail.com", "yahoo.com", "yahoo.co.in"],
  hotmail: ["hotmail.com", "hotmail.co.in"],
  outlook: ["outlook.com", "outlook.in", "live.com", "hotmail.com"],
  icloud: ["icloud.com", "me.com", "mac.com"],
  rediffmail: ["rediffmail.com"],
};

function domainOf(email) {
  const parts = String(email || "").toLowerCase().split("@");
  return parts.length === 2 ? parts[1].trim() : "";
}

export function suggestEmailDomain(domain) {
  const d = String(domain || "").trim().toLowerCase();
  if (!d) return null;
  if (TYPO_DOMAINS[d]) return TYPO_DOMAINS[d];
  for (const [brand, allowed] of Object.entries(BRAND_DOMAINS)) {
    if (d.includes(brand) && !allowed.includes(d)) {
      return allowed.slice().sort((a, b) => a.length - b.length)[0];
    }
  }
  return null;
}

/** @returns {string|null} user-facing error, or null if ok */
export function emailQualityError(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || !BASIC.test(value)) return "Enter a valid email.";
  const domain = domainOf(value);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "Enter a valid email.";
  }
  const suggestion = suggestEmailDomain(domain);
  if (suggestion && suggestion !== domain) {
    return `Email domain looks incorrect. Did you mean ${suggestion}?`;
  }
  return null;
}

export function isQualityEmail(email) {
  return !emailQualityError(email);
}
