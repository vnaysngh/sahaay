export function GET() {
  const appId = process.env.GOOGLE_MOBILE_APP_ID;
  return Response.json({
    applinks: {
      details:
        appId && /^[A-Z0-9]{10}\.com\.sahaay\.app$/.test(appId)
          ? [
              {
                appIDs: [appId],
                components: [{ "/": "/connect/google/complete" }],
              },
            ]
          : [],
    },
  });
}
