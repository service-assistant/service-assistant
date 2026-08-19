import { Anchor, Badge, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useDevices } from '@/hooks/useDevices'
import { useMessageChunks, useThreadMessages } from '@/hooks/useMessages'
import { useThread } from '@/hooks/useThreads'
import type { MessageRead } from '@/lib/types'

const routeApi = getRouteApi('/_app/threads/$threadId')

function SourceChunks({ messageId }: { messageId: number }) {
	const [opened, { toggle }] = useDisclosure(false)
	const { data: chunks, isLoading } = useMessageChunks(messageId, opened)

	return (
		<Stack gap={4} mt='xs'>
			<Anchor size='xs' onClick={toggle}>
				{opened ? 'Ukryj źródła' : 'Pokaż źródła'}
			</Anchor>
			{opened && (
				<Stack gap='xs'>
					{isLoading && <Loader size='xs' />}
					{(chunks ?? []).map((chunk) => (
						<Paper key={chunk.id} withBorder p='xs' bg='var(--mantine-color-default)'>
							<Text size='xs' c='dimmed'>
								Dokument #{chunk.attachment_id} · strona{' '}
								{chunk.metadata?.page ?? '—'}
							</Text>
							<Text size='sm' lineClamp={3}>
								{chunk.content}
							</Text>
						</Paper>
					))}
					{!isLoading && (chunks ?? []).length === 0 && (
						<Text size='xs' c='dimmed'>
							Brak źródeł.
						</Text>
					)}
				</Stack>
			)}
		</Stack>
	)
}

function MessageBubble({ message }: { message: MessageRead }) {
	const isUser = message.sender === 'user'
	return (
		<Group justify={isUser ? 'flex-end' : 'flex-start'}>
			<Paper
				withBorder
				p='sm'
				maw='75%'
				bg={isUser ? 'blue.6' : 'var(--mantine-color-default)'}>
				<Text size='sm' c={isUser ? 'white' : undefined} style={{ whiteSpace: 'pre-wrap' }}>
					{message.content}
				</Text>
				{message.router_decision && (
					<Badge mt='xs' size='xs' variant='light'>
						{message.router_decision}
					</Badge>
				)}
				{!isUser && <SourceChunks messageId={message.id} />}
			</Paper>
		</Group>
	)
}

export function ThreadDetailPage() {
	const { threadId } = routeApi.useParams()
	const id = Number(threadId)

	const { data: thread } = useThread(id)
	const { data: messages, isLoading } = useThreadMessages(id)
	const { data: devices } = useDevices()

	const deviceName = useMemo(
		() => (devices ?? []).find((d) => d.id === thread?.device_id)?.name,
		[devices, thread],
	)

	return (
		<Stack gap='md'>
			<div>
				<Title order={2}>{thread?.title ?? `Wątek #${id}`}</Title>
				<Text c='dimmed' size='sm'>
					Urządzenie: {deviceName ?? thread?.device_id ?? '—'}
				</Text>
			</div>

			{isLoading ? (
				<Loader />
			) : (
				<Stack gap='sm'>
					{(messages ?? []).map((message) => (
						<MessageBubble key={message.id} message={message} />
					))}
				</Stack>
			)}
		</Stack>
	)
}
