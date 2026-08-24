import { ProtectedLayout } from '@/components/ProtectedLayout'
import { parseOptionalId } from '@/lib/routeSearch'
import { AddDocumentPage } from '@/pages/AddDocumentPage'
import { AddMachinePage } from '@/pages/AddMachinePage'
import { AddUserPage } from '@/pages/AddUserPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { CategoryDetailPage } from '@/pages/CategoryDetailPage'
import { CategoryNewPage } from '@/pages/CategoryNewPage'
import { DocumentDetailPage } from '@/pages/DocumentDetailPage'
import { DocumentMachinesPage } from '@/pages/DocumentMachinesPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { LoginPage } from '@/pages/LoginPage'
import { MachineDetailPage } from '@/pages/MachineDetailPage'
import { MachineDocumentsPage } from '@/pages/MachineDocumentsPage'
import { QueuePage } from '@/pages/QueuePage'
import { SettingsPage } from '@/pages/SettingsPage'
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

const settingsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/settings',
	component: SettingsPage,
})

const queueRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/queue',
	component: QueuePage,
})

const addDocumentRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/add-document',
	component: AddDocumentPage,
})

const addMachineRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/add-machine',
	validateSearch: (search: Record<string, unknown>): { categoryId?: number } => ({
		categoryId: parseOptionalId(search.categoryId),
	}),
	component: AddMachinePage,
})

const categoryNewRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/categories/new',
	validateSearch: (search: Record<string, unknown>): { parentId?: number } => ({
		parentId: parseOptionalId(search.parentId),
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

const machineDocumentsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/machines/$deviceId/documents',
	component: MachineDocumentsPage,
})

const documentDetailRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/documents/$attachmentId',
	component: DocumentDetailPage,
})

const documentMachinesRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: '/documents/$attachmentId/machines',
	component: DocumentMachinesPage,
})

const routeTree = rootRoute.addChildren([
	loginRoute,
	appLayoutRoute.addChildren([
		documentsRoute,
		catalogRoute,
		usersRoute,
		settingsRoute,
		queueRoute,
		addUserRoute,
		addDocumentRoute,
		addMachineRoute,
		categoryNewRoute,
		categoryDetailRoute,
		machineDetailRoute,
		machineDocumentsRoute,
		documentDetailRoute,
		documentMachinesRoute,
	]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
