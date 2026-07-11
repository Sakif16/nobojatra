import Link from "next/link";
import { Button } from "./ui/button";
import Logout from "./logout";


export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold text-foreground">
          NoboJatra
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="custom_secondary">
            <Link href="/signin">Sign In</Link>
          </Button>
          <Button variant='custom_primary'>
            <Link href="/signup">Sign Up</Link>
          </Button>
          <Logout/>
        </div>
      </div>
    </header>
  );
}
