import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import TripHistoryList from '@/components/TripHistoryList'
import { getRequestSession } from '@/lib/request-context'
import { getTripHistoryActivityData } from '@/lib/trip-history'

export const metadata: Metadata = { title: 'Trip history' }

export default async function TripHistoryPage() {
  const session = await getRequestSession()

  if (!session) {
    redirect('/signin')
  }

  const activityData = await getTripHistoryActivityData(session.user.id)

  return <TripHistoryList activityData={activityData} />
}
