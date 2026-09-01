import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { ProvedorAuth } from '@/auth/ProvedorAuth'
import { ProvedorToast } from '@/componentes/ui/Toast'
import { rotas } from '@/rotas'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProvedorToast>
        <ProvedorAuth>
          <RouterProvider router={rotas} />
        </ProvedorAuth>
      </ProvedorToast>
    </QueryClientProvider>
  )
}
