# adapter/ — PI SDK 适配层

封装 PI Coding Agent SDK 调用，提供统一的模型查询和执行接口。

---

## 文件清单

### `pi-sdk.ts` — PI SDK 适配器

| 导出 | 说明 |
|------|------|
| `PiModel` | PI 模型描述（provider、id、name、reasoning、input） |
| `ModelRegistry` | 模型注册表接口（getAll、getAvailable、find） |
| `AuthStorage` | 认证存储类型（占位） |
| `SettingsManager` | 设置管理器类型（占位） |
| `ResourceLoader` | 资源加载器类型（占位） |
| `ToolDefinition` | 工具定义类型（占位） |
| `importPiCodingAgentSdk` | 动态导入 PI Coding Agent SDK（支持指定模块路径或从默认位置 / 运行时目录加载） |
| `importPiModelRegistryFromStandalone` | 从独立 SDK 模式导入模型注册表 |
| `runSubagentWithPiSdk` | 统一的 subagent 执行入口（支持 host-inherit 和 standalone-sdk 两种模式） |
| `listPiModels` | 列出所有可用模型（含 Host 运行时模型和 Rest 模型） |
| `validateSubagentModelSelection` | 验证模型选择策略（current / default / specific）是否有效 |
