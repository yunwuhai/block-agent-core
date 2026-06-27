# tool/permissions.ts

## 作用

文件级权限沙箱 — 管理当前会话的权限状态，在 `tool_call` 事件层强制执行模板的 `allowReadPaths` / `allowWritePaths` / `denyPaths` 规则。

不与任何源文件耦合。仅依赖 `utils/glob.ts` 做路径匹配。

## 权限规则

1. **未设置权限** → 开放模式，允许一切访问（向后兼容）
2. **denyPaths 匹配** → 始终拦截（拒绝优先于允许）
3. **allow 列表非空** → 路径必须匹配至少一个 allow 模式
4. **allow 列表为空** → 允许所有（除非被 deny 匹配）

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `setPermissions(readPaths, writePaths, denyPaths)` | 38-44 | 存储合并后的权限集（来自已加载的模板） |
| `clearPermissions()` | 47-49 | 清除权限状态，回到开放模式 |
| `checkRead(path)` | 55-57 | 检查是否允许读取 `path`，返回 `{ allowed, reason? }` |
| `checkWrite(path)` | 63-65 | 检查是否允许写入 `path`，返回 `{ allowed, reason? }` |
| `getPermissions()` | 68-70 | 暴露当前权限状态（用于测试/调试） |
| `checkPath(path, access)` | 78-106 | 内部实现 — 根据权限规则检查路径 |
