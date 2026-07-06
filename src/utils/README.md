# utils/ — 通用工具函数

无外部依赖的纯工具函数集合。所有模块共用。

---

## 文件清单

### `datetime.ts` — 日期工具

| 导出 | 说明 |
|------|------|
| `nowIso` | 返回当前时间的 ISO 8601 格式字符串（含时区偏移，如 `2026-07-06T14:39:00.000+08:00`） |

### `jsonl.ts` — JSONL 文件读写

| 导出 | 说明 |
|------|------|
| `readJsonl` | 读取 JSONL 文件，返回泛型数组（空文件返回 `[]`，自动跳过空行和无效行） |
| `appendJsonl` | 追加单条记录到 JSONL 文件（自动创建目录） |
| `writeJsonl` | 覆写整个 JSONL 文件（使用原子写入：先写 `.tmp` 再 `rename`） |
| `updateJsonl` | 按 `id` 更新 JSONL 文件中的记录（仅支持 `{id: string}` 类型的记录） |

### `range-utils.ts` — 数字范围序列化

| 导出 | 说明 |
|------|------|
| `toNumberRanges` | 将数字数组压缩为连续范围数组，如 `[1,2,3,5,7,8]` → `[[1,3],[5,5],[7,8]]` |
| `fromNumberRanges` | 将范围数组展开为数字数组，如 `[[1,3],[5,5]]` → `[1,2,3,5]` |
| `normalizeRanges` | 归一化范围数组（过滤无效行、合并相邻范围） |

### `glob.ts` — Glob 匹配

| 导出 | 说明 |
|------|------|
| `globToRegex` | 将 glob 模式（`*`、`**`、`?`）转换为 JavaScript 正则表达式 |
| `matchGlob` | 检测路径是否匹配指定 glob 模式 |
| `matchesAnyGlob` | 检测路径是否匹配多个 glob 模式中的任意一个 |

### `toml.ts` — TOML 读写

| 导出 | 说明 |
|------|------|
| `readToml` | 读取并解析 TOML 文件，返回泛型类型 |
| `writeToml` | 将数据序列化为 TOML 格式并写入文件（自动创建目录） |

底层使用 [`smol-toml`](https://github.com/squirrelchat/smol-toml) 库进行解析和序列化。
