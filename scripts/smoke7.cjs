const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function findTodo(page, content) {
  return page.evaluate(async (text) => {
    const bootstrap = await window.api.bootstrap()
    for (const project of bootstrap.projects) {
      const data = await window.api.getProjectData(project.id)
      const todo = data.todos.find((item) => item.content === text)
      if (todo) return todo
    }
    return null
  }, content)
}

async function waitForTodoStatus(page, content, status) {
  for (let i = 0; i < 20; i += 1) {
    const todo = await findTodo(page, content)
    if (todo?.status === status) return todo
    await page.waitForTimeout(100)
  }
  throw new Error(`任务状态未变为 ${status}：${content}`)
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e7-data')
  fs.rmSync(dataDir, { recursive: true, force: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.TODOLIST_USER_DATA = dataDir

  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: root, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(8000)
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')

    const version = await page.evaluate(async () => (await window.api.bootstrap()).appVersion)
    assert.equal(version, '0.6.0', '应用版本应为 0.6.0')

    await page.fill('.add-input', '快捷任务')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('快捷任务'))

    let card = page.locator('.task-card', { hasText: '快捷任务' }).first()
    for (const prefix of ['置顶任务', '添加子项', '切换优先级', '标记不做', '提醒设置', '删除任务']) {
      assert.ok(
        await card.locator(`.task-row button[title^="${prefix}"]`).count(),
        `任务行应显示快捷按钮：${prefix}`
      )
    }
    console.log('STEP 1: quick action buttons ok')

    const beforeEdit = await findTodo(page, '快捷任务')
    await page.waitForTimeout(1100)
    await card.locator('.task-title').dblclick()
    await page.waitForSelector('.modal-card')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    const afterEdit = await findTodo(page, '快捷任务')
    assert.equal(afterEdit.updatedAt, beforeEdit.updatedAt, '未修改内容的编辑不应更新任务时间')

    await page.waitForTimeout(1100)
    await page.evaluate(
      async ({ id, content }) => window.api.updateTask(id, { content }),
      { id: afterEdit.id, content: afterEdit.content }
    )
    const afterDirect = await findTodo(page, '快捷任务')
    assert.equal(afterDirect.updatedAt, afterEdit.updatedAt, '数据库层空更新也不应更新时间')
    console.log('STEP 2: double-click edit + no-op timestamp ok')

    card = page.locator('.task-card', { hasText: '快捷任务' }).first()
    await card.locator('.task-row').click()
    assert.ok(await page.locator('.task-card.is-selected').count(), '单击任务后应显示选中状态')

    await page.keyboard.press('Control+Shift+1')
    await page.waitForTimeout(400)
    assert.equal((await findTodo(page, '快捷任务')).priority, 'high', '快捷键应设置为高优先级')

    await page.keyboard.press('Control+Shift+P')
    await page.waitForTimeout(400)
    assert.ok((await findTodo(page, '快捷任务')).pinnedAt, '快捷键应置顶任务')

    await page.keyboard.press('Control+Shift+N')
    await page.waitForSelector('.modal-card')
    assert.equal((await page.locator('.modal-title').textContent())?.trim(), '添加子项')
    await page.locator('.modal-card textarea.text-input').fill('快捷子项')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('快捷子项'))

    await card.locator('.task-row').click()
    await page.keyboard.press('Control+Shift+X')
    await waitForTodoStatus(page, '快捷任务', 'not_done')
    await page.keyboard.press('Control+Shift+X')
    await waitForTodoStatus(page, '快捷任务', 'todo')
    await page.waitForFunction(() => document.body.innerText.includes('快捷任务'))

    await card.locator('.task-row').click()
    await page.keyboard.press('F2')
    await page.waitForSelector('.modal-card')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.modal-card', { state: 'detached' })
    console.log('STEP 3: keyboard shortcuts and selection ok')

    card = page.locator('.task-card', { hasText: '快捷任务' }).first()
    await card.locator('.task-row').click({ button: 'right' })
    await page.waitForSelector('.task-context-menu')
    for (const text of ['编辑任务', '取消置顶', '添加子项', '高优先级', '标记不做', '删除任务']) {
      assert.ok(
        await page.locator('.task-context-menu .context-item', { hasText: text }).count(),
        `右键菜单应包含：${text}`
      )
    }
    await page.locator('.task-context-menu .context-item', { hasText: '中优先级' }).click()
    await page.waitForTimeout(400)
    assert.equal((await findTodo(page, '快捷任务')).priority, 'medium', '右键菜单应设置中优先级')

    await card.locator('.task-row button[title^="取消置顶"]').click()
    await page.waitForTimeout(400)
    assert.equal((await findTodo(page, '快捷任务')).pinnedAt, null, '置顶按钮应取消置顶')
    await card.locator('.task-row button[title^="置顶任务"]').click()
    await page.waitForTimeout(400)
    assert.ok((await findTodo(page, '快捷任务')).pinnedAt, '置顶按钮应置顶任务')
    console.log('STEP 4: context menu + quick button actions ok')

    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.shortcut-list')
    const shortcutRow = page.locator('.shortcut-row', { hasText: '添加子项' }).first()
    await shortcutRow.locator('.shortcut-recorder').click()
    await page.keyboard.press('Control+Alt+A')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    const savedShortcuts = await page.evaluate(async () => (await window.api.bootstrap()).settings.shortcuts)
    assert.equal(savedShortcuts.addChild, 'Ctrl+Alt+A', '快捷键设置应保存')

    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.shortcut-list')
    const duplicateRow = page.locator('.shortcut-row', { hasText: '添加子项' }).first()
    await duplicateRow.locator('.shortcut-recorder').click()
    await page.keyboard.press('Control+Shift+P')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.form-error')
    assert.ok((await page.locator('.form-error').innerText()).includes('多个操作'), '重复快捷键应提示')
    await page.locator('.modal-footer .btn-ghost').click()

    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    const reservedRow = page.locator('.shortcut-row', { hasText: '删除任务' }).first()
    await reservedRow.locator('.shortcut-recorder').click()
    await page.keyboard.press('F12')
    await page.waitForSelector('.form-error')
    assert.ok((await page.locator('.form-error').innerText()).includes('占用'), '系统保留快捷键应提示')
    await page.locator('.modal-footer .btn-ghost').click()
    console.log('STEP 5b: shortcut validation ok')

    await page.reload()
    await page.waitForSelector('.add-input')
    const reloadedShortcuts = await page.evaluate(async () => (await window.api.bootstrap()).settings.shortcuts)
    assert.equal(reloadedShortcuts.addChild, 'Ctrl+Alt+A', '快捷键设置应在重载后保持')
    console.log('STEP 5: shortcut customization + persistence ok')

    card = page.locator('.task-card', { hasText: '快捷任务' }).first()
    await card.locator('.task-row').click()
    await page.keyboard.press('Control+Alt+A')
    await page.waitForSelector('.modal-card')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.modal-card', { state: 'detached' })

    await page.locator('.side-bottom .nav-item', { hasText: '使用说明' }).click()
    await page.waitForSelector('.modal-card')
    const guideText = await page.locator('.modal-card').innerText()
    assert.ok(guideText.includes('双击任务'), '使用说明应介绍双击编辑')
    const guideShortcut = await page
      .locator('.guide-shortcut-row', { hasText: '添加子项' })
      .first()
      .locator('.shortcut-keys')
      .textContent()
    assert.equal(guideShortcut?.replace(/\s+/g, ''), 'Ctrl+Alt+A', '使用说明应显示自定义快捷键')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })

    await page.locator('.side-bottom .nav-item', { hasText: '更新日志' }).click()
    await page.waitForSelector('.changelog-entry')
    assert.ok((await page.locator('.changelog-entry').count()) >= 3, '更新日志应包含多个版本')
    const changelogText = await page.locator('.modal-card').innerText()
    assert.ok(changelogText.includes('v0.6.0'), '更新日志应包含 v0.6.0')
    assert.ok(changelogText.includes('快捷键'), '更新日志应包含快捷键说明')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    console.log('STEP 6: usage guide + changelog ok')

    await page.fill('.add-input', '待删除任务')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('待删除任务'))
    const deleteCard = page.locator('.task-card', { hasText: '待删除任务' }).first()
    await deleteCard.locator('.task-row').click()
    await page.keyboard.press('Delete')
    await page.waitForSelector('.toast')
    assert.equal(await page.locator('.task-card', { hasText: '待删除任务' }).count(), 0, 'Delete 应删除任务')
    await page.locator('.toast-action').click()
    await page.waitForFunction(() => document.body.innerText.includes('待删除任务'))
    console.log('STEP 7: delete shortcut + undo ok')

    console.log('SMOKE7 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE7 FAILED:', error)
  process.exitCode = 1
})
