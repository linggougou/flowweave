# ADR-0003: Playwright 作为执行内核

## 状态

已采纳（2026-05-25）

## 背景

需要稳定的多浏览器自动化、trace、HAR、网络拦截与调试能力。自研驱动成本极高。

## 决策

- `@flowweave/runtime` 基于 **Playwright** 实现执行。
- 定位策略链、等待、重试、自愈在 runtime 层实现，不 fork Playwright。
- 平台 E2E 测试同样使用 Playwright Test。

## 后果

- 可复用 trace viewer、codegen 等生态。
- 需约束：执行器单 BrowserContext 写入串行化。

## 备选方案

- Puppeteer：trace 与跨浏览器弱于 Playwright。
- Selenium：过重，API 陈旧。
