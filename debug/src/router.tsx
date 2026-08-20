import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { ProtectedLayout } from '@/components/ProtectedLayout'
import { BenchmarkPage } from '@/pages/BenchmarkPage'
import { JobsPage } from '@/pages/JobsPage'
import { LoginPage } from '@/pages/LoginPage'
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

const routeTree = rootRoute.addChildren([
	loginRoute,
	appLayoutRoute.addChildren([
		indexRoute,
		jobsRoute,
		benchmarkRoute,
		nextBestStepRoute,
		organizationsRoute,
	]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
