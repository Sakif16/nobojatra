import { redirect } from 'next/navigation'
import FareResults from '@/components/FareResults'

interface Props {
  searchParams: Promise<{ tripHistoryId?: string; routeId?: string }>
}

export default async function FaresPage({ searchParams }: Props) {
  const params = await searchParams
  const tripHistoryId = params.tripHistoryId?.trim()
  const routeId = params.routeId?.trim()

  if (!tripHistoryId || !routeId) redirect('/')

  return (
    <FareResults
      tripHistoryId={tripHistoryId}
      routeId={routeId}
    />
  )
}
