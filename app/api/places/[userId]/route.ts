import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Place from "@/models/Place";
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await dbConnect();

    const { userId } = await params;

    const places = await Place.find({ userId });

    return NextResponse.json({
      success: true,
      count: places.length,
      data: places,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch places.",
        error,
      },
      { status: 500 }
    );
  }
}