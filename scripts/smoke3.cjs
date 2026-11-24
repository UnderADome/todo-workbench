const { _electron: electron } = require('playwright-core')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e3-data')
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

    await page.fill('.add-input', '提醒调度测试')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('提醒调度测试'))

    const taskInfo = await page.evaluate(async () => {
      const boot = await window.api.bootstrap()
      const data = await window.api.getProjectData(boot.projects[0].id)
      const task = data.todos.find((item) => item.content === '提醒调度测试')
      return { projectId: boot.projects[0].id, taskId: task?.id, today: boot.today }
    })
    assert.ok(taskInfo.taskId, '任务应存在')

    const remindAt = new Date(Date.now() + 8000).toISOString()
    await page.evaluate(
      async ({ taskId, remindAt }) => {
        await window.api.setReminder({
          todoId: taskId,
          remindAt,
          repeatRule: 'none',
          repeatIntervalMinutes: null,
          advanceMinutes: 0
        })
      },
      { taskId: taskInfo.taskId, remindAt }
    )

    console.log('REMINDER SET >>>', remindAt)
    await page.waitForTimeout(40_000)

    const result = await page.evaluate(async (projectId) => {
      const data = await window.api.getProjectData(projectId)
      return data.todos.find((item) => item.content === '提醒调度测试')
    }, taskInfo.projectId)

    assert.ok(result?.reminderFiredAt, '调度器应更新 reminder_fired_at')
    console.log('STEP 1: reminder fired >>>', result.reminderFiredAt)

    // 自动备份
    const backups = path.join(dataDir, 'backups')
    assert.ok(fs.existsSync(backups), '启动时应生成备份目录')
    assert.ok(fs.readdirSync(backups).some((file) => file.endsWith('.db')), '启动时应生成数据库备份')
    console.log('STEP 2: auto backup ok')

    // 单实例锁
    const electronPath = require('electron')
    if (typeof electronPath === 'string') {
      const childEnv = { ...env }
      const child = spawn(electronPath, ['.'], { cwd: root, env: childEnv, stdio: 'ignore' })
      const exited = await Promise.race([
        new Promise((resolve) => child.on('exit', () => resolve(true))),
        new Promise((resolve) => setTimeout(() => resolve(false), 7000))
      ])
      if (!exited) {
        child.kill()
      }
      assert.equal(exited, true, '第二个实例应因单实例锁退出')
      console.log('STEP 3: single instance ok')
    } else {
      console.log('STEP 3: single instance skipped')
    }

    await page.screenshot({ path: path.join(root, 'e2e', '09-reminder-fired.png') })
    console.log('SMOKE3 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE3 FAILED:', error)
  process.exitCode = 1
})
