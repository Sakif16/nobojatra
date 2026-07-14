import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Place from "@/models/Place";

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = await req.json();

    const place = await Place.create({
      userId: body.userId,
      label: body.label,
      location: body.location,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Place saved successfully.",
        data: place,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save place.",
        error,
      },
      { status: 500 }
    );
  }
}