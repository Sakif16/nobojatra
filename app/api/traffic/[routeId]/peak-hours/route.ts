import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrafficData from "@/models/TrafficData";

// GET /api/traffic/:routeId/peak-hours
// Looks at all historical traffic readings for a route, groups them by hour
// of day, and returns the hours with the highest average delay.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    await dbConnect();

    const { routeId } = await params;

    const readings = await TrafficData.find({ routeId }).sort({ recordedAt: 1 });

    if (readings.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No traffic history found for this route.",
        },
        { status: 404 }
      );
    }

    const hourlyDelays: Record<number, number[]> = {};
    readings.forEach((r) => {
      const hour = new Date(r.recordedAt).getHours();
      const delay = r.currentDurationMin - r.freeFlowDurationMin;
      if (!hourlyDelays[hour]) hourlyDelays[hour] = [];
      hourlyDelays[hour].push(delay);
    });

    const peakHours = Object.entries(hourlyDelays)
      .map(([hour, delays]) => ({
        hour: Number(hour),
        avgDelayMin: Number((delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(1)),
        samples: delays.length,
      }))
      .sort((a, b) => b.avgDelayMin - a.avgDelayMin)
      .slice(0, 3);

    return NextResponse.json({
      success: true,
      data: peakHours,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to compute peak hours.",
        error,
      },
      { status: 500 }
    );
  }
}