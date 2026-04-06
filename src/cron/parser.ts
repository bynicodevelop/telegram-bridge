/**
 * Minimal 5-field cron expression parser.
 * Supports: * , - / and numeric values.
 * Fields: minute(0-59) hour(0-23) dom(1-31) month(1-12) dow(0-7, 0&7=Sun)
 */

function parseCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    const range = stepMatch ? stepMatch[1] : part;

    let start: number;
    let end: number;

    if (range === "*") {
      start = min;
      end = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      start = a;
      end = b;
    } else {
      start = Number(range);
      end = start;
    }

    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) values.add(i);
    }
  }

  return [...values].sort((a, b) => a - b);
}

export function isValidCron(schedule: string): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const ranges: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  try {
    for (let i = 0; i < 5; i++) {
      const vals = parseCronField(parts[i], ranges[i][0], ranges[i][1]);
      if (vals.length === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function computeNextRun(schedule: string, after: Date = new Date()): number {
  const parts = schedule.trim().split(/\s+/);
  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  const doms = parseCronField(parts[2], 1, 31);
  const months = parseCronField(parts[3], 1, 12);
  const dows = parseCronField(parts[4], 0, 7).map((d) => d === 7 ? 0 : d); // normalize Sunday

  const d = new Date(after.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // start from next minute

  const MAX_ITER = 525_600; // 1 year of minutes

  for (let i = 0; i < MAX_ITER; i++) {
    const month = d.getMonth() + 1;
    const dom = d.getDate();
    const dow = d.getDay();
    const hour = d.getHours();
    const minute = d.getMinutes();

    if (!months.includes(month)) {
      // Skip to first valid month
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }

    const domMatch = doms.includes(dom);
    const dowMatch = dows.includes(dow);

    // If both dom and dow are restricted (not *), match either (OR logic per cron spec)
    const domIsWild = parts[2] === "*";
    const dowIsWild = parts[4] === "*";
    const dayMatch = (domIsWild && dowIsWild)
      || (domIsWild && dowMatch)
      || (dowIsWild && domMatch)
      || (!domIsWild && !dowIsWild && (domMatch || dowMatch));

    if (!dayMatch) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }

    if (!hours.includes(hour)) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (!minutes.includes(minute)) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }

    return d.getTime();
  }

  // Fallback: 24h from now if no match found
  return after.getTime() + 86_400_000;
}
