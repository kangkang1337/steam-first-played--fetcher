# Steam `ClientGetLastPlayedTimes` 接口研究

> 研究时间：2026-11-01。本文区分「已验证」与「未验证」，未验证项不得当成 Steam 官方事实使用。

## 结论摘要

| 项目 | 结论 | 状态 |
|---|---|---|
| HTTP URL | `https://api.steampowered.com/IPlayerService/ClientGetLastPlayedTimes/v1/` | 已验证（匿名 GET 返回 200） |
| HTTP 方法 | **GET**（POST 返回 405，正文明确 “This API must be called with a HTTP GET request”） | 已验证（匿名实测） |
| 请求体 | 无；参数放 query string | 已验证 |
| 认证 | `key` 查询参数（Steam Web API Key） | 部分验证（无 key 时为 200 空响应） |
| 必需参数 | `key`；`min_last_played` 可选（uint32） | 依据 proto + 匿名实测 |
| `min_last_played` 语义 | 客户端已知道的最新 last-played 时间；服务端只返回此后有更新的记录 | 依据官方 proto 描述 |
| 首次全量拉取 | 省略 `min_last_played`，或设为 `0` | 未验证（需带 key 实测） |
| 响应包装 | `{"response": {"games": [...]}}` | 未验证（无 key 时为 `{"response":{}}`） |
| 分页 | proto 无分页字段；靠 `min_last_played` 做增量 | 未验证 |
| Deck 字段 | 当前 proto **没有** `first_deck_playtime` / `playtime_deck_forever` | 已验证（两份独立 proto 一致） |
| 是否官方稳定 API | **不是**。xPaw 标注 UNDOCUMENTED，Steamworks 官方未文档化 | 已验证 |

## 来源

1. Steam 客户端 protobuf：`steammessages_player.steamclient.proto`（SteamTracking/Protobufs 仓库；本机通过 npm `steam-user@5.3.0` 包内的同一份 proto 核对）。
2. 社区整理的 Web API 参考：<https://steamapi.xpaw.me/IPlayerService#ClientGetLastPlayedTimes>（标注 UNDOCUMENTED，POST）。
3. 小黑盒桌面端 `2.10.19` 打包产物中的同名字段定义（只读检查，见下）。

GitHub raw / jsDelivr 在本机网络不可直连，因此 proto 采用 npm 包内的官方镜像版本核对；小黑盒产物中的 protobuf 描述与该版本逐字段一致。

## protobuf 定义（原文）

请求：

```proto
message CPlayer_GetLastPlayedTimes_Request {
    optional uint32 min_last_played = 1 [(description) = "The most recent last-played time the client already knows about"];
}
```

响应：

```proto
message CPlayer_GetLastPlayedTimes_Response {
    message Game {
        optional int32 appid = 1;
        optional uint32 last_playtime = 2;
        optional int32 playtime_2weeks = 3;
        optional int32 playtime_forever = 4;
        optional uint32 first_playtime = 5;
        optional int32 playtime_windows_forever = 6;
        optional int32 playtime_mac_forever = 7;
        optional int32 playtime_linux_forever = 8;
        optional uint32 first_windows_playtime = 9;
        optional uint32 first_mac_playtime = 10;
        optional uint32 first_linux_playtime = 11;
        optional uint32 last_windows_playtime = 12;
        optional uint32 last_mac_playtime = 13;
        optional uint32 last_linux_playtime = 14;
    }
    repeated .CPlayer_GetLastPlayedTimes_Response.Game games = 1;
}
```

要点：

- `first_playtime` 类型是 `uint32`。Unix 时间戳（秒）到 2106 年才溢出 32 位，而毫秒时间戳（约 1.7e12）放不进 uint32 —— 这强烈支持「该字段是 Unix 秒」，但**最终以实际响应数值范围验证**。
- 字段编号 1–14 之外没有 deck 相关字段；用户提到的 `first_deck_playtime` 在当前 Steam 协议版本中不存在。
- 所有业务字段都是 `optional`：**字段缺失与值为 0 在 protobuf 语义上可能无法区分**（JSON 序列化若省略默认值，`first_playtime: 0` 与「缺失」都会表现为字段不存在）。因此本项目把「缺失」和「为 0」都视为无有效日期，但在报告里分开统计（字段不存在 = missing，字段存在但为 0 = zero）。

## 实际网络探测记录（匿名，不带 key）

环境：本机系统代理 `127.0.0.1:7890`（仅在研究阶段用于匿名探测，**没有**写入项目配置）。探测使用项目将要采用的 undici `ProxyAgent` 传输实现完成。

### 1. POST 请求

```
POST https://api.steampowered.com/IPlayerService/ClientGetLastPlayedTimes/v1/
Content-Type: application/x-www-form-urlencoded

min_last_played=0
```

结果：`HTTP 405`，`text/html`，正文：

```
This API must be called with a HTTP GET request
```

→ xPaw 页面上标注的 POST 对 Web API 不适用；Web API 强制 GET。

### 2. GET 请求（无 key）

```
GET https://api.steampowered.com/IPlayerService/ClientGetLastPlayedTimes/v1/?min_last_played=0
```

结果：`HTTP 200`，`application/json; charset=UTF-8`，`x-eresult: 1`，正文：

```json
{"response":{}}
```

→ 接口在 Web API 层真实存在且可调用。无 key 时返回空 `response`，**不**返回 401/403。因此「用 API Key 调用是否返回 games」仍需带 key 的真实 probe 才能确认。

## 与小黑盒的关系

小黑盒 `ai-desktop.steam` 扩展包含完整的 Steam 客户端 protobuf 描述与 unified service 方法表（`ClientGetLastPlayedTimes` → `CPlayer_GetLastPlayedTimes_Request/Response`），并通过 Steam 客户端内部会话调用。这**不能**证明普通 Web API Key 在 HTTP 上也能拿到相同数据。本项目只使用自建 HTTP 请求，不接触小黑盒 Cookie/Token/凭据，不注入 Steam 进程。

## 待 probe 验证的问题

1. 带有效 API Key 的 GET 是否返回非空 `games`？
2. 返回数量是否接近账号库数量（约 456）？若远小于库存，说明存在权限/隐私/增量限制。
3. `min_last_played` 省略与设 0 是否等价。
4. 字段 JSON 序列化习惯：0 值字段是否出现在响应里。
5. `first_playtime` 数值是否落在 Unix 秒区间（约 1.0e9–2.2e9）。
6. 响应是否包含 `x-eresult` 非 1 的错误结构。

## 失败时的替代路线（不自动执行）

- `IPlayerService/GetOwnedGames/v1`：公开文档化接口，能返回 `playtime_forever` / `playtime_2weeks`，**不含**首次游玩时间，不能替代。
- `IPlayerService/GetRecentlyPlayedGames/v1`：同样不含首次游玩时间。
- Steam 客户端本地 `localconfig.vdf` / `loginusers.vdf`：没有可靠的 first-play 记录，且属于本地私密文件，不作为数据源。
- 第三方（SteamDB / Exophase / Astats）：非官方、需额外抓取与授权，不在本项目第一阶段范围。

## 隐私与权限提示

`ClientGetLastPlayedTimes` 没有 `steamid` 参数，按 proto 语义返回 **API Key 所属账号**的数据。游戏详情隐私设置（Steam 个人资料 → 隐私 → 游戏详情）是否影响该接口，属于未验证项；若 probe 返回空或数量异常，应优先检查该设置并用 `GetOwnedGames` 做对照（后续版本可选）。
