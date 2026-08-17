import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import TripHistoryList from '@/components/TripHistoryList'
import { auth } from '@/lib/auth'
import { getTripHistoryActivityData } from '@/lib/trip-history'

export default async function TripHistoryPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect('/signin')
  }

  const activityData = await getTripHistoryActivityData(session.user.id)

  return <TripHistoryList activityData={activityData} />
}
