'use client'

import { redirect } from "next/navigation";
import { Button } from "./ui/button"
import { authClient } from "@/lib/auth-client";


const Logout = () => {

    const handleLogout=async()=>{
      await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
        redirect("/signin") // redirect to login page
    },
  },
});
    }


  return (
    <div>
      <Button variant="destructive" onClick={handleLogout}>Logout</Button>
    </div>
  )
}

export default Logout
