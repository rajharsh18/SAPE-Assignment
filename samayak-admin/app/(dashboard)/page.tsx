"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Activity,
  Building,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  WelcomeBanner,
  MetricCard,
  ChartCard,
} from "@/components/analytics/MetricCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { onAnalyticsRefresh } from "@/lib/analytics-events";
import { chartTheme } from "@/lib/chart-theme";

interface Analytics {
  roomUtilisation: {
    perRoom: Array<{
      roomId: string;
      roomNumber: string;
      type: string;
      utilisationPct: number;
    }>;
    perDepartment: Array<{ departmentName: string; utilisationPct: number }>;
  };
  emptyRoomProbability: Array<{
    period: number;
    day: string;
    probability: number;
  }>;
  underRunningCourses: Array<{
    courseId: string;
    code: string;
    name: string;
    credits: number;
    scheduledSlots: number;
    shortfallHours: number;
    branchName: string;
    semester: number;
  }>;
  avgEmptyRoomHours: {
    dailyAvgs: Array<{ day: string; avgEmptyHours: number }>;
    overallAvg: number;
  };
  computedAt: string;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        setAnalytics(await res.json());
        if (isRefresh) {
          setLive(true);
          setTimeout(() => setLive(false), 3000);
        }
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(() => fetchAnalytics(), 30000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  useEffect(() => {
    return onAnalyticsRefresh(() => fetchAnalytics(true));
  }, [fetchAnalytics]);

  const periodAvgEmpty = analytics?.emptyRoomProbability
    ? Array.from({ length: 9 }, (_, i) => {
        const periodData = analytics.emptyRoomProbability.filter(
          (d) => d.period === i + 1,
        );
        const avgProb =
          periodData.reduce((sum, d) => sum + d.probability, 0) /
          (periodData.length || 1);
        return {
          period: `Period ${i + 1}`,
          probability: Math.round(avgProb * 100),
        };
      })
    : [];

  if (loading) {
    return (
      <div className="animate-fade-in grid gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-[200px] rounded-[22px]" />
        ))}
      </div>
    );
  }

  const deptUtilisation =
    analytics?.roomUtilisation?.perDepartment?.[0]?.utilisationPct ?? 0;
  const roomChartData = analytics?.roomUtilisation?.perRoom ?? [];
  const roomChartWidth = Math.max(roomChartData.length * 52, 560);

  return (
    <div className="page-section animate-fade-in">
      <WelcomeBanner
        title="Analytics Dashboard"
        subtitle="Live metrics from timetable data — refreshes automatically on import."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted hidden sm:inline">
              Updated{" "}
              {analytics?.computedAt
                ? new Date(analytics.computedAt).toLocaleTimeString()
                : "—"}
              {live && (
                <span className="ml-1.5 text-success font-medium">· Live</span>
              )}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchAnalytics(true)}
              disabled={refreshing}
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={<Activity size={20} />}
          label="Dept-wide Utilisation"
          value={`${deptUtilisation}%`}
          tone="brand"
          sub="Average across all rooms"
          live={live}
        />
        <MetricCard
          icon={<Building size={20} />}
          label="Total Rooms"
          value={String(analytics?.roomUtilisation?.perRoom?.length ?? 0)}
          tone="success"
          sub="Active rooms monitored"
        />
        <MetricCard
          icon={<AlertTriangle size={20} />}
          label="Under-Running Courses"
          value={String(analytics?.underRunningCourses?.length ?? 0)}
          tone="warning"
          sub="Courses below required slots"
        />
        <MetricCard
          icon={<Clock size={20} />}
          label="Avg Empty Hours/Day"
          value={`${analytics?.avgEmptyRoomHours?.overallAvg ?? 0}h`}
          tone="danger"
          sub="Per room average"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 min-w-0 xl:grid-cols-2">
        <ChartCard
          title="Room Utilisation %"
          className="min-w-0 overflow-hidden"
        >
          <p className="text-xs text-text-muted -mt-2 mb-3">
            {roomChartData.length} rooms · scroll horizontally
          </p>
          <ScrollArea maxHeight={320} fade={false} className="border-0">
            <div
              style={{ width: roomChartWidth, height: 300 }}
              className="min-w-full"
            >
              <BarChart
                width={roomChartWidth}
                height={300}
                data={roomChartData}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis
                  dataKey="roomNumber"
                  tick={{ fontSize: 11, fill: chartTheme.tick }}
                  axisLine={{ stroke: chartTheme.axis }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: chartTheme.tick }}
                  axisLine={{ stroke: chartTheme.axis }}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
                  formatter={(value) => [`${value}%`, "Utilisation"]}
                />
                <Bar dataKey="utilisationPct" radius={[4, 4, 0, 0]}>
                  {roomChartData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={
                        chartTheme.barPalette[
                          index % chartTheme.barPalette.length
                        ]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </div>
          </ScrollArea>
        </ChartCard>

        <ChartCard
          title="P(Empty Room) per Period"
          className="min-w-0 overflow-hidden"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={periodAvgEmpty}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: chartTheme.tick }}
                axisLine={{ stroke: chartTheme.axis }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: chartTheme.tick }}
                axisLine={{ stroke: chartTheme.axis }}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                formatter={(value) => [`${value}%`, "P(Empty)"]}
              />
              <Bar
                dataKey="probability"
                fill={chartTheme.brand}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="md">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-[15px] font-semibold text-text-primary">
              Under-Running Courses
            </h3>
            {(analytics?.underRunningCourses?.length ?? 0) > 0 && (
              <span className="text-xs text-text-muted shrink-0">
                {analytics?.underRunningCourses?.length} courses · scroll for
                more
              </span>
            )}
          </div>
          <ScrollArea maxHeight="min(380px, 45vh)" className="bg-surface-1">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky-table-head">
                  <tr className="border-b border-border">
                    {[
                      "Course",
                      "Branch",
                      "Required",
                      "Scheduled",
                      "Shortfall",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics?.underRunningCourses?.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 text-center text-text-muted text-sm"
                      >
                        All courses are running at full capacity
                      </td>
                    </tr>
                  )}
                  {analytics?.underRunningCourses?.map((course) => (
                    <tr
                      key={course.courseId}
                      className="border-b border-border/50 last:border-b-0 hover:bg-brand-primary/3 transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold leading-snug">
                          {course.code}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-2">
                          {course.name}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-text-secondary align-top whitespace-nowrap">
                        {course.branchName} Sem {course.semester}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {course.credits} {course.credits === 1 ? "hr" : "hrs"}
                        /wk
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {course.scheduledSlots}{" "}
                        {course.scheduledSlots === 1 ? "slot" : "slots"}/wk
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <Badge variant="warning">
                          {course.shortfallHours}{" "}
                          {course.shortfallHours === 1 ? "hr" : "hrs"} short
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </Card>

        <ChartCard title="Empty Room-Hours / Day">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={analytics?.avgEmptyRoomHours?.dailyAvgs ?? []}
              margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: chartTheme.tick }}
                axisLine={{ stroke: chartTheme.axis }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartTheme.tick }}
                axisLine={{ stroke: chartTheme.axis }}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                formatter={(value) => [`${value}h`, "Avg Empty"]}
              />
              <Bar
                dataKey="avgEmptyHours"
                fill={chartTheme.warning}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
