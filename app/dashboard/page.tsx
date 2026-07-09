import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";


const dashboard = async () => {
  const session = await auth.api.getSession({
    headers: await headers() // you need to pass the headers object.
})
  if(!session){
    redirect('/signin')
  }else{
    return(
      <div>
        Welcome, {session.user.name}
      </div>
    )
  }
};

export default dashboard;
