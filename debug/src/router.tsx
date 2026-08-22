import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { ProtectedLayout } from '@/components/ProtectedLayout'
import { BenchmarkPage } from '@/pages/BenchmarkPage'
import { ChunkDetailPage } from '@/pages/ChunkDetailPage'
import { ChunksPage } from '@/pages/ChunksPage'
import { JobsPage } from '@/pages/JobsPage'
import { LoginPage } from '@/pages/LoginPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { MessageThreadPage } from '@/pages/MessageThreadPage'
import { NextBestStepPage } from '@/pages/NextBestStepPage'
import { OrganizationsPage } from '@/pages/OrganizationsPage'

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
		throw redirect({ to: '/benchmark' })
	},
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

const organizationsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/organizations',
	component: OrganizationsPage,
})

const chunksRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/chunks',
	component: ChunksPage,
})

const chunkDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/chunks/$attachmentId',
	validateSearch: (search: Record<string, unknown>): { page?: number } => {
		const page = Number(search.page)
		return { page: Number.isInteger(page) && page >= 1 ? page : undefined }
	},
	component: ChunkDetailPage,
})

const messagesRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/messages',
	component: MessagesPage,
})

const messageThreadRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/messages/$threadId',
	component: MessageThreadPage,
})

const routeTree = rootRoute.addChildren([
	loginRoute,
	appLayoutRoute.addChildren([
		indexRoute,
		jobsRoute,
		benchmarkRoute,
		nextBestStepRoute,
		organizationsRoute,
		chunksRoute,
		chunkDetailRoute,
		messagesRoute,
		messageThreadRoute,
	]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
