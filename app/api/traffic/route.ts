import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrafficData from "@/models/TrafficData";

// POST /api/traffic
// Stores a real-time travel-time reading for a route (current duration vs
// the free-flow baseline duration) used to estimate congestion.
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const { routeId, currentDurationMin, freeFlowDurationMin } = body;

    if (!routeId || currentDurationMin === undefined || freeFlowDurationMin === undefined) {
      return NextResponse.json(
        {
          success: false,
          message: "routeId, currentDurationMin and freeFlowDurationMin are required.",
        },
        { status: 400 }
      );
    }

    const traffic = await TrafficData.create({
      routeId,
      currentDurationMin,
      freeFlowDurationMin,
      recordedAt: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Traffic data recorded successfully.",
        data: traffic,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to record traffic data.",
        error,
      },
      { status: 500 }
    );
  }
}