import { expect, test } from '../support/fixtures'
import { createAndOpenBook, createStartedStory } from '../support/api'

for (const theme of ['dark', 'light'] as const) {
  test(`Game accepts an external cycle start in ${theme}`, async ({ page, request }) => {
    await createAndOpenBook(request, `External cycle ${theme}`)
    await createStartedStory(request, 'External cycle replay')
    const settings = await (await request.get('/api/settings')).json()
    await page.route(/\/api\/(?:projects\/[^/]+\/)?settings$/, route => route.fulfill({
      json: { ...settings, effective: { ...settings.effective, theme } },
    }))
    const malformed: string[] = []
    page.on('console', message => {
      if (message.text().includes('rejected malformed stream event')) malformed.push(message.text())
    })
    // The producer contract is covered by TestExternalGameCycleStartedReplaysAcceptedMessage.
    // Isolate its browser projection from provider login and model output.
    await page.route('**/api/interactive/chat', route => {
      const input = route.request().postDataJSON()
      const operationId = 'external-game-cycle'
      const events = [
        { type: 'agent_cycle_started', data: {
          id: `${operationId}-output`, command_id: input.command_id, delivery: 'start_turn',
          message: input.message, operation_id: operationId, run_id: operationId,
          cycle: 1, run_started_at: new Date().toISOString(),
        } },
        { type: 'chunk', data: { content: 'The gate opens.', run_id: operationId } },
        { type: 'aborted', data: { reason: 'user_requested' } },
      ]
      return route.fulfill({ contentType: 'text/event-stream', body: events.map((event, i) =>
        `id: ${i + 1}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
      ).join('') })
    })
    await page.goto('/')
    await page.getByLabel('工作台侧边栏').getByRole('button', { name: '游戏', exact: true }).click()
    const composer = page.getByPlaceholder(/你要做什么/)
    await composer.fill('Open the gate')
    await page.locator('[data-action="send"]').filter({ visible: true }).click()
    await expect(page.getByText('The gate opens.', { exact: true })).toBeVisible()
    await expect(page.locator('[data-action="stop"]').filter({ visible: true })).toHaveCount(0)
    await expect(page.getByText(/已忽略格式错误的 Agent 事件/)).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(malformed).toEqual([])
    await page.screenshot({ path: test.info().outputPath(`game-cycle-${theme}.png`) })
  })
}
