const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((el, next) => {
    const input = el
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, String(next))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e6-data')
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
    const initialTitleSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.main-title')).fontSize)
    )

    // 待办项区域：130% + 自定义字体
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.modal-card')
    await page.locator('.font-region-tab', { hasText: '待办项' }).click()
    await setRange(page, '.font-range', 130)
    await page.locator('.font-family-select').selectOption('custom')
    await page.locator('.font-custom-input').fill('KaiTi')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(350)

    const vars1 = await page.evaluate(() => ({
      tasksScale: getComputedStyle(document.documentElement).getPropertyValue('--fs-tasks').trim(),
      tasksFamily: getComputedStyle(document.documentElement).getPropertyValue('--ff-tasks').trim(),
      historyScale: getComputedStyle(document.documentElement).getPropertyValue('--fs-history').trim()
    }))
    assert.equal(vars1.tasksScale, '1.3', '待办项字号应缩放为 130%')
    assert.ok(vars1.tasksFamily.includes('KaiTi'), '待办项字体应为自定义 KaiTi')
    assert.equal(vars1.historyScale, '1', '其他区域不应被一起修改')
    const titleSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.main-title')).fontSize)
    )
    assert.ok(titleSize > initialTitleSize, '待办项文字应实际变大')
    console.log('STEP 1: per-region tasks custom font ok')

    // 历史区域：90% + 宋体
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.locator('.font-region-tab', { hasText: '历史遗留项' }).click()
    await setRange(page, '.font-range', 90)
    await page.locator('.font-family-select').selectOption('simsun')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    const vars2 = await page.evaluate(() => ({
      historyScale: getComputedStyle(document.documentElement).getPropertyValue('--fs-history').trim(),
      historyFamily: getComputedStyle(document.documentElement).getPropertyValue('--ff-history').trim(),
      tasksScale: getComputedStyle(document.documentElement).getPropertyValue('--fs-tasks').trim()
    }))
    assert.equal(vars2.historyScale, '0.9', '历史字号应为 90%')
    assert.ok(vars2.historyFamily.includes('SimSun'), '历史字体应为宋体')
    assert.equal(vars2.tasksScale, '1.3', '修改历史区域不应影响待办项')
    console.log('STEP 2: per-region history font ok')

    // reload 持久化
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')
    await page.waitForTimeout(300)
    const varsReload = await page.evaluate(() => ({
      tasksScale: getComputedStyle(document.documentElement).getPropertyValue('--fs-tasks').trim(),
      historyScale: getComputedStyle(document.documentElement).getPropertyValue('--fs-history').trim()
    }))
    assert.equal(varsReload.tasksScale, '1.3', 'reload 后待办项字号应保持')
    assert.equal(varsReload.historyScale, '0.9', 'reload 后历史字号应保持')
    console.log('STEP 3: font persistence ok')

    // 应用到全部区域 + 弹窗字体
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.locator('.font-region-tab', { hasText: '待办项' }).click()
    await setRange(page, '.font-range', 120)
    await page.locator('.font-family-select').selectOption('system')
    await page.locator('button', { hasText: '应用到全部区域' }).click()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    const allVars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return ['titlebar', 'sidebar', 'projects', 'dates', 'tasks', 'history', 'dialogs'].map((key) =>
        style.getPropertyValue(`--fs-${key}`).trim()
      )
    })
    assert.ok(allVars.every((value) => value === '1.2'), '应用到全部区域后所有字号应为 120%')

    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.locator('.font-region-tab', { hasText: '弹窗与提示' }).click()
    await setRange(page, '.font-range', 140)
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    const dialogVars = await page.evaluate(() => ({
      scale: getComputedStyle(document.documentElement).getPropertyValue('--fs-dialogs').trim(),
      modalTitleSize: parseFloat(getComputedStyle(document.querySelector('.modal-title')).fontSize)
    }))
    assert.equal(dialogVars.scale, '1.4', '弹窗字号应为 140%')
    assert.ok(dialogVars.modalTitleSize >= 20, '弹窗标题应随区域字号放大')
    await page.locator('.modal-footer .btn-ghost').click()
    console.log('STEP 4: apply-all + dialog font ok')

    console.log('SMOKE6 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE6 FAILED:', error)
  process.exitCode = 1
})
