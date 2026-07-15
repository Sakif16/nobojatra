import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Route from "@/models/Map_route";

// GET /api/routes/:routeId/bounds
// Returns the north-east / south-west corners needed to automatically
// adjust the map view so that every point on the route is visible.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    await dbConnect();

    const { routeId } = await params;

    const route = await Route.findById(routeId);

    if (!route) {
      return NextResponse.json(
        {
          success: false,
          message: "Route not found.",
        },
        { status: 404 }
      );
    }

    const points = [route.origin, ...route.stops, route.destination];
    const lats = points.map((p: { lat: number }) => p.lat);
    const lngs = points.map((p: { lng: number }) => p.lng);

    const bounds = {
      northEast: { lat: Math.max(...lats), lng: Math.max(...lngs) },
      southWest: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    };

    return NextResponse.json({
      success: true,
      data: bounds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to compute bounds.",
        error,
      },
      { status: 500 }
    );
  }
}