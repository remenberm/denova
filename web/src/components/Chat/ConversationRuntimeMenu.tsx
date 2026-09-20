import { useState } from 'react'
import { Check, Cpu, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent } from '@/components/ui/dropdown-menu'
import { fetchEngineModels } from '@/features/agent-runtime/api'
import type { AgentEngineID, RuntimeSelection } from '@/features/agent-runtime/types'
import type { ConversationConfigController } from '@/features/conversation-config/types'
import { fetchProjectSettings, fetchSettings } from '@/features/settings/api'
import { ComposerMenuSubTrigger } from './ComposerMenuRow'

/** Switches only the bound conversation; Agent defaults and draft input remain intact. */
export function ConversationRuntimeMenu({ controller, runActive, disabled = false, onSwitched }: {
  controller: ConversationConfigController
  runActive: boolean
  disabled?: boolean
  onSwitched: () => void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<AgentEngineID | null>(null)
  const [error, setError] = useState('')
  const current = controller.snapshot?.runtime?.kind ?? 'native'
  const draftStory = controller.binding?.mode === 'interactive' && !controller.binding.story_id
  const selectionDisabled = disabled || !controller.initialized || controller.loading || runActive || controller.saving || Boolean(pending) || draftStory

  const select = async (kind: AgentEngineID) => {
    if (selectionDisabled || kind === current) return
    setPending(kind)
    setError('')
    try {
      let runtime: RuntimeSelection = { kind: 'native' }
      if (kind !== 'native') {
        const projectID = controller.binding?.project_id
        const { effective } = await (projectID ? fetchProjectSettings(projectID) : fetchSettings())
        const snapshot = controller.snapshot
        const agentKind = snapshot?.agent_kind
        const preferences = snapshot?.custom_agent_id
          ? effective.custom_agents?.find(agent => agent.id === snapshot.custom_agent_id)?.runtime
          : agentKind === 'ide' || agentKind === 'general' || agentKind === 'interactive_story'
            ? effective.agent_runtimes?.[agentKind] : undefined
        let model = preferences?.[kind]
        if (!model) {
          const catalog = await fetchEngineModels(kind)
          const modelID = catalog.default_id || catalog.items[0]?.id
          if (!modelID) throw new Error(t('agentRuntime.chooseModel'))
          model = { model: modelID }
        }
        runtime = kind === 'codex' ? { kind, codex: model } : { kind, claude: model }
      }
      if (await controller.patch({ runtime })) onSwitched()
    } catch (cause) {
      console.warn('[conversation-config] switch runtime failed', { kind, cause })
      setError(cause instanceof Error ? cause.message : t('agentRuntime.connectionFailed'))
    } finally { setPending(null) }
  }

  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <ComposerMenuSubTrigger
          icon={pending ? Loader2 : Cpu}
          iconClassName={pending ? 'animate-spin' : undefined}
          label={t('agentRuntime.switchRuntime')}
          detail={t(`agentRuntime.${current}`)}
          detailTone="faint"
          disabled={disabled || !controller.initialized || controller.loading}
        />
        {/* Narrow viewports show submenus over the parent menu to keep all choices visible. */}
        <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-1rem)] border-[var(--nova-border)] bg-[var(--nova-surface-2)] p-1.5 text-[var(--nova-text)] max-[700px]:[translate:calc(-100%+0.5rem)_0]">
          <DropdownMenuGroup>
            {(['native', 'codex', 'claude'] as const).map(kind => (
              <DropdownMenuItem key={kind}
                disabled={selectionDisabled || kind === current} aria-current={kind === current ? 'true' : undefined}
                className="cursor-pointer"
                onSelect={event => { event.preventDefault(); void select(kind) }}>
                <span className="min-w-0 flex-1 truncate">{t(`agentRuntime.${kind}`)}</span>
                {pending === kind ? <Loader2 className="animate-spin" /> : kind === current ? <Check /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <p className="whitespace-normal px-1.5 py-1 text-[11px] text-muted-foreground">
            {t(draftStory ? 'agentRuntime.switchAfterStoryCreated' : runActive ? 'agentRuntime.switchWhenIdle' : 'agentRuntime.switchConversationHint')}
          </p>
          {(error || controller.error) && <p role="alert" className="whitespace-normal break-words px-2 py-1 text-xs text-destructive">{error || controller.error}</p>}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  )
}
