import { prisma } from "./db";
import { redis } from "./redis";
import { TEACHING_PERIODS_PER_DAY } from "./pdf-parser-utils";

const CACHE_KEY = "analytics:all";
const CACHE_TTL = 60; // seconds

// ─── Room Utilisation % ───────────────────────────────────────

async function getRoomUtilisation() {
  const rooms = await prisma.room.findMany({
    include: {
      slots: true,
      department: { select: { name: true, code: true } },
    },
  });

  const TOTAL_SLOTS = TEACHING_PERIODS_PER_DAY * 6;

  const perRoom = rooms.map(
    (room: {
      id: any;
      roomNumber: any;
      type: any;
      department: { name: any; code: any };
      slots: string | any[];
    }) => ({
      roomId: room.id,
      roomNumber: room.roomNumber,
      type: room.type,
      departmentName: room.department.name,
      departmentCode: room.department.code,
      occupiedSlots: room.slots.length,
      totalSlots: TOTAL_SLOTS,
      utilisationPct:
        Math.round((room.slots.length / TOTAL_SLOTS) * 10000) / 100,
    }),
  );

  // Department-wide
  const deptMap = new Map<
    string,
    { name: string; code: string; occupied: number; total: number }
  >();
  for (const r of perRoom) {
    const key = r.departmentCode;
    if (!deptMap.has(key)) {
      deptMap.set(key, {
        name: r.departmentName,
        code: r.departmentCode,
        occupied: 0,
        total: 0,
      });
    }
    const dept = deptMap.get(key)!;
    dept.occupied += r.occupiedSlots;
    dept.total += TOTAL_SLOTS;
  }

  const perDepartment = Array.from(deptMap.values()).map((d) => ({
    departmentName: d.name,
    departmentCode: d.code,
    utilisationPct:
      d.total > 0 ? Math.round((d.occupied / d.total) * 10000) / 100 : 0,
  }));

  return { perRoom, perDepartment };
}

// ─── P(empty room) per time slot ──────────────────────────────

async function getEmptyRoomProbability() {
  const totalRooms = await prisma.room.count();
  const periods = Array.from({ length: TEACHING_PERIODS_PER_DAY }, (_, i) => i + 1);
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

  // Batch query: count occupied slots grouped by period and day
  const occupiedSlots = await prisma.timeSlot.groupBy({
    by: ["period", "day"],
    where: { roomId: { not: null } },
    _count: { id: true },
  });

  const occupiedMap = new Map<string, number>();
  for (const slot of occupiedSlots) {
    occupiedMap.set(`${slot.period}-${slot.day}`, slot._count.id);
  }

  const results = [];
  for (const period of periods) {
    for (const day of days) {
      const occupied = occupiedMap.get(`${period}-${day}`) || 0;
      const freeRooms = totalRooms - occupied;
      results.push({
        period,
        day,
        probability:
          totalRooms > 0
            ? Math.round((freeRooms / totalRooms) * 10000) / 10000
            : 0,
        freeRooms,
        totalRooms,
      });
    }
  }
  return results;
}

// ─── Under-Running Courses ────────────────────────────────────

async function getUnderRunningCourses() {
  const courses = await prisma.course.findMany({
    include: {
      slots: true,
      branch: { select: { name: true, code: true, semester: true } },
      department: { select: { name: true, code: true } },
    },
  });

  return courses
    .filter(
      (c: { slots: string | any[]; credits: number }) =>
        c.slots.length < c.credits,
    )
    .map(
      (c: {
        id: any;
        code: any;
        name: any;
        credits: number;
        slots: string | any[];
        branch: { name: any; code: any; semester: any };
        department: { name: any };
      }) => ({
        courseId: c.id,
        code: c.code,
        name: c.name,
        credits: c.credits,
        scheduledSlots: c.slots.length,
        shortfallHours: c.credits - c.slots.length,
        branchName: c.branch.name,
        branchCode: c.branch.code,
        semester: c.branch.semester,
        departmentName: c.department.name,
      }),
    );
}

// ─── Avg Empty Room-Hours per Day ─────────────────────────────

async function getAvgEmptyRoomHours() {
  const rooms = await prisma.room.findMany({
    include: { slots: true },
  });

  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const slotDuration = 1; // hours

  if (rooms.length === 0) {
    return {
      dailyAvgs: days.map((day) => ({ day, avgEmptyHours: TEACHING_PERIODS_PER_DAY })),
      overallAvg: TEACHING_PERIODS_PER_DAY,
    };
  }

  const dailyAvgs = days.map((day) => {
    const emptyHoursPerRoom = rooms.map((room) => {
      const occupied = room.slots.filter((s) => s.day === day).length;
      return (TEACHING_PERIODS_PER_DAY - occupied) * slotDuration;
    });
    const avg =
      emptyHoursPerRoom.reduce((a, b) => a + b, 0) / rooms.length;
    return { day, avgEmptyHours: Math.round(avg * 100) / 100 };
  });

  const overallAvg =
    Math.round(
      (dailyAvgs.reduce((sum, d) => sum + d.avgEmptyHours, 0) / days.length) *
        100,
    ) / 100;

  return { dailyAvgs, overallAvg };
}

// ─── Combined ─────────────────────────────────────────────────

async function computeAllMetrics() {
  const [
    roomUtilisation,
    emptyRoomProbability,
    underRunningCourses,
    avgEmptyRoomHours,
  ] = await Promise.all([
    getRoomUtilisation(),
    getEmptyRoomProbability(),
    getUnderRunningCourses(),
    getAvgEmptyRoomHours(),
  ]);

  return {
    roomUtilisation,
    emptyRoomProbability,
    underRunningCourses,
    avgEmptyRoomHours,
    computedAt: new Date().toISOString(),
  };
}

export async function getAnalytics() {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis might not be available, compute directly
  }

  const data = await computeAllMetrics();

  try {
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
  } catch {
    // Non-critical: caching failed
  }

  return data;
}

export async function invalidateAnalyticsCache() {
  try {
    await redis.del(CACHE_KEY);
  } catch {
    // Non-critical
  }
}
