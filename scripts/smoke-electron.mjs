import { _electron as electron } from "playwright";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const mainEntry = join(root, "out/main/index.js");

const app = await electron.launch({
  args: [mainEntry],
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1"
  }
});

try {
  const page = await app.firstWindow();
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.getByRole("textbox", { name: "任务输入" }).waitFor({ timeout: 20_000 });

  const hasPreloadApi = await page.evaluate(() => Boolean(window.hermesDesktop));
  if (!hasPreloadApi) {
    throw new Error("window.hermesDesktop is missing; preload/IPC bridge is not available.");
  }

  const navChecks = [
    ["工作区", async () => page.getByText("当前 Workspace").waitFor({ timeout: 5_000 })],
    ["任务历史", async () => page.getByRole("button", { name: "全部" }).waitFor({ timeout: 5_000 })],
    ["产物", async () => page.getByPlaceholder("搜索产物名称、任务或内容").waitFor({ timeout: 5_000 })],
    ["自动流程", async () => page.getByRole("region", { name: "自动流程模板" }).waitFor({ timeout: 5_000 })],
    ["定时任务", async () => page.getByText(/个定时任务|还没有定时任务/).waitFor({ timeout: 5_000 })],
    ["技能", async () => page.getByPlaceholder("搜索技能名称、分类或来源").waitFor({ timeout: 5_000 })],
    ["设置", async () => page.getByTestId("settings-check-hermes").waitFor({ timeout: 5_000 })]
  ];

  for (const [buttonName, waitForView] of navChecks) {
    await page.getByRole("button", { name: buttonName }).click();
    await waitForView();
  }

  await page.getByRole("button", { name: "设置" }).click();
  await page.getByTestId("settings-check-hermes").click();
  await page.getByText("Hermes 连接正常").first().waitFor({ timeout: 30_000 });

  await page.getByRole("button", { name: "工作台" }).click();
  await page.getByRole("textbox", { name: "任务输入" }).fill("请只回复 OK");

  const trustButtons = page.getByRole("button", { name: "信任此目录" });
  if ((await trustButtons.count()) > 0) {
    const trustButton = trustButtons.first();
    if (await trustButton.isEnabled()) {
      await trustButton.click();
    }
  }

  if ((await page.getByRole("button", { name: "取消信任" }).count()) > 0) {
    await page.getByRole("button", { name: "取消信任" }).waitFor({ timeout: 5_000 });
  }

  await page.getByRole("button", { name: "发送" }).click();
  await page.getByText("OK", { exact: true }).waitFor({ timeout: 120_000 });

  const resultText = await page.locator(".messageBubble").last().innerText();
  if (!resultText.includes("OK")) {
    throw new Error(`Expected Hermes result to include OK, got: ${resultText}`);
  }

  await page.getByRole("button", { name: "任务历史" }).click();
  await page.getByRole("button", { name: "已完成", exact: true }).click();
  await page.getByText("请只回复 OK").first().waitFor({ timeout: 5_000 });

  await page.getByRole("button", { name: "产物" }).click();
  await page.getByPlaceholder("搜索产物名称、任务或内容").fill("OK");
  await page.getByTestId("artifact-card").first().click();
  await page.getByRole("dialog", { name: "产物详情" }).waitFor({ timeout: 5_000 });
  const artifactText = await page.locator(".artifactContent").innerText();
  if (!artifactText.includes("OK")) {
    throw new Error(`Expected opened artifact to include OK, got: ${artifactText}`);
  }
  await page.getByRole("button", { name: "关闭产物详情" }).click();

  await page.getByRole("button", { name: "自动流程" }).click();
  await page.getByRole("button", { name: "使用模板" }).click();
  await page.getByRole("textbox", { name: "任务输入" }).waitFor({ timeout: 5_000 });

  if (errors.length > 0) {
    throw new Error(`Renderer errors:\n${errors.join("\n")}`);
  }

  console.log("Electron smoke test passed.");
} finally {
  await app.close();
}
