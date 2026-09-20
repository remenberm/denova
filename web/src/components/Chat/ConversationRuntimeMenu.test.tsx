import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import type { ConversationConfigController } from '@/features/conversation-config/types'
import { ConversationRuntimeMenu } from './ConversationRuntimeMenu'

const settingsMocks = vi.hoisted(() => ({ fetchProjectSettings: vi.fn() }))
vi.mock('@/features/settings/api', () => ({
  fetchSettings: vi.fn(),
  fetchProjectSettings: settingsMocks.fetchProjectSettings,
}))

describe('ConversationRuntimeMenu', () => {
  for (const agentKey of ['ide', 'general', 'interactive_story'] as const) {
    it(`switches the same ${agentKey} conversation from the options submenu`, async () => {
      settingsMocks.fetchProjectSettings.mockResolvedValue({ effective: { agent_runtimes: { [agentKey]: { codex: { model: 'saved-model', effort: 'high' } } } } })
      const patch = vi.fn().mockResolvedValue(true)
      const onSwitched = vi.fn()
      const controller: ConversationConfigController = {
        binding: { mode: agentKey === 'ide' ? 'writing' : agentKey === 'general' ? 'agent_chat' : 'interactive', project_id: 'project', session_id: 'session', story_id: 'story', branch_id: 'main' },
        snapshot: { agent_kind: agentKey, profile_id: 'default', thinking_level: 'medium', approval_mode: 'write', revision: 7 },
        initialized: true, loading: false, saving: false, error: null, patch, reload: vi.fn(),
      }
      const menu = () => <DropdownMenu defaultOpen><DropdownMenuContent>
        <ConversationRuntimeMenu controller={controller} runActive={false} onSwitched={onSwitched} />
      </DropdownMenuContent></DropdownMenu>
      const user = userEvent.setup()
      const view = render(menu())
      await user.click(screen.getByRole('menuitem', { name: /切换运行时/ }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Codex' }))
      await waitFor(() => expect(patch).toHaveBeenCalledWith({ runtime: { kind: 'codex', codex: { model: 'saved-model', effort: 'high' } } }))
      expect(settingsMocks.fetchProjectSettings).toHaveBeenCalledWith('project')
      expect(onSwitched).toHaveBeenCalledOnce()
      controller.snapshot = { ...controller.snapshot!, runtime: { kind: 'codex', codex: { model: 'saved-model' } } }
      view.rerender(menu())
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Native' }))
      await waitFor(() => expect(patch).toHaveBeenLastCalledWith({ runtime: { kind: 'native' } }))
    })
  }
})
