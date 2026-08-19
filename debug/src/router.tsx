import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { ProtectedLayout } from '@/components/ProtectedLayout'
import { BenchmarkPage } from '@/pages/BenchmarkPage'
import { ChunksPage } from '@/pages/ChunksPage'
import { JobsPage } from '@/pages/JobsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NextBestStepPage } from '@/pages/NextBestStepPage'
import { ThreadDetailPage } from '@/pages/ThreadDetailPage'
import { ThreadsPage } from '@/pages/ThreadsPage'

const rootRoute = createRootRoute()

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginPage,
})

const appLayoutRoute = createRoute({
	id: '_app',
	getParentRoute: () => rootRoute,
	component: ProtectedLayout,
})

const indexRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/',
	beforeLoad: () => {
		throw redirect({ to: '/chunks' })
	},
})

const chunksRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/chunks',
	component: ChunksPage,
})

const threadsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/threads',
	component: ThreadsPage,
})

const threadDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/threads/$threadId',
	component: ThreadDetailPage,
})

const jobsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/jobs',
	component: JobsPage,
})

const benchmarkRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/benchmark',
	component: BenchmarkPage,
})

const nextBestStepRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/next-best-step',
	component: NextBestStepPage,
})

const routeTree = rootRoute.addChildren([
	loginRoute,
	appLayoutRoute.addChildren([
		indexRoute,
		chunksRoute,
		threadsRoute,
		threadDetailRoute,
		jobsRoute,
		benchmarkRoute,
		nextBestStepRoute,
	]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
