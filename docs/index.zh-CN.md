# PyiTOL Studio 文档

[English](index.md) | [简体中文](index.zh-CN.md)

所有文档均以文件名一一对应的方式同时提供英文与简体中文版本（`docs/en/<name>.md` ↔ `docs/zh/<name>.md`）。

从这里开始

- [README（入门指南）](../README.zh-CN.md) / [README (English)](../README.md) —— 环境要求、安装、首次运行。

## 参考手册

| 文档                           | English                                       | 简体中文                                      |
| ------------------------------ | --------------------------------------------- | --------------------------------------------- |
| 架构说明 —— 进程、模块、数据流 | [architecture.md](en/architecture.md)         | [architecture.md](zh/architecture.md)         |
| Sidecar JSON-RPC 协议          | [sidecar-protocol.md](en/sidecar-protocol.md) | [sidecar-protocol.md](zh/sidecar-protocol.md) |
| IPC 参考（渲染层 ↔ 主进程）    | [ipc-reference.md](en/ipc-reference.md)       | [ipc-reference.md](zh/ipc-reference.md)       |
| 设计系统                       | [design-system.md](en/design-system.md)       | [design-system.md](zh/design-system.md)       |

## 操作指南

| 文档                                | English                             | 简体中文                            |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| 开发指南（命令、约定、操作手册）    | [development.md](en/development.md) | [development.md](zh/development.md) |
| 测试指南（三个测试层）              | [testing.md](en/testing.md)         | [testing.md](zh/testing.md)         |
| 构建与发布（sidecar 包、dmg、签名） | [build.md](en/build.md)             | [build.md](zh/build.md)             |

## 报告

| 文档                                               | English                                                                               | 简体中文                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 前端设计审查报告（审计 + 路线图）                  | [frontend-design-review.md](en/frontend-design-review.md)                             | [frontend-design-review.md](zh/frontend-design-review.md)                             |
| 前端设计审查报告 v2（2026-10-27，修复核对 + 重审） | [frontend-design-review-v2-20261027.md](en/frontend-design-review-v2-20261027.md)     | [frontend-design-review-v2-20261027.md](zh/frontend-design-review-v2-20261027.md)     |
| 前端交互审查报告（2026-10-27，交互专项）           | [frontend-interaction-review-20261027.md](en/frontend-interaction-review-20261027.md) | [frontend-interaction-review-20261027.md](zh/frontend-interaction-review-20261027.md) |

## 文档规则

- 每份文档都有中英两个版本，`docs/en/` 与 `docs/zh/` 下同名，文件顶部互相链接。
- 行为变化时，同一次修改里同步更新两个语言版本。
- 源码引用（`file:line`）在中英两版中保持一致。
