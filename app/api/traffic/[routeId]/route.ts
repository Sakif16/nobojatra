import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrafficData from "@/models/TrafficData";

function getCongestionLevel(currentMin: number, freeFlowMin: number) {
  const ratio = currentMin / freeFlowMin;
  if (ratio < 1.2) return "low";
  if (ratio < 1.5) return "moderate";
  if (ratio < 2.0) return "high";
  return "severe";
}

// GET /api/traffic/:routeId
// Compares the latest current travel duration against the free-flow
// baseline and categorizes the congestion severity for the route.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    await dbConnect();

    const { routeId } = await params;

    const latest = await TrafficData.findOne({ routeId }).sort({ recordedAt: -1 });

    if (!latest) {
      return NextResponse.json(
        {
          success: false,
          message: "No traffic data found for this route.",
        },
        { status: 404 }
      );
    }

    const delayMin = latest.currentDurationMin - latest.freeFlowDurationMin;
    const delayPercent = Number(((delayMin / latest.freeFlowDurationMin) * 100).toFixed(1));

    return NextResponse.json({
      success: true,
      data: {
        routeId,
        congestionLevel: getCongestionLevel(latest.currentDurationMin, latest.freeFlowDurationMin),
        currentDurationMin: latest.currentDurationMin,
        freeFlowDurationMin: latest.freeFlowDurationMin,
        delayMin,
        delayPercent,
        recordedAt: latest.recordedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch traffic data.",
        error,
      },
      { status: 500 }
    );
  }
}