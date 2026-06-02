import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse(
    JSON.stringify({
      commitSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'development',
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || 'local',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  );
}

