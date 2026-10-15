import Link from "next/link";
export default function GoogleComplete() {
  return <main className="state-screen"><h1>Return to Sahaay</h1><p>Close this browser and return to Connected Accounts. Sahaay checks the connection securely on the server.</p><p><Link href="/connect/google/complete">Open Sahaay on your phone</Link></p><p><Link href="/settings/connected">View Connected Accounts on Web</Link></p></main>;
}
