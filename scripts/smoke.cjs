const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

function todayString() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e-data')
  const shotDir = path.join(root, 'e2e')
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(shotDir, { recursive: true })

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.TODOLIST_CAPTURE
  env.TODOLIST_USER_DATA = dataDir

  let app
  try {
    app = await electron.launch({
      args: ['.'],
      cwd: root,
      env
    })
    const page = await app.firstWindow()
    page.setDefaultTimeout(8000)
    page.on('pageerror', (error) => console.error('PAGE ERROR:', error))
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('CONSOLE ERROR:', message.text())
    })

    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.project-item')
    await page.waitForSelector('.add-input')
    await page.screenshot({ path: path.join(shotDir, '01-initial.png') })
    console.log('STEP 1: initial ok')

    // 1. 新增根任务
    for (const [content, priority] of [
      ['整理项目验收材料', 'high'],
      ['更新项目周报', 'low'],
      ['联系B处理xxx问题', 'medium']
    ]) {
      await page.fill('.add-input', content)
      await page.selectOption('.add-priority', priority)
      await page.press('.add-input', 'Enter')
      await page.waitForFunction((text) => document.body.innerText.includes(text), content)
    }
    console.log('STEP 2: root tasks ok')

    // 2. 多级子项
    const rootTask = page.locator('.task-card', { hasText: '整理项目验收材料' }).first()
    await rootTask.locator('.task-row button[title^="添加子项"]').click()
    await page.locator('.modal-card textarea.text-input').fill('检查安装包')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('检查安装包'))

    const childRow = page.locator('.subtask-row', { hasText: '检查安装包' }).first()
    await childRow.hover()
    await childRow.locator('button[title^="添加子项"]').click()
    await page.locator('.modal-card textarea.text-input').fill('Windows 10 兼容性')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('Windows 10 兼容性'))

    await page.screenshot({ path: path.join(shotDir, '02-tasks.png') })
    console.log('STEP 3: multi-level subtasks ok')

    // 3. 完成任务 -> 已完成区
    const weekly = page.locator('.task-card', { hasText: '更新项目周报' }).first()
    await weekly.locator('.task-check').click()
    await page.waitForSelector('.task-card.is-completed')
    console.log('STEP 4: complete task ok')

    // 4. 删除与撤销
    const contact = page.locator('.task-card', { hasText: '联系B处理xxx问题' }).first()
    await contact.locator('.task-row button[title^="删除任务"]').click()
    await page.waitForSelector('.toast')
    await page.locator('.toast-action').click()
    await page.waitForFunction(() => document.body.innerText.includes('联系B处理xxx问题'))
    console.log('STEP 5: delete and undo ok')

    // 5. 历史日期补录 + 历史遗留项
    await page.locator('.date-column button[title^="跳转到日期"]').click()
    await page.locator('.date-picker-input').fill('2026-11-15')
    await page.waitForFunction(() => document.body.innerText.includes('2026-11-15'))
    await page.fill('.add-input', '往期未完成任务')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('往期未完成任务'))
    await page.waitForSelector('.history-item')
    assert.ok(await page.locator('.history-item', { hasText: '往期未完成任务' }).count(), '历史遗留项应包含往期任务')

    const historyItem = page.locator('.history-item', { hasText: '往期未完成任务' }).first()
    await historyItem.locator('.history-check').click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(shotDir, '02b-history-check.png') })
    assert.equal(
      await page.locator('.history-item', { hasText: '往期未完成任务' }).count(),
      0,
      '完成后历史遗留项应立即移除'
    )
    console.log('STEP 6: historical task + history ok')

    // 6. 历史栏关闭 / 恢复
    await page.locator('.history-column .icon-button[title="关闭历史遗留项"]').click()
    await page.waitForSelector('.history-reopen')
    await page.locator('.history-reopen').click()
    await page.waitForSelector('.history-column')
    console.log('STEP 7: history close/reopen ok')

    // 7. 回到今日
    await page.locator('.date-column button[title^="跳转到日期"]').click()
    await page.locator('.date-picker-input').fill(todayString())
    await page.waitForTimeout(300)

    // 8. 新建项目并返回默认项目
    await page.locator('.project-column button[title="新建项目"]').click()
    await page.locator('.modal-card input.text-input').fill('手机银行')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('手机银行'))
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)
    console.log('STEP 8: project create/select ok')

    // 9. 折叠 / 展开功能区
    await page.locator('.side-collapse').click()
    await page.waitForSelector('.sidebar-rail')
    await page.locator('.sidebar-rail .rail-expand').click()
    await page.waitForSelector('.sidebar-expanded')
    console.log('STEP 9: function collapse ok')

    // 10. 健康管理占位页
    await page.locator('.nav-item', { hasText: '健康管理' }).first().click()
    await page.waitForSelector('.health-view')
    await page.screenshot({ path: path.join(shotDir, '03-health.png') })
    await page.locator('.health-card .btn').click()
    await page.waitForSelector('.task-scroll')
    console.log('STEP 10: health placeholder ok')

    // 11. 搜索
    await page.fill('.search-box input', '验收')
    await page.waitForSelector('.search-result')
    await page.locator('.search-result').first().click()
    await page.waitForTimeout(300)
    console.log('STEP 11: search ok')

    // 12. 提醒设置
    const reminderTask = page.locator('.task-card', { hasText: '整理项目验收材料' }).first()
    await reminderTask.locator('button[title="提醒设置"]').click()
    await page.waitForSelector('.modal-card')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.reminder-tag')
    console.log('STEP 12: reminder ok')

    // 13. 设置弹窗
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.modal-card')
    await page.screenshot({ path: path.join(shotDir, '04-settings.png') })
    await page.locator('.modal-footer .btn-ghost').click()
    console.log('STEP 13: settings ok')

    await page.screenshot({ path: path.join(shotDir, '05-final.png') })
    console.log('SMOKE OK')
  } finally {
    if (app) {
      await app.close().catch(() => undefined)
    }
  }
}

main().catch((error) => {
  console.error('SMOKE FAILED:', error)
  process.exitCode = 1
})
