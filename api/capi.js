// Vercel serverless funksiya: /api/capi
//
// Vercel -> Settings -> Environment Variables:
//   META_PIXEL_ID         = 1406085868176574
//   META_CAPI_TOKEN       = <Meta'dan olingan access token>
//   META_TEST_EVENT_CODE  = (ixtiyoriy) faqat test vaqtida
//   META_API_VERSION      = (ixtiyoriy) masalan v23.0

export async function POST(req) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  const version = process.env.META_API_VERSION || "v23.0";
  if (!pixelId || !token) {
    return Response.json({ error: "env missing" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { event_name = "Lead", event_id, event_source_url, fbp, fbc } = body;

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  const payload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url,
        action_source: "website",
        user_data: {
          client_ip_address: ip || undefined,
          client_user_agent: req.headers.get("user-agent") || undefined,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
        },
      },
    ],
  };
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const r = await fetch(
      `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await r.json();
    return Response.json(data, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
