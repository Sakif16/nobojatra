import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import TripSummary from '@/components/TripSummary'
import { getRequestSession } from '@/lib/request-context'

export const metadata: Metadata = { title: 'Trip plan' }

interface Props {
  searchParams: Promise<{ source?: string; tripHistoryId?: string }>
}

export default async function TripSummaryPage({ searchParams }: Props) {
  const session = await getRequestSession()

  if (!session) redirect('/signin')

  const params = await searchParams
  const tripHistoryId = params.tripHistoryId?.trim()
  const source = params.source?.trim()

  if (!tripHistoryId) redirect('/')

  return <TripSummary tripHistoryId={tripHistoryId} viewMode={source === 'history' ? 'history' : 'confirmed'} />
}
