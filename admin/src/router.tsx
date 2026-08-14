import { ProtectedLayout } from '@/components/ProtectedLayout'
import { AddDocumentPage } from '@/pages/AddDocumentPage'
import { AddMachinePage } from '@/pages/AddMachinePage'
import { BrandDetailPage } from '@/pages/BrandDetailPage'
import { BrandNewPage } from '@/pages/BrandNewPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { DeviceTypeDetailPage } from '@/pages/DeviceTypeDetailPage'
import { DeviceTypeNewPage } from '@/pages/DeviceTypeNewPage'
import { DocumentDetailPage } from '@/pages/DocumentDetailPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { LoginPage } from '@/pages/LoginPage'
import { MachineDetailPage } from '@/pages/MachineDetailPage'
import { UsersPage } from '@/pages/UsersPage'
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

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

const documentsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/',
	component: DocumentsPage,
})

const catalogRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/catalog',
	validateSearch: (search: Record<string, unknown>): { tab?: 'models' | 'brands' | 'types' } => ({
		tab: search.tab as 'models' | 'brands' | 'types' | undefined,
	}),
	component: CatalogPage,
})

const usersRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/users',
	component: UsersPage,
})

const addDocumentRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/add-document',
	component: AddDocumentPage,
})

const addMachineRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/add-machine',
	component: AddMachinePage,
})

const brandNewRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/brands/new',
	component: BrandNewPage,
})

const brandDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/brands/$brandId',
	component: BrandDetailPage,
})

const deviceTypeNewRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/machine-types/new',
	component: DeviceTypeNewPage,
})

const deviceTypeDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/machine-types/$deviceTypeId',
	component: DeviceTypeDetailPage,
})

const machineDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/machines/$deviceId',
	component: MachineDetailPage,
})

const documentDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/documents/$attachmentId',
	component: DocumentDetailPage,
})

const routeTree = rootRoute.addChildren([
	loginRoute,
	appLayoutRoute.addChildren([
		documentsRoute,
		catalogRoute,
		usersRoute,
		addDocumentRoute,
		addMachineRoute,
		brandNewRoute,
		brandDetailRoute,
		deviceTypeNewRoute,
		deviceTypeDetailRoute,
		machineDetailRoute,
		documentDetailRoute,
	]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
