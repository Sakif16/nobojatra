import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import FareResults from '@/components/FareResults'
import { auth } from '@/lib/auth'

interface Props {
  searchParams: Promise<{ tripHistoryId?: string; routeId?: string }>
}

export default async function FaresPage({ searchParams }: Props) {
  // The API behind this page already refuses a signed-out caller; without this
  // the page would still render and show its error state instead of sign-in.
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) redirect('/signin')

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
