import Link from "next/link";
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);

export default function Home() {
  return(
    <>
      <div>
        <Link href={'/signup'}>Signup</Link>
      </div>
    </>
  )
}
