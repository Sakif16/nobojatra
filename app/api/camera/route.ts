import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Camera from "@/models/Camera";


export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();

    const { location, cameraName, streamUrl } = body;

    if (!location || !cameraName || !streamUrl) {
      return NextResponse.json(
        {
          success: false,
          message: "All fields are required.",
        },
        { status: 400 }
      );
    }

    const camera = await Camera.create({
      location,
      cameraName,
      streamUrl,
      available: true,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Camera registered successfully.",
        data: camera,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to register camera.",
        error,
      },
      { status: 500 }
    );
  }
}


export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const location = searchParams.get("location");

    if (!location) {
      return NextResponse.json(
        {
          success: false,
          message: "Location query parameter is required.",
        },
        { status: 400 }
      );
    }

    const camera = await Camera.findOne({ location });

    if (!camera) {
      return NextResponse.json({
        available: false,
        message: "No camera available for this location.",
      });
    }

    return NextResponse.json({
      success: true,
      available: true,
      data: camera,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch camera.",
        error,
      },
      { status: 500 }
    );
  }
}