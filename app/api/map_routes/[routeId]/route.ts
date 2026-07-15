import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Route from "@/models/Map_route";

// GET /api/routes/:routeId
// Lets the user switch between ranked routes on the map. Returns the full
// route, including the color-coded segments used for multi-stop trips.
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

    return NextResponse.json({
      success: true,
      data: route,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch route.",
        error,
      },
      { status: 500 }
    );
  }
}