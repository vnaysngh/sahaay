export function GET() {
  const hashes = (process.env.GOOGLE_ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .filter((v) => /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(v));
  return Response.json(
    hashes.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: "com.sahaay.app",
              sha256_cert_fingerprints: hashes,
            },
          },
        ]
      : [],
  );
}
