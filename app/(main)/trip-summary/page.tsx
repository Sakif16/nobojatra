import { redirect } from 'next/navigation'
import TripSummary from '@/components/TripSummary'

interface Props {
  searchParams: Promise<{ source?: string; tripHistoryId?: string }>
}

export default async function TripSummaryPage({ searchParams }: Props) {
  const params = await searchParams
  const tripHistoryId = params.tripHistoryId?.trim()
  const source = params.source?.trim()

  if (!tripHistoryId) redirect('/')

  return <TripSummary tripHistoryId={tripHistoryId} viewMode={source === 'history' ? 'history' : 'confirmed'} />
}
