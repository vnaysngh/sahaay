import { ResetPassword } from "@/components/reset-password";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <ResetPassword
      token={
        !params.error && params.token && params.token.length <= 512
          ? params.token
          : ""
      }
    />
  );
}
