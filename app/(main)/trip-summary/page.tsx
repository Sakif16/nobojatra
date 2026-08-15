import { redirect } from 'next/navigation'
import TripSummary from '@/components/TripSummary'

interface Props {
  searchParams: Promise<{ tripHistoryId?: string }>
}

export default async function TripSummaryPage({ searchParams }: Props) {
  const params = await searchParams
  const tripHistoryId = params.tripHistoryId?.trim()

  if (!tripHistoryId) redirect('/')

  return <TripSummary tripHistoryId={tripHistoryId} />
}