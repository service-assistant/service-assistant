import { CodeHighlightAdapterProvider } from '@mantine/code-highlight'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/auth/AuthContext'
import { highlightJsAdapter } from '@/lib/highlight'
import { router } from '@/router'
import '@mantine/core/styles.css'
import '@mantine/code-highlight/styles.css'
import './index.css'

const queryClient = new QueryClient()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
	<StrictMode>
		<MantineProvider defaultColorScheme='auto'>
			<CodeHighlightAdapterProvider adapter={highlightJsAdapter}>
				<ModalsProvider>
					<QueryClientProvider client={queryClient}>
						<AuthProvider>
							<RouterProvider router={router} />
						</AuthProvider>
					</QueryClientProvider>
				</ModalsProvider>
			</CodeHighlightAdapterProvider>
		</MantineProvider>
	</StrictMode>,
)
