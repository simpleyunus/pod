import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DAY_MS } from './compliance.engine';

// RTMS driver-wellness limits. Defaults are the standard's; each is
// overridable by env so an operator running a stricter policy can tighten
// them without a code change.
export interface FatigueLimits {
  maxDailyMinutes: number; // 15h in any rolling 24h
  maxWeeklyMinutes: number; // 90h in any rolling 7 days
  breakEveryMinutes: number; // a break is owed every 4h of driving
  minBreakMinutes: number; // and it must be at least 30 min
}

export const DEFAULT_LIMITS: FatigueLimits = {
  maxDailyMinutes: 15 * 60,
  maxWeeklyMinutes: 90 * 60,
  breakEveryMinutes: 4 * 60,
  minBreakMinutes: 30,
};

export interface FatigueCheck {
  ok: boolean;
  dailyMinutes: number;
  weeklyMinutes: number;
  limits: FatigueLimits;
  breaches: { code: string; detail: string }[];
}

@Injectable()
export class FatigueService {
  constructor(private readonly prisma: PrismaService) {}

  private limits(): FatigueLimits {
    const n = (k: string, d: number) => Number(process.env[k] ?? d);
    return {
      maxDailyMinutes: n('FATIGUE_MAX_DAILY_MINUTES', DEFAULT_LIMITS.maxDailyMinutes),
      maxWeeklyMinutes: n('FATIGUE_MAX_WEEKLY_MINUTES', DEFAULT_LIMITS.maxWeeklyMinutes),
      breakEveryMinutes: n('FATIGUE_BREAK_EVERY_MINUTES', DEFAULT_LIMITS.breakEveryMinutes),
      minBreakMinutes: n('FATIGUE_MIN_BREAK_MINUTES', DEFAULT_LIMITS.minBreakMinutes),
    };
  }

  // Duty is a span, not a point, so a shift straddling the window boundary
  // must be counted only for the part that falls inside it.
  private overlapMinutes(start: Date, end: Date, windowStart: number, windowEnd: number) {
    const from = Math.max(start.getTime(), windowStart);
    const to = Math.min(end.getTime(), windowEnd);
    return to <= from ? 0 : (to - from) / 60_000;
  }

  async check(driverId: string, at: Date = new Date()): Promise<FatigueCheck> {
    const limits = this.limits();
    const now = at.getTime();
    const weekStart = now - 7 * DAY_MS;
    const dayStart = now - DAY_MS;

    const records = await this.prisma.driverDutyRecord.findMany({
      where: { driverId, onDutyAt: { gte: new Date(weekStart - DAY_MS) } },
      orderBy: { onDutyAt: 'asc' },
    });

    let dailyMinutes = 0;
    let weeklyMinutes = 0;
    const breaches: { code: string; detail: string }[] = [];

    for (const r of records) {
      // An open shift counts up to now.
      const end = r.offDutyAt ?? at;
      dailyMinutes += this.overlapMinutes(r.onDutyAt, end, dayStart, now);
      weeklyMinutes += this.overlapMinutes(r.onDutyAt, end, weekStart, now);

      // 30 minutes owed for every completed 4h block of driving.
      const owedBreaks = Math.floor(r.drivingMinutes / limits.breakEveryMinutes);
      const owedMinutes = owedBreaks * limits.minBreakMinutes;
      if (owedMinutes > r.breakMinutes) {
        breaches.push({
          code: 'FATIGUE_BREAKS',
          detail:
            `Shift from ${r.onDutyAt.toISOString().slice(0, 16).replace('T', ' ')} logged ` +
            `${Math.round(r.drivingMinutes / 60)}h driving with only ${r.breakMinutes} min of breaks ` +
            `(${owedMinutes} min required)`,
        });
      }
    }

    dailyMinutes = Math.round(dailyMinutes);
    weeklyMinutes = Math.round(weeklyMinutes);

    if (dailyMinutes > limits.maxDailyMinutes) {
      breaches.push({
        code: 'FATIGUE_DAILY',
        detail: `${(dailyMinutes / 60).toFixed(1)}h on duty in the last 24h, limit is ${limits.maxDailyMinutes / 60}h`,
      });
    }
    if (weeklyMinutes > limits.maxWeeklyMinutes) {
      breaches.push({
        code: 'FATIGUE_WEEKLY',
        detail: `${(weeklyMinutes / 60).toFixed(1)}h on duty in the last 7 days, limit is ${limits.maxWeeklyMinutes / 60}h`,
      });
    }

    return { ok: breaches.length === 0, dailyMinutes, weeklyMinutes, limits, breaches };
  }

  // Drivers currently in breach — feeds the driver-wellness RAG tile.
  async breachingDrivers(at: Date = new Date()) {
    const drivers = await this.prisma.driver.findMany({
      where: { active: true },
      select: { id: true, fullName: true, code: true },
    });
    const out: { id: string; fullName: string; code: string; breaches: { code: string; detail: string }[] }[] = [];
    for (const d of drivers) {
      const res = await this.check(d.id, at);
      if (!res.ok) out.push({ ...d, breaches: res.breaches });
    }
    return out;
  }

  logDuty(data: {
    driverId: string;
    assignmentId?: string;
    onDutyAt: Date;
    offDutyAt?: Date | null;
    drivingMinutes?: number;
    breakMinutes?: number;
    notes?: string | null;
  }) {
    return this.prisma.driverDutyRecord.create({ data: data as any });
  }
}
