'use client'

import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { authClient } from "@/lib/auth-client";

const Logout = () => {

  const router =useRouter();

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.refresh();
          window.location.replace("/signin");
        },
      },
    });
  };

  return (
    <Button variant="destructive" onClick={handleLogout} className="w-full justify-center">
      Logout
    </Button>
  );
};

export default Logout;
