import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrafficData from "@/models/TrafficData";

// POST /api/traffic/batch
// Accepts a list of routeIds (e.g. every leg of a multi-stop journey) and
// returns the latest traffic reading for each in a single request, instead
// of one request per leg.
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const { routeIds } = body as { routeIds: string[] };

    if (!Array.isArray(routeIds) || routeIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "routeIds must be a non-empty array.",
        },
        { status: 400 }
      );
    }

    const readings = await TrafficData.find({ routeId: { $in: routeIds } }).sort({
      recordedAt: -1,
    });

    const data = routeIds.map((id) => {
      const reading = readings.find((r) => r.routeId.toString() === id);
      if (!reading) {
        return { routeId: id, success: false, message: "No traffic data found." };
      }
      return {
        routeId: id,
        success: true,
        currentDurationMin: reading.currentDurationMin,
        freeFlowDurationMin: reading.freeFlowDurationMin,
        recordedAt: reading.recordedAt,
      };
    });

    return NextResponse.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch batched traffic data.",
        error,
      },
      { status: 500 }
    );
  }
}