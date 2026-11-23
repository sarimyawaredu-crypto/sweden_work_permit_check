// Rules engine for Swedish work permit salary requirements.
// Every number here comes from migrationsverket.se. See SOURCES below and README.
// Last verified: 2026-11-23.

export const LAST_VERIFIED = "2026-11-23";

// Median monthly salary published by SCB, and the date it became current.
export const MEDIANS = [
  { from: "2025-07-01", sek: 37100 }, // 80% = 29,680 quoted by Migrationsverket in April 2026
  { from: "2026-06-16", sek: 38300 },
];

// EU Blue Card threshold: 1.25 x average gross salary (Medlingsinstitutet).
export const BLUE_CARD = [
  { from: "2025-07-09", sek: 52000 },
  { from: "2026-07-15", sek: 53625 },
];

export const NEW_RULES_START = "2026-06-01";      // 90% salary requirement
export const CATEGORY_EXEMPT_START = "2026-06-11"; // the four applicant categories
export const TRANSITION_LAST_DAY = "2026-12-01";  // last day extensions use the old 80% rule

export const RATE = { standard: 0.9, exempt: 0.75, transitional: 0.8 };

export const EXEMPT_CATEGORIES = [
  { id: "former_student", label: "Former student applying for a work permit from within Sweden" },
  { id: "startup", label: "Employee at a tech or life science startup (under 5 years old, under 100 employees)" },
  { id: "healthcare_licence", label: "Foreign trained pharmacist, doctor, nurse or dentist working towards a Swedish licence" },
  { id: "temporary_protection", label: "Held a permit under the EU Temporary Protection Directive" },
];

export const EXEMPT_OCCUPATIONS = [
  "Engineers and technicians in chemistry and chemical engineering",
  "Laboratory engineers",
  "IT operations technicians",
  "IT support technicians",
  "Systems administrators",
  "Network and systems technicians",
  "Assistant nurses in home care, home healthcare and elderly care homes",
  "Assistant nurses in habilitation services",
  "Assistant nurses in healthcare and specialist wards",
  "Assistant nurses in outpatient reception services",
  "Childcare assistants",
  "Ambulance care assistants",
  "Care assistants",
  "Breeders and caretakers of farm animals",
  "Other animal breeders and animal caretakers",
  "Crop growers and animal breeders, mixed farming",
  "Forestry workers",
  "Welders and gas cutters",
  "Structural steel erectors and heavy sheet metal workers",
  "Maintenance mechanics and machine repairers",
  "Electrical distribution technicians",
  "Butchers and meat cutters",
  "Machine operators in meat and fish processing industries",
  "Other machine operators in the food industry",
  "Other operations technicians and process monitoring operators",
  "Drivers of agricultural and forestry machinery",
  "Berry pickers and planters (not forest berry pickers)",
];

export const SOURCES = {
  salary: "https://www.migrationsverket.se/en/word-explanations/salary-requirements-for-a-work-permit.html",
  median: "https://www.migrationsverket.se/nyheter/news-archive/2026-06-16-new-median-salary-affects-the-salary-requirement-for-work-permits.html",
  exemptions: "https://www.migrationsverket.se/en/news-archive/news/2026-05-25-new-rules-for-labour-immigration---these-occupations-are-exempted.html",
  transition: "https://www.migrationsverket.se/en/word-explanations/a-good-living---maintenance-requirement-for-work-permits.html",
  blueCard: "https://migrationsverket.se/English/Private-individuals/Working-in-Sweden/Employed/Special-rules-for-certain-occupations-and-citizens-of-certain-countries/EU-blue-card.html",
};

function valueOn(table, date) {
  let hit = null;
  for (const row of table) if (date >= row.from) hit = row;
  return hit;
}

export function medianOn(date) {
  const row = valueOn(MEDIANS, date);
  if (!row) throw new RangeError(`No verified median salary for ${date}. Supported from ${MEDIANS[0].from}.`);
  return row.sek;
}

export function blueCardThresholdOn(date) {
  const row = valueOn(BLUE_CARD, date);
  if (!row) throw new RangeError(`No verified Blue Card threshold for ${date}.`);
  return row.sek;
}

/** Convert a salary to monthly gross SEK. */
export function toMonthly(amount, period = "month") {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new RangeError("Salary must be a non negative number");
  if (period === "month") return n;
  if (period === "year") return n / 12;
  throw new RangeError(`Unknown period ${period}`);
}

/**
 * Work out which rule applies and whether the salary meets it.
 * input = {
 *   monthlySalary, applicationDate (YYYY-MM-DD),
 *   type: "first" | "extension",
 *   currentPermitGrantedBefore1June: boolean (extensions only),
 *   exemptOccupation: string|null, exemptCategory: string|null,
 *   blueCard: { degreeOrExperience: boolean, monthsOfContract: number } | null
 * }
 */
export function assess(input) {
  const date = input.applicationDate;
  const median = medianOn(date);
  const salary = input.monthlySalary;
  let rule, rate, why;

  const isTransitional =
    input.type === "extension" && input.currentPermitGrantedBefore1June && date <= TRANSITION_LAST_DAY;

  if (isTransitional) {
    rule = "transitional";
    rate = RATE.transitional;
    why = "Extension of a permit granted before 1 June 2026, applied for by 1 December 2026: the old 80% maintenance requirement still applies.";
  } else if (input.exemptOccupation && EXEMPT_OCCUPATIONS.includes(input.exemptOccupation)) {
    rule = "exempt_occupation";
    rate = RATE.exempt;
    why = `"${input.exemptOccupation}" is on the Government's list of exempted occupations: 75% of the median applies.`;
  } else if (input.exemptCategory && EXEMPT_CATEGORIES.some((c) => c.id === input.exemptCategory) && date >= CATEGORY_EXEMPT_START) {
    rule = "exempt_category";
    rate = RATE.exempt;
    const label = EXEMPT_CATEGORIES.find((c) => c.id === input.exemptCategory).label;
    why = `${label}: this group is exempt from the 90% rule (from 11 June 2026), so 75% of the median applies.`;
  } else {
    rule = "standard";
    rate = RATE.standard;
    why = "Standard rule since 1 June 2026: at least 90% of the median salary current when you applied.";
  }

  const threshold = Math.ceil(median * rate);
  const margin = salary - threshold;

  let blueCard = null;
  if (input.blueCard) {
    const bcThreshold = blueCardThresholdOn(date);
    const reasons = [];
    if (salary < bcThreshold) reasons.push(`salary is ${fmt(bcThreshold - salary)} below the ${fmt(bcThreshold)} threshold`);
    if (!input.blueCard.degreeOrExperience) reasons.push("needs a degree of 180 credits or five years of relevant experience");
    if ((input.blueCard.monthsOfContract ?? 0) < 6) reasons.push("employment must last at least six months");
    blueCard = { threshold: bcThreshold, eligible: reasons.length === 0, reasons };
  }

  return {
    median, rule, rate, threshold, salary, margin,
    meets: margin >= 0,
    why,
    caveat: "The salary must also be in line with collective agreements or common practice in the occupation. Migrationsverket makes the final decision.",
    blueCard,
  };
}

export function fmt(sek) {
  return `${Math.round(sek).toLocaleString("sv-SE").replace(/ /g, " ")} SEK`;
}

/** Salary needed under each rule today: useful for a quick reference table. */
export function referenceTable(date) {
  const median = medianOn(date);
  return {
    median,
    standard: Math.ceil(median * RATE.standard),
    exempt: Math.ceil(median * RATE.exempt),
    transitional: Math.ceil(median * RATE.transitional),
    blueCard: blueCardThresholdOn(date),
  };
}
