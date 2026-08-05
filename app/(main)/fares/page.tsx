import { redirect } from 'next/navigation'
import FareResults from '@/components/FareResults'

interface Props {
  searchParams: Promise<{ distance?: string; duration?: string; passengers?: string; from?: string; to?: string }>
}

export default async function FaresPage({ searchParams }: Props) {
  const params = await searchParams

  const distanceKm  = parseFloat(params.distance  ?? '0')
  const durationMin = parseInt(params.duration     ?? '0')
  const passengers  = parseInt(params.passengers   ?? '1')

  if (!distanceKm || !durationMin) redirect('/')

  return (
    <FareResults
      distanceKm={distanceKm}
      durationMin={durationMin}
      passengers={passengers}
      from={params.from ?? ''}
      to={params.to ?? ''}
    />
  )
}