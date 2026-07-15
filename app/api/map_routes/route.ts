import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Route from "@/models/Map_route";

// POST /api/routes
// Saves a computed route option (with its segments) so it can later be
// displayed and ranked on the map.
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const {
      userId,
      origin,
      destination,
      stops,
      rank,
      distanceKm,
      durationMin,
      polyline,
      segments,
    } = body;

    if (!userId || !origin || !destination || !rank || !distanceKm || !durationMin || !polyline) {
      return NextResponse.json(
        {
          success: false,
          message: "userId, origin, destination, rank, distanceKm, durationMin and polyline are required.",
        },
        { status: 400 }
      );
    }

    const route = await Route.create({
      userId,
      origin,
      destination,
      stops: stops ?? [],
      rank,
      distanceKm,
      durationMin,
      polyline,
      segments: segments ?? [],
    });

    return NextResponse.json(
      {
        success: true,
        message: "Route saved successfully.",
        data: route,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save route.",
        error,
      },
      { status: 500 }
    );
  }
}

// GET /api/routes?userId=<id>&originLat=..&originLng=..&destLat=..&destLng=..
// Returns all ranked route options between an origin and destination so the
// user can switch between them on the map.
export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const originLat = searchParams.get("originLat");
    const originLng = searchParams.get("originLng");
    const destLat = searchParams.get("destLat");
    const destLng = searchParams.get("destLng");

    if (!userId || !originLat || !originLng || !destLat || !destLng) {
      return NextResponse.json(
        {
          success: false,
          message: "userId, originLat, originLng, destLat and destLng query parameters are required.",
        },
        { status: 400 }
      );
    }

    const routes = await Route.find({
      userId,
      "origin.lat": parseFloat(originLat),
      "origin.lng": parseFloat(originLng),
      "destination.lat": parseFloat(destLat),
      "destination.lng": parseFloat(destLng),
    }).sort({ rank: 1 });

    return NextResponse.json({
      success: true,
      count: routes.length,
      data: routes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch routes.",
        error,
      },
      { status: 500 }
    );
  }
}