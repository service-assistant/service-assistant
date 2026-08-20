import { ProtectedLayout } from '@/components/ProtectedLayout'
import { AddDocumentPage } from '@/pages/AddDocumentPage'
import { AddMachinePage } from '@/pages/AddMachinePage'
import { AddUserPage } from '@/pages/AddUserPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { CategoryDetailPage } from '@/pages/CategoryDetailPage'
import { CategoryNewPage } from '@/pages/CategoryNewPage'
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
	validateSearch: (search: Record<string, unknown>): { tab?: 'models' | 'categories' } => ({
		tab: search.tab as 'models' | 'categories' | undefined,
	}),
	component: CatalogPage,
})

const usersRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/users',
	validateSearch: (
		search: Record<string, unknown>,
	): {
		sort?: 'username' | 'org_role' | 'created_at' | 'updated_at'
		order?: 'asc' | 'desc'
	} => ({
		sort: search.sort as 'username' | 'org_role' | 'created_at' | 'updated_at' | undefined,
		order: search.order as 'asc' | 'desc' | undefined,
	}),
	component: UsersPage,
})

const addUserRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/users/new',
	component: AddUserPage,
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

const categoryNewRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/categories/new',
	validateSearch: (search: Record<string, unknown>): { parentId?: number } => ({
		parentId: search.parentId as number | undefined,
	}),
	component: CategoryNewPage,
})

const categoryDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/categories/$categoryId',
	component: CategoryDetailPage,
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
		addUserRoute,
		addDocumentRoute,
		addMachineRoute,
		categoryNewRoute,
		categoryDetailRoute,
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
