# Steam First Play Fetcher

独立运行的 Steam 首次游玩时间拉取与导出工具。目标是从 Steam 获取每款游戏的真实首次游玩时间，生成可人工核对后导入 BAKA AWARD First Play Timeline 的文件。

本项目与 BAKA AWARD 完全独立：不读取它的配置或数据库，不修改它的任何文件，也不自动导入正式时间轴。

## 状态

第一阶段已完成：

- Node.js + TypeScript CLI，无 GUI、无数据库、无常驻服务。
- 独立 `.env.local` 配置，不会被提交。
- 可选 HTTP 代理（`STEAM_HTTPS_PROXY`）；显式配置后**不会**静默回退直连。
- `probe` / `fetch` / `report` / `export` 四个命令。
- 71 个离线 Mock 测试，不访问真实 Steam。
- 接口研究结论见 [docs/API-RESEARCH.md](docs/API-RESEARCH.md)。

## 环境

- Node.js ≥ 22.18（使用原生 TypeScript 类型剥离运行源码，Node 22.18+ 默认启用）。
- 无需 tsx / esbuild。

```powershell
npm install
```

若在受限环境（禁止生命周期脚本）中安装失败，可用 `npm install --ignore-scripts`：本项目依赖没有必需的 postinstall。

## 配置

复制 `.env.local.example` 为 `.env.local`：

```dotenv
STEAM_OWNER_ID=7656119xxxxxxxxxx   # 你的 SteamID64（17 位）
STEAM_WEB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 32 位十六进制
STEAM_HTTPS_PROXY=                # 可选，如 http://127.0.0.1:7890
```

规则：

- 只读取本目录的 `.env.local`，不读取其他项目配置。
- 环境变量优先于 `.env.local`。
- `STEAM_HTTPS_PROXY` 只支持 `http://` / `https://` 代理。
- 代理密码、API Key、SteamID64 不会出现在日志或导出文件中。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run probe` | 只发一次 GET 请求验证接口，不落盘、不写数据库、不生成导入文件 |
| `npm run fetch` | 完整拉取并归一化，写入 `data/latest.json` 与 `data/raw/` |
| `npm run report [-- --library <path>]` | 打印统计；可选只读匹配 BAKA AWARD 档案 JSON |
| `npm run export [-- --library <path>]` | 生成 `exports/` 下四份文件 |

`probe` 的退出码：`0` 成功且拿到游戏；`2` 接口可用但返回 0 条；`1` 失败。

### 推荐流程

```powershell
npm run probe                 # 先确认接口与代理
npm run fetch                 # 仅在 probe 成功后
npm run report -- --library "C:\...\baka-library.json"
npm run export -- --library "C:\...\baka-library.json"
```

`report` / `export` 的 `--library` 只按 AppID 匹配：没有 AppID 的记录不会做模糊匹配；文件只读，不会被修改。

## 数据规则

| 情况 | 处理 |
|---|---|
| `first_playtime` 为合法 Unix 秒 | `dateSource: "steam"`，`confidence: "confirmed"`，日期按 `Asia/Shanghai` 转 `YYYY-MM-DD` |
| `first_playtime` 缺失 | `confidence: "missing"`，不补日期 |
| `first_playtime` 为 0 | 标记为 0，不当作日期 |
| 单位异常（毫秒等） | 标记 `unit-anomaly`，不转换 |
| 非法（字符串/负数/小数/未来） | 标记 `invalid` |
| 整体缺失但平台字段有效 | 只输出 `platformCandidate` + `dateSource: "platform-specific"`，不计入整体有效数量 |
| 重复 AppID | 去重并计数，保留第一条 |
| AppID 非法 | 丢弃该条并计入 `rejectedRecords`，不影响其他记录 |

绝不用 `last_playtime` 或 `playtime_forever` 推算首次游玩日期；不伪造缺失日期。

### 导出字段

`exports/first-play-timeline.json`：

```json
{
  "version": 1,
  "source": "steam-client-get-last-played-times",
  "fetchedAt": "2026-11-01T00:00:00.000Z",
  "timezone": "Asia/Shanghai",
  "games": [
    {
      "appId": 524220,
      "gameName": null,
      "firstPlaytime": 1700000000,
      "firstPlayedOn": "2023-11-15",
      "datePrecision": "day",
      "dateSource": "steam",
      "confidence": "confirmed",
      "lastPlaytime": null,
      "playtimeForever": null,
      "firstWindowsPlaytime": null,
      "firstMacPlaytime": null,
      "firstLinuxPlaytime": null,
      "firstDeckPlaytime": null,
      "platformCandidate": null,
      "issues": []
    }
  ]
}
```

`gameName` 目前为 `null`：`ClientGetLastPlayedTimes` 不返回游戏名称，本项目不额外抓取名称接口；可在 BAKA 档案匹配后自行补全。

CSV：

- `first-play-timeline.csv`：全部记录（包括缺失日期）。
- `first-play-missing.csv`：仅非 confirmed 记录（缺失/0/非法/仅平台）。
- 两个 CSV 都带 UTF-8 BOM，便于 Excel 直接打开。

`fetch-report.json` 包含统计、日期范围和可选的 BAKA 档案匹配结果。

## 接口与代理

- URL：`https://api.steampowered.com/IPlayerService/ClientGetLastPlayedTimes/v1/`
- 方法：**GET**（POST 会被 Steam 以 405 拒绝并提示必须 GET）。
- 认证：`key` 查询参数。
- 参数：`min_last_played` 可选（uint32，Unix 秒）；默认不传 = 全量。
- 响应：`{"response":{"games":[...]}}`，字段为 snake_case 数字。
- 当前 proto 中没有 `first_deck_playtime` / `playtime_deck_forever`；本项目按实际响应处理，不强行补齐。

传输层：

- 无代理：Node 原生 `fetch`。
- 有代理：`undici` 的 `fetch` + `ProxyAgent`，请求结束后释放连接。
- 20s/60s 整体超时（probe/fetch）。
- 错误分类：`proxy-connection-failed` / `dns-network` / `timeout` / `http-status` / `api-rejected` / `parse-error` / `validation` / `export-write`。
- 显式配置代理且连接失败时，直接报错，不回退直连。

该接口在 Steam 官方文档中未公开（UNDOCUMENTED）。若真实 probe 返回 0 条或被拒绝，请检查 API Key 权限与 Steam「游戏详情」隐私设置；本项目不会自动尝试 Steam 客户端内部认证。

## 测试与构建

```powershell
npm test        # 71 个离线 Mock 测试
npm run build   # tsc 输出到 dist/
```

测试覆盖：正常列表、合法/缺失/0/单位异常/非法时间戳、重复 AppID、平台字段、HTTP 错误、网络超时、代理失败、非法 JSON、字段类型错误、敏感数据脱敏。

## 目录

```text
src/api/         传输层与 Steam 客户端调用
src/parser/      响应解析与时间戳处理
src/normalizer/  游戏记录校验、去重、归一化
src/exporter/    JSON / CSV 导出
src/reporter/    统计报告与 BAKA 档案匹配
src/cli.ts       CLI 入口
docs/            接口研究记录
exports/         导出结果（git 忽略）
reports/         报告输出（git 忽略）
data/raw/        原始响应备份（git 忽略）
tests/           离线 Mock 测试
```
