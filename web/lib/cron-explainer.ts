/**
 * Comprehensive Crontab Explainer & Parser
 * Converts 5-field UNIX crontab expressions into plain human-readable English.
 */

export interface CronExplanationResult {
  isValid: boolean;
  explanation: string;
  error?: string;
}

export const CRON_PRESETS = [
  { label: "Every 6 Hours", value: "0 */6 * * *", desc: "Runs 4 times daily (00:00, 06:00, 12:00, 18:00 UTC)" },
  { label: "Daily at 02:00 UTC", value: "0 2 * * *", desc: "Runs once every night at 2:00 AM UTC (Off-peak)" },
  { label: "Daily at Midnight", value: "0 0 * * *", desc: "Runs once every night at 00:00 UTC" },
  { label: "Every 12 Hours", value: "0 */12 * * *", desc: "Runs twice daily at 00:00 and 12:00 UTC" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0", desc: "Runs once every Sunday at midnight" },
];

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

export function explainCronExpression(cron: string): CronExplanationResult {
  const trimmed = cron.trim();
  if (!trimmed) {
    return {
      isValid: false,
      explanation: "Please enter a 5-field cron expression.",
      error: "Empty expression",
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return {
      isValid: false,
      explanation: "Crontab expression must have exactly 5 parts: [minute] [hour] [day-of-month] [month] [day-of-week]",
      error: `Expected 5 fields, got ${parts.length}`,
    };
  }

  const [min, hour, dom, mon, dow] = parts;

  // Validate ranges roughly
  const isValidPart = (part: string, minVal: number, maxVal: number) => {
    if (part === "*") return true;
    if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      return !isNaN(step) && step > 0 && step <= maxVal;
    }
    // List or range or single
    const subParts = part.split(",");
    for (const sub of subParts) {
      if (sub.includes("-")) {
        const [start, end] = sub.split("-").map(Number);
        if (isNaN(start) || isNaN(end) || start < minVal || end > maxVal || start > end) return false;
      } else {
        const n = Number(sub);
        if (isNaN(n) || n < minVal || n > maxVal) return false;
      }
    }
    return true;
  };

  if (!isValidPart(min, 0, 59)) {
    return { isValid: false, explanation: "Invalid minute field (must be 0-59)", error: "Invalid minute" };
  }
  if (!isValidPart(hour, 0, 23)) {
    return { isValid: false, explanation: "Invalid hour field (must be 0-23)", error: "Invalid hour" };
  }
  if (!isValidPart(dom, 1, 31)) {
    return { isValid: false, explanation: "Invalid day of month field (must be 1-31)", error: "Invalid day of month" };
  }
  if (!isValidPart(mon, 1, 12)) {
    return { isValid: false, explanation: "Invalid month field (must be 1-12)", error: "Invalid month" };
  }
  if (!isValidPart(dow, 0, 7)) {
    return { isValid: false, explanation: "Invalid day of week field (must be 0-7, where 0 and 7 = Sunday)", error: "Invalid day of week" };
  }

  // Pre-matched patterns for idiomatic English
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { isValid: true, explanation: "Runs every hour, on the hour (at :00)" };
  }
  if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { isValid: true, explanation: `Runs every ${min.slice(2)} minutes` };
  }
  if (min === "0" && hour.startsWith("*/") && dom === "*" && mon === "*" && dow === "*") {
    return { isValid: true, explanation: `Runs every ${hour.slice(2)} hours, on the hour` };
  }
  if (min === "0" && !isNaN(Number(hour)) && dom === "*" && mon === "*" && dow === "*") {
    const h = Number(hour);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { isValid: true, explanation: `Runs daily at ${padZero(h12)}:00 ${ampm} UTC (${padZero(h)}:00 UTC)` };
  }
  if (!isNaN(Number(min)) && !isNaN(Number(hour)) && dom === "*" && mon === "*" && dow === "*") {
    const h = Number(hour);
    const m = Number(min);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { isValid: true, explanation: `Runs daily at ${padZero(h12)}:${padZero(m)} ${ampm} UTC` };
  }
  if (min === "0" && hour === "0" && dom === "*" && mon === "*" && !isNaN(Number(dow))) {
    const dayName = DAYS_OF_WEEK[Number(dow)] || "Sunday";
    return { isValid: true, explanation: `Runs once every week on ${dayName} at midnight (00:00 UTC)` };
  }
  if (!isNaN(Number(min)) && !isNaN(Number(hour)) && dom === "*" && mon === "*" && !isNaN(Number(dow))) {
    const dayName = DAYS_OF_WEEK[Number(dow)] || "Sunday";
    const h = Number(hour);
    const m = Number(min);
    return { isValid: true, explanation: `Runs every ${dayName} at ${padZero(h)}:${padZero(m)} UTC` };
  }
  if (min === "0" && hour === "0" && !isNaN(Number(dom)) && mon === "*" && dow === "*") {
    return { isValid: true, explanation: `Runs on the ${getOrdinal(Number(dom))} of every month at midnight (00:00 UTC)` };
  }

  // Construct readable explanation dynamically
  let timeDesc = "";
  if (min === "*" && hour === "*") {
    timeDesc = "every minute";
  } else if (min.startsWith("*/") && hour === "*") {
    timeDesc = `every ${min.slice(2)} minutes`;
  } else if (min === "0" && hour.startsWith("*/")) {
    timeDesc = `every ${hour.slice(2)} hours, at :00`;
  } else {
    timeDesc = `at minute ${min}, hour ${hour} UTC`;
  }

  let dayDesc = "";
  if (dom !== "*") {
    dayDesc = ` on day ${dom} of the month`;
  }
  if (mon !== "*") {
    dayDesc += ` in ${mon.split(",").map(m => MONTHS[Number(m)] || m).join(", ")}`;
  }
  if (dow !== "*") {
    dayDesc += ` on ${dow.split(",").map(d => DAYS_OF_WEEK[Number(d)] || d).join(", ")}`;
  }

  return {
    isValid: true,
    explanation: `Runs ${timeDesc}${dayDesc || " every day"}`.trim(),
  };
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
