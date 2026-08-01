import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import MapDashboardSection from "@/components/map/MapDashboardSection";


const dashboard = async () => {
  const session = await auth.api.getSession({
    headers: await headers() // you need to pass the headers object.
})
  if(!session){
    redirect('/signin')
  }else{
    return(
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-white">
          Welcome, {session.user.name}
        </h1>
        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <MapDashboardSection />
        </div>
      </div>
    )
  }
};

export default dashboard;
