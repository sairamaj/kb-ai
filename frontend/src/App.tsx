import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

interface HealthResponse {
  status: string
}

async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await axios.get<HealthResponse>('/api/health')
  return data
}

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  })

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold tracking-tight">Prompt KB</h1>
      <p className="text-gray-400 text-sm">Your AI-powered knowledge base</p>

      <div className="mt-6 px-4 py-3 rounded-lg bg-gray-800 text-sm font-mono flex items-center gap-2">
        <span className="text-gray-400">API status:</span>
        {isLoading && <span className="text-yellow-400">checking...</span>}
        {isError && <span className="text-red-400">unreachable</span>}
        {data && (
          <span className="text-green-400 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
            {data.status}
          </span>
        )}
      </div>
    </div>
  )
}
