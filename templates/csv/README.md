# CSV 导入

用表格批量新增或修改行政区、自然要素、道路和地标，不必手改 YAML。

```sh
npm run data:import -- 我的地标.csv            # 校验并写入 world/
npm run data:import -- 我的地标.csv --check    # 只校验，不写入
npm run data                                    # 重新生成地图
```

脚本按文件名判断类型：文件名含 `division`/`行政区`、`feature`/`自然要素`、`route`/`道路`、`place`/`地标`。也可以用 `--kind divisions|features|routes|places` 指定。新条目默认写入该类的主文件，`--into world/features/xxx.yaml` 可改写到别的文件。

整份文件全部通过才会写入。任何一行有错，都会列出“第 N 行 列名：原因”，不改动任何文件。写入后还会用生成器的完整校验（面积、人口之和，区划代码，道路编号等）再查一遍。

## 规则

- **编号留空**为新建，脚本自动分配永久编号。**填写已有编号**为修改：填了的格覆盖原值，空格保留原值，填 `-` 删除该字段。
- 只需包含要用到的列，列的顺序随意。列名可用中文或英文（见下表）。
- 引用其他条目（上级、所在区、途经、徽标来自）时，填编号或中文名都可以，也可以引用同一文件里新建的条目。
- 新建条目的状态默认为 `draft`。状态可选 `canon`（设定）、`draft`（草稿）、`generated`（生成，待审阅）。
- 坐标单位：锚点、识别坐标为设计坐标（km，X 向东、Y 向北，范围 320 × 190），偏移为实际 km。
- 用 Excel 保存时选“CSV UTF-8”。GBK 编码的文件也能读。

## 行政区 `divisions.csv`

| 列 | 英文列名 | 说明 |
|---|---|---|
| 编号 | id | 留空为新建 |
| 类型 | subtype | `locality`（市）或 `borough`（区），新建必填 |
| 上级 | parent | 市的上级是领地，区的上级是市；新建必填 |
| 中文名、英文名 | name_zh、name_en | 新建必填 |
| 维京语名、巴克汉姆语名 | name_viking、name_buckham | |
| 中文简称、英文简称 | short_zh、short_en | |
| 区划代码 | admin_code | 留空时按上级代码自动编下一个 |
| 人口、面积 | population、area_km2 | 面积为实际 km²；各区之和须等于所属市 |
| 主色 | color | `#RRGGBB`，新建市必填 |
| 徽标图案、徽标底纹 | emblem_motif、emblem_pattern | 可选值见 `src/lib/emblems.tsx` |
| 锚点X、锚点Y | anchor_x_km、anchor_y_km | 市的中心位置，新建市必填 |
| 方向X、方向Y | dir_x、dir_y | 区相对市锚点的方向；留空时自动放在空隙最大的方向 |
| 中文简介、英文简介 | notes_zh、notes_en | |

全岛面积由各市面积之和决定，新增市或改动面积会使岛屿和海岸线随之变化。重新生成后留意 `WARN … no … found near` 警告：已命名的海湾、岬角等若离开了原位置，需要按候选清单更新识别坐标。

## 自然要素 `features.csv`

| 列 | 英文列名 | 说明 |
|---|---|---|
| 编号、状态 | id、status | |
| 类型 | subtype | `mountain_range`、`ridge`、`river`、`lake`、`island`、`bay`、`fjord`、`cape`、`strait`、`estuary`、`peak`、`pass`、`glacier` |
| 中文名 … 巴克汉姆语名 | name_zh … name_buckham | |
| 识别类型、识别X、识别Y | detect_kind、detect_x_km、detect_y_km | 给生成器识别出的地貌命名：认领该位置 10 km 内最近的同类地貌。候选清单见每次生成后的 `.cache/candidates-<领地编号>.json` |
| 中文简介、英文简介 | notes_zh、notes_en | |

## 道路 `routes.csv`

| 列 | 英文列名 | 说明 |
|---|---|---|
| 编号、状态 | id、status | |
| 编号牌 | ref | 按等级：`G-NV-1`、`G-NV-101`、`S-NV-1`、`S-NV-201`、`X-NV-001`、`Y-NV-001` |
| 等级 | network | `national_expressway`、`national_highway`、`territorial_expressway`、`territorial_highway`、`municipal_road`、`township_road` |
| 道路类别 | class | 留空时按等级自动填写 |
| 中文名 … 巴克汉姆语名 | name_zh … name_buckham | |
| 途经 | via | 依次经过的市，用分号分隔，至少两个 |
| 环线、支线 | ring、ends_at_network | 是/否。支线从第一个市出发，接入已有路网即止 |
| 隧道成本 | tunnel_cost | 越小越倾向于打隧道穿山 |
| 徽标图案、徽标底纹 | emblem_motif、emblem_pattern | |
| 中文简介、英文简介 | notes_zh、notes_en | |

道路按文件中的顺序生成，新道路追加在最后，会避开已有道路的走廊。

## 地标 `places.csv`

| 列 | 英文列名 | 说明 |
|---|---|---|
| 编号、状态 | id、status | |
| 类型 | subtype | 采用 OSM / Overture 类别，如 `government`、`lighthouse`、`museum` |
| 所在区 | in | 新建必填 |
| 中文名 … 巴克汉姆语名 | name_zh … name_buckham | |
| 向东偏移、向北偏移 | offset_east_km、offset_north_km | 相对所在区城区中心的实际 km |
| 地图符号 | marker | `dot` 或 `emblem` |
| 徽标来自 | emblem_of | 地图符号为 `emblem` 时必填 |
| 占地布局 | site_layout | 在有街道的城市里画出地标占地和建筑轮廓：`complex`（建筑群）、`hall`（单体大楼）、`campus`（园区）、`stadium`（体育场）、`tower`（塔）、`park`（公园）、`plaza`（广场）、`market`（市场） |
| 占地长米、占地宽米 | site_along_m、site_across_m | 占地沿街道方格方向的长、宽（米），与占地布局一起填 |
| 中文简介、英文简介 | notes_zh、notes_en | |

有占地的地标必须位于区内（所在区填区）。占地内不再生成街道和普通建筑；占地要落在城区（建成区）内，否则生成时会给出警告。

## 示例

`examples/` 下的文件都能通过校验，可以直接用 `--check` 试运行：在两个区之间调整人口、补一个巴克汉姆语名、新增一条领地公路、新增一座灯塔。
