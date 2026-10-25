"""Import rows from a CSV file into the world YAML files.

Every row is checked first and nothing is written unless the whole file passes and the
merged world still passes the build's own validation. Messages are in Chinese.

    python pipeline/import_csv.py divisions.csv              # kind from the file name
    python pipeline/import_csv.py rows.csv --kind places     # or given explicitly
    python pipeline/import_csv.py rows.csv --check           # validate only, write nothing
    python pipeline/import_csv.py rows.csv --into world/features/cn-nv-coast.yaml

A row with an empty id creates an entity (a permanent id is minted). A row with an existing
id updates it: filled cells overwrite, empty cells keep the current value, "-" removes it.
References (parent, via, in, emblem_of) take an id or a unique Chinese name, including
names created earlier in the same file. Templates: templates/csv/.
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas.world import CODE_DIGITS, DETECT_KINDS, HARBOUR_TERMINALS, RAIL_NETWORKS, ROOT, SITE_LAYOUTS, WORLD_DIR, World  # noqa: E402
from new_id import mint  # noqa: E402

DELETE = object()
STATUSES = ("canon", "draft", "generated")
FEATURE_SUBTYPES = ("mountain_range", "ridge", "volcano", "river", "lake", *DETECT_KINDS)
NETWORKS = {  # the infix is the territory's ISO 3166-2 suffix (NV, VK, …)
    "national_expressway": ("motorway", r"G-[A-Z]{2}-\d{1,2}"),
    "territorial_expressway": ("motorway", r"S-[A-Z]{2}-\d{1,2}"),
    "territorial_highway": ("primary", r"S-[A-Z]{2}-[1-9]\d{2}"),
    "municipal_road": ("secondary", r"X-[A-Z]{2}-\d{3}"),
}
BUILDING_SUBTYPES = ("government", "building", "civic", "office", "museum", "theatre", "library", "townhall",
                     "tower", "hospital", "marketplace", "exhibition_centre")


def _emblem_names(const: str, file: str = "emblems.tsx") -> tuple[str, ...]:
    src = (ROOT / "src" / "lib" / file).read_text(encoding="utf-8")
    block = src.split(f"export const {const}", 1)[1].split("\n};", 1)[0]
    return tuple(re.findall(r"^  (\w+):", block, flags=re.M))


GLYPHS = _emblem_names("GLYPHS", "glyphs.ts")
MOTIFS, PATTERNS = _emblem_names("MOTIFS") + tuple(g for g in GLYPHS if g not in _emblem_names("MOTIFS")), _emblem_names("PATTERNS")


@dataclass
class Col:
    key: str
    zh: str
    path: str = ""
    type: str = "str"  # str | int | float | angle | bool | ref | refs | choice | color
    choices: tuple = ()
    required: bool = False  # for new rows


NAMES = [
    Col("name_zh", "中文名", "names.zh", required=True),
    Col("name_en", "英文名", "names.en", required=True),
    Col("name_viking", "维京语名", "names.art-x-viking"),
    Col("name_buckham", "巴克汉姆语名", "names.art-x-buckham"),
]
NOTES = [Col("notes_zh", "中文简介", "notes.zh"), Col("notes_en", "英文简介", "notes.en")]
HEAD = [Col("id", "编号"), Col("status", "状态", "status", "choice", STATUSES)]

KINDS = {
    "divisions": {
        "label": "行政区", "folder": "divisions", "key": "divisions", "prefix": "div", "default": "cn-nv.yaml",
        "cols": HEAD + [
            Col("subtype", "类型", "subtype", "choice", ("locality", "borough"), required=True),
            Col("parent", "上级", "parent", "ref", required=True),
            *NAMES,
            Col("short_zh", "中文简称", "short_names.zh"),
            Col("short_en", "英文简称", "short_names.en"),
            Col("admin_code", "区划代码", "codes.admin"),
            Col("population", "人口", "population", "int"),
            Col("area_km2", "面积", "area_km2", "float"),
            Col("color", "主色", "color", "color"),
            Col("emblem_motif", "徽标图案", "emblem.motif", "choice", MOTIFS),
            Col("emblem_pattern", "徽标底纹", "emblem.pattern", "choice", PATTERNS),
            Col("anchor_x_km", "锚点X"), Col("anchor_y_km", "锚点Y"),
            Col("dir_x", "方向X"), Col("dir_y", "方向Y"),
            *NOTES,
        ],
    },
    "features": {
        "label": "自然要素", "folder": "features", "key": "features", "prefix": "nat", "default": "cn-nv-natural.yaml",
        "cols": HEAD + [
            Col("subtype", "类型", "subtype", "choice", FEATURE_SUBTYPES, required=True),
            *NAMES,
            Col("detect_kind", "识别类型", "detect.kind", "choice", DETECT_KINDS),
            Col("detect_x_km", "识别X"), Col("detect_y_km", "识别Y"),
            *NOTES,
        ],
    },
    "routes": {
        "label": "道路", "folder": "transport", "key": "routes", "prefix": "rte", "default": "cn-nv-roads.yaml",
        "cols": HEAD + [
            Col("ref", "编号牌", "ref", required=True),
            Col("network", "等级", "network", "choice", tuple(NETWORKS), required=True),
            Col("class", "道路类别", "class", "choice", tuple({v[0] for v in NETWORKS.values()})),
            *NAMES,
            Col("via", "途经", "via", "refs", required=True),
            Col("ring", "环线", "ring", "bool"),
            Col("straight", "笔直", "straight", "bool"),
            Col("ends_at_network", "支线", "ends_at_network", "bool"),
            Col("tunnel_cost", "隧道成本", "tunnel_cost", "float"),
            Col("shield", "路牌图案", "shield", "choice", GLYPHS),
            *NOTES,
        ],
    },
    "places": {
        "label": "地标", "folder": "places", "key": "places", "prefix": "poi", "default": "cn-nv-places.yaml",
        "cols": HEAD + [
            Col("subtype", "类型", "subtype", required=True),
            Col("in", "所在区", "in", "ref", required=True),
            *NAMES,
            Col("offset_east_km", "向东偏移"), Col("offset_north_km", "向北偏移"),
            Col("marker", "地图符号", "marker", "choice", ("dot", "emblem")),
            Col("emblem_of", "徽标来自", "emblem_of", "ref"),
            Col("site_layout", "占地布局", "site.layout", "choice", SITE_LAYOUTS),
            Col("site_along_m", "占地长米"), Col("site_across_m", "占地宽米"),
            Col("site_angle_deg", "占地朝向度", "site.angle_deg", "angle"),
            Col("site_terminals", "港区码头", "site.terminals", "choices", HARBOUR_TERMINALS),
            Col("site_bridge_to", "大桥连接", "site.bridge_to", "ref"),
            *NOTES,
        ],
    },
    "railways": {
        "label": "铁路", "folder": "transport", "key": "railways", "prefix": "rte", "default": "cn-nv-rail.yaml",
        "cols": HEAD + [
            Col("network", "线路类型", "network", "choice", RAIL_NETWORKS, required=True),
            *NAMES,
            Col("via", "停靠", "via", "refs", required=True),
            Col("color", "线路色", "color", "color"),
            Col("operating_speed", "运营速度", "tech.operating_speed_kmh", "int"),
            Col("design_speed", "设计速度", "tech.design_speed_kmh", "int"),
            Col("tunnel_cost", "隧道成本", "tunnel_cost", "float"),
            *NOTES,
        ],
    },
}

TRUE, FALSE = {"1", "true", "yes", "y", "是", "√"}, {"0", "false", "no", "n", "否"}


class Problems(list):
    def add(self, where: str, msg: str):
        self.append(f"{where}：{msg}")


def read_csv(path: Path) -> list[dict[str, str]]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "gb18030"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        sys.exit(f"无法读取 {path.name}：请另存为 UTF-8 编码的 CSV")
    return list(csv.DictReader(text.splitlines()))


def get_path(obj, path):
    for part in path.split("."):
        if not isinstance(obj, dict) or part not in obj:
            return None
        obj = obj[part]
    return obj


def set_path(obj, path, value):
    parts = path.split(".")
    for part in parts[:-1]:
        if part not in obj or not isinstance(obj[part], dict):
            obj[part] = CommentedMap()
        obj = obj[part]
    if value is DELETE:
        obj.pop(parts[-1], None)
    else:
        obj[parts[-1]] = value


class Importer:
    def __init__(self, kind: str, rows: list[dict[str, str]], filename: str):
        self.kind, self.spec, self.filename = kind, KINDS[kind], filename
        self.world = World()
        self.problems = Problems()
        self.cols = {c.key: c for c in self.spec["cols"]}
        self.rows = self._map_headers(rows)
        self.taken = set(self.world.entities)
        self.ids: list[str] = []
        self.new_names: dict[str, str] = {}
        self.new_codes: dict[str, str] = {}

    def _map_headers(self, rows):
        alias = {}
        for c in self.spec["cols"]:
            alias[c.key.lower()] = c.key
            alias[c.zh] = c.key
        out = []
        unknown = set()
        for r in rows:
            m = {}
            for h, v in r.items():
                if h is None:
                    continue
                key = alias.get(h.strip().lower()) or alias.get(h.strip())
                if key is None:
                    unknown.add(h.strip())
                    continue
                m[key] = (v or "").strip()
            out.append(m)
        for h in sorted(unknown):
            self.problems.add(self.filename, f"未知列“{h}”。可用列：{'、'.join(f'{c.key}（{c.zh}）' for c in self.spec['cols'])}")
        return out

    def where(self, i, col=None):
        c = self.cols.get(col) if col else None
        return f"第 {i + 2} 行" + (f" {c.zh}（{c.key}）" if c else "")

    # ── references ──────────────────────────────────────────
    def resolve(self, value: str, i: int, col: str, pool: str):
        """pool: 'division' or 'any'."""
        ents = self.world.divisions if pool == "division" else self.world.entities
        same_kind = pool == "any" or self.kind == "divisions"
        if value in ents or same_kind and value in self.new_names.values():
            return value
        hits = [eid for eid, e in ents.items() if e.get("names", {}).get("zh") == value or e.get("short_names", {}).get("zh") == value]
        if same_kind:
            hits += [eid for name, eid in self.new_names.items() if name == value and eid not in hits]
        if len(hits) == 1:
            return hits[0]
        if not hits:
            self.problems.add(self.where(i, col), f"找不到“{value}”（填编号或中文名）")
        else:
            self.problems.add(self.where(i, col), f"“{value}”对应多个条目（{'、'.join(hits)}），请改填编号")
        return None

    # ── cell parsing ────────────────────────────────────────
    def parse(self, c: Col, raw: str, i: int):
        if raw == "-":
            return DELETE
        try:
            if c.type == "int":
                v = int(raw.replace(",", "").replace("，", ""))
                if v < 0:
                    raise ValueError
                return v
            if c.type == "float":
                v = float(raw.replace(",", ""))
                if v <= 0:
                    raise ValueError
                return v
            if c.type == "angle":
                v = float(raw.replace("°", ""))
                if not -360 <= v <= 360:
                    raise ValueError
                return int(v) if v.is_integer() else v
        except ValueError:
            what = {"int": "整数", "angle": "角度（-360 到 360，从正东逆时针）"}.get(c.type, "正数")
            self.problems.add(self.where(i, c.key), f"“{raw}”不是有效的{what}")
            return None
        if c.type == "bool":
            low = raw.lower()
            if low in TRUE:
                return True
            if low in FALSE:
                return False
            self.problems.add(self.where(i, c.key), f"“{raw}”应为 是/否")
            return None
        if c.type == "choice" and raw not in c.choices:
            self.problems.add(self.where(i, c.key), f"“{raw}”不是可选值（{'、'.join(c.choices)}）")
            return None
        if c.type == "choices":
            parts = [p.strip() for p in re.split(r"[;；,，、]", raw) if p.strip()]
            bad = [p for p in parts if p not in c.choices]
            if bad:
                self.problems.add(self.where(i, c.key), f"“{'、'.join(bad)}”不是可选值（{'、'.join(c.choices)}），多个用分号分隔")
                return None
            return CommentedSeq(parts)
        if c.type == "color" and not re.fullmatch(r"#[0-9A-Fa-f]{6}", raw):
            self.problems.add(self.where(i, c.key), f"“{raw}”应为 #RRGGBB 格式的颜色")
            return None
        if c.type == "ref":
            return self.resolve(raw, i, c.key, "division" if c.key in ("parent", "in") else "any")
        if c.type == "refs":
            parts = [p.strip() for p in re.split(r"[;；,，、]", raw) if p.strip()]
            got = [self.resolve(p, i, c.key, "division") for p in parts]
            if len(parts) < 2:
                self.problems.add(self.where(i, c.key), f"至少需要两个{'停靠站' if self.kind == 'railways' else '途经城市'}，用分号分隔")
            return CommentedSeq(got) if None not in got else None
        return raw

    def pair(self, row, i, kx, ky):
        x, y = row.get(kx, ""), row.get(ky, "")
        if not x and not y:
            return None
        if x == "-" and y == "-":
            return DELETE
        try:
            seq = CommentedSeq(int(v) if v.is_integer() else v for v in (float(x), float(y)))
            seq.fa.set_flow_style()
            return seq
        except ValueError:
            self.problems.add(self.where(i, kx), f"“{x}”/“{y}”应为两个数字（{self.cols[kx].zh}、{self.cols[ky].zh}）")
            return None

    # ── rows ────────────────────────────────────────────────
    def plan(self):
        """Returns [(id, is_new, {path: value}, extras)]."""
        seen_ids = set()
        for i, row in enumerate(self.rows):
            eid = row.get("id", "")
            if eid:
                if eid in seen_ids:
                    self.problems.add(self.where(i, "id"), f"编号 {eid} 在文件中重复出现")
                seen_ids.add(eid)
                if eid not in self.world.entities:
                    self.problems.add(self.where(i, "id"), f"编号 {eid} 不存在；新建条目请把编号留空")
                elif eid not in getattr(self.world, self.spec["key"]):
                    self.problems.add(self.where(i, "id"), f"编号 {eid} 不是{self.spec['label']}")
                self.ids.append(eid)
            else:
                prefix = self.spec["prefix"]
                if self.kind == "places" and row.get("subtype") in BUILDING_SUBTYPES:
                    prefix = "bld"
                new = mint(prefix, self.taken)
                self.ids.append(new)
                if row.get("name_zh"):
                    self.new_names[row["name_zh"]] = new
        plans = []
        for i, row in enumerate(self.rows):
            eid = self.ids[i]
            is_new = not row.get("id")
            changes = {}
            for c in self.spec["cols"]:
                if not c.path:
                    continue
                raw = row.get(c.key, "")
                if not raw:
                    if is_new and c.required:
                        self.problems.add(self.where(i, c.key), "新建条目必须填写")
                    continue
                v = self.parse(c, raw, i)
                if v is not None:
                    if v is DELETE and c.required:
                        self.problems.add(self.where(i, c.key), "必填项不能删除")
                        continue
                    changes[c.path] = v
            if is_new:
                changes.setdefault("status", "draft")
            extras = {}
            getattr(self, f"check_{self.kind}")(i, row, eid, is_new, changes, extras)
            plans.append((eid, is_new, changes, extras))
        return plans

    def check_divisions(self, i, row, eid, is_new, changes, extras):
        cur = self.world.divisions.get(eid, {})
        subtype = changes.get("subtype", cur.get("subtype"))
        parent = changes.get("parent", cur.get("parent"))
        if parent in self.world.entities:
            psub = self.world.entities[parent].get("subtype")
        elif parent in self.ids:
            psub = self.rows[self.ids.index(parent)].get("subtype")
        else:
            psub = None
        want = {"locality": "dependency", "borough": "locality"}.get(subtype)
        if psub and want and psub != want:
            self.problems.add(self.where(i, "parent"), f"{'市' if subtype == 'locality' else '区'}的上级必须是{'领地' if want == 'dependency' else '市'}")
        used = {d.get("codes", {}).get("admin") for d in self.world.divisions.values()} | set(self.new_codes.values())
        if is_new and "codes.admin" not in changes and parent:
            base = self.new_codes.get(parent) or self.world.divisions.get(parent, {}).get("codes", {}).get("admin")
            if base and want in CODE_DIGITS:
                base = base[:CODE_DIGITS[want]]
                n = 1
                while f"{base}{n:02d}".ljust(6, "0") in used:
                    n += 1
                changes["codes.admin"] = f"{base}{n:02d}".ljust(6, "0")
            elif parent in self.ids:
                self.problems.add(self.where(i, "parent"), "上级是本文件中新建的条目时，须排在本行之前")
        code = changes.get("codes.admin")
        if code is DELETE:
            self.problems.add(self.where(i, "admin_code"), "行政区必须有区划代码")
        elif isinstance(code, str):
            if not (code.isdigit() and len(code) == 6):
                self.problems.add(self.where(i, "admin_code"), f"“{code}”应为 6 位数字")
            elif is_new and code in used:
                self.problems.add(self.where(i, "admin_code"), f"区划代码 {code} 已被使用")
            self.new_codes[eid] = code
        anchor = self.pair(row, i, "anchor_x_km", "anchor_y_km")
        direction = self.pair(row, i, "dir_x", "dir_y")
        if subtype == "locality":
            if is_new and "color" not in changes:
                self.problems.add(self.where(i, "color"), "新建的市必须指定主色（地图着色和徽标）")
            if is_new and anchor is None:
                self.problems.add(self.where(i, "anchor_x_km"), "新建的市必须给出锚点（设计坐标 km，X 向东、Y 向北）")
        if anchor is not None:
            if subtype != "locality":
                self.problems.add(self.where(i, "anchor_x_km"), "锚点只适用于市；区请填写 方向X、方向Y")
            extras["layout.cities"] = anchor
        if direction is not None:
            if subtype != "borough":
                self.problems.add(self.where(i, "dir_x"), "方向只适用于区（相对所在市锚点的单位方向）")
            extras["layout.districts"] = direction

    def check_features(self, i, row, eid, is_new, changes, extras):
        at = self.pair(row, i, "detect_x_km", "detect_y_km")
        if at is not None:
            changes["detect.at_km"] = at
        if ("detect.kind" in changes) != (at is not None) and eid not in self.world.features:
            self.problems.add(self.where(i, "detect_kind"), "识别类型和识别坐标需同时填写")

    def check_routes(self, i, row, eid, is_new, changes, extras):
        cur = self.world.routes.get(eid, {})
        network = changes.get("network", cur.get("network"))
        ref = changes.get("ref", cur.get("ref"))
        if network in NETWORKS:
            cls, pattern = NETWORKS[network]
            if is_new:
                changes.setdefault("class", cls)
            if ref and not re.fullmatch(pattern, ref):
                self.problems.add(self.where(i, "ref"), f"“{ref}”不符合该等级的编号规则（{pattern.replace(chr(92) + 'd', '#')}）")
        via = changes.get("via")
        for v in via if isinstance(via, list) else []:
            d = self.world.divisions[v]
            if d["subtype"] not in ("locality", "borough"):
                self.problems.add(self.where(i, "via"), f"途经只能填市或区（{d['names']['zh']} 不是市或区）")
        if changes.get("ring") is True and isinstance(via, list) and len(via) < 3:
            self.problems.add(self.where(i, "ring"), "环线至少需要三个途经城市或区")
        if network in ("territorial_expressway", "territorial_highway") and not changes.get("shield", cur.get("shield")):
            self.problems.add(self.where(i, "shield"), "领地高速与领道必须指定路牌图案")

    def check_railways(self, i, row, eid, is_new, changes, extras):
        via = changes.get("via")
        for v in via if isinstance(via, list) else []:
            d = self.world.divisions[v]
            if d["subtype"] not in ("locality", "borough"):
                self.problems.add(self.where(i, "via"), f"停靠只能填市或区（{d['names']['zh']} 不是市或区）")
        if isinstance(via, list) and len(set(via)) < len(via):
            self.problems.add(self.where(i, "via"), "停靠站不能重复")

    def check_places(self, i, row, eid, is_new, changes, extras):
        off = self.pair(row, i, "offset_east_km", "offset_north_km")
        if off is not None:
            changes["offset_km"] = off
        size = self.pair(row, i, "site_along_m", "site_across_m")
        if size is not None:
            changes["site.size_m"] = size
        cur = self.world.places.get(eid, {})
        site = {**(cur.get("site") or {}), **{k.split(".")[1]: v for k, v in changes.items() if k.startswith("site.")}}
        if site and size is not DELETE and ("layout" not in site or "size_m" not in site):
            self.problems.add(self.where(i, "site_layout"), "地标占地需要同时填写 占地布局、占地长米、占地宽米")
        if changes.get("marker", cur.get("marker")) == "emblem" and not changes.get("emblem_of", cur.get("emblem_of")):
            self.problems.add(self.where(i, "emblem_of"), "地图符号为 emblem 时必须指定徽标来自哪个条目")


ORDER = {
    "divisions": ["id", "subtype", "parent", "status", "names", "short_names", "codes", "population", "area_km2", "color",
                  "emblem", "notes"],
    "features": ["id", "subtype", "status", "detect", "names", "notes"],
    "routes": ["id", "ref", "network", "class", "status", "names", "notes", "ring", "straight", "ends_at_network",
               "tunnel_cost", "legs", "shield", "via"],
    "places": ["id", "subtype", "status", "names", "notes", "in", "offset_km", "marker", "emblem_of", "site"],
    "railways": ["id", "network", "status", "names", "notes", "color", "tech", "tunnel_cost", "via", "station_names"],
}
FLOW = {"divisions": (), "features": ("detect", "names"), "routes": ("via",), "places": ("site",),
        "railways": ("tech", "via")}


def yaml_for(text: str) -> YAML:
    y = YAML()
    y.preserve_quotes = True
    y.width = 4096
    if re.search(r"^- id:", text, flags=re.M):
        y.indent(mapping=2, sequence=2, offset=0)
    else:
        y.indent(mapping=2, sequence=4, offset=2)
    return y


def plain(node):
    """Copy without comments, keeping flow style and scalar quoting."""
    if isinstance(node, dict):
        out = CommentedMap((k, plain(v)) for k, v in node.items())
    elif isinstance(node, list):
        out = CommentedSeq(plain(v) for v in node)
    else:
        return node
    if getattr(node, "fa", None) is not None and node.fa.flow_style():
        out.fa.set_flow_style()
    return out


def dump_item(y: YAML, ent) -> list[str]:
    buf = io.StringIO()
    y.dump(CommentedSeq([plain(ent)]), buf)
    lines = buf.getvalue().splitlines()
    # match the hand-written "key: { a: 1 }" spacing of the world files
    return [re.sub(r"(?<! )\}", " }", re.sub(r"\{(?! )", "{ ", ln)) if re.match(r"^\s*(- )?[\w-]+: \{", ln) else ln
            for ln in lines]


def item_block(lines: list[str], eid: str) -> tuple[int, int]:
    """Line range [start, end) of the list item `- id: <eid>`."""
    pat = re.compile(rf"^(\s*)- id: {re.escape(eid)}\s*$")
    for start, ln in enumerate(lines):
        m = pat.match(ln)
        if m:
            indent = len(m.group(1))
            end = start + 1
            while end < len(lines) and (not lines[end].strip() or len(lines[end]) - len(lines[end].lstrip()) > indent):
                end += 1
            while end > start + 1 and not lines[end - 1].strip():
                end -= 1
            return start, end
    raise KeyError(eid)


def set_layout(lines: list[str], section: str, eid: str, value, comment: str) -> None:
    """Set `layout.<section>.<eid>: [x, y]` in a generator file, keeping its comments."""
    top = next(i for i, ln in enumerate(lines) if re.match(r"^layout:\s*(#.*)?$", ln))
    head = next(i for i in range(top + 1, len(lines)) if re.match(rf"^  {section}:\s*(#.*)?$", lines[i]))
    last = head
    for i in range(head + 1, len(lines)):
        ln = lines[i]
        if not ln.strip() or ln.startswith("    #"):
            continue
        if not ln.startswith("    "):
            break
        last = i
        m = re.match(rf"^(    {re.escape(eid)}: )(\[[^\]]*\])(.*)$", ln)
        if m:
            if value is DELETE:
                del lines[i]
            else:
                lines[i] = m.group(1) + flow_pair(value) + m.group(3)
            return
    if value is not DELETE:
        entry = f"    {eid}: {flow_pair(value)}"
        lines.insert(last + 1, f"{entry:<29}# {comment}")


def flow_pair(v) -> str:
    return "[" + ", ".join(f"{x:g}" for x in v) + "]"


def translate(msg: str) -> str:
    rules = [
        (r"(\S+): children area (\S+) != (\S+)", r"\1：下级面积之和 \2 与本级面积 \3 不一致"),
        (r"(\S+): children population (\S+) != (\S+)", r"\1：下级人口之和 \2 与本级人口 \3 不一致"),
        (r"(\S+): admin code (\S+) already used by (\S+)", r"\1：区划代码 \2 已被 \3 使用"),
        (r"(\S+): admin code (\S+) does not extend parent code (\S+)", r"\1：区划代码 \2 应以上级代码 \3 开头"),
        (r"(\S+): route number (\S+) already used by (\S+)", r"\1：道路编号 \2 已被 \3 使用"),
        (r"(\S+): a ring needs at least three via divisions", r"\1：环线至少需要三个途经城市"),
        (r"generator: city (\S+) has no anchor in layout.cities", r"\1：生成器中没有该市的锚点（填写 锚点X、锚点Y）"),
        (r"(\S+): missing name in '(\w+)'", r"\1：缺少 \2 名称"),
        (r"(\S+): via (\S+) is not a division", r"\1：途经 \2 不是行政区"),
        (r"(\S+): 'in' must name a division", r"\1：所在区必须是行政区"),
        (r"(\S+): site size_m must be .*", r"\1：占地长米、占地宽米应在 10–8000 之间"),
        (r"(\S+): site angle_deg must be .*", r"\1：占地朝向度应为数字（正东为 0，逆时针）"),
        (r"(\S+): a place with a site must be 'in' a district", r"\1：有占地的地标必须位于区内"),
        (r"(\S+): a railway needs at least two stops in via", r"\1：铁路至少需要两个停靠站"),
        (r"(\S+): via (\S+) is not a city or district", r"\1：停靠 \2 不是市或区"),
        (r"(\S+): station_names entry (\S+) is not one of the stops", r"\1：站名覆盖 \2 不在停靠站中"),
        (r"(\S+): color must be #RRGGBB", r"\1：线路色应为 #RRGGBB 格式"),
        (r"(\S+): detect.at_km must be .*", r"\1：识别坐标应为两个数字"),
        (r"generator: unknown division (\S+)", r"生成器引用了不存在的行政区 \1"),
        (r"(\S+): a city needs a colour.*", r"\1：市必须指定主色"),
        (r"(\S+): needs an admin code.*", r"\1：缺少区划代码"),
    ]
    for pat, rep in rules:
        if re.fullmatch(pat, msg):
            return re.sub(pat, rep, msg)
    return msg


def main():
    ap = argparse.ArgumentParser(description="把 CSV 导入 world/ 下的 YAML")
    ap.add_argument("csv", type=Path)
    ap.add_argument("--kind", choices=KINDS)
    ap.add_argument("--into", type=Path, help="新条目写入的 YAML 文件（默认为该类的主文件）")
    ap.add_argument("--check", action="store_true", help="只校验，不写入")
    args = ap.parse_args()

    stem = args.csv.stem.lower()
    kind = args.kind or next((k for k, s in KINDS.items() if k.rstrip("s") in stem or s["label"] in stem), None)
    if kind is None:
        sys.exit(f"无法从文件名判断类型，请用 --kind 指定（{'、'.join(KINDS)}）")
    rows = read_csv(args.csv)
    if not rows:
        sys.exit(f"{args.csv.name} 中没有数据行")
    imp = Importer(kind, rows, args.csv.name)
    plans = imp.plan()
    if imp.problems:
        print(f"校验未通过（{len(imp.problems)} 处），未写入任何文件：")
        for p in imp.problems:
            print("  · " + p)
        sys.exit(1)

    spec = KINDS[kind]
    into = (args.into or WORLD_DIR / spec["folder"] / spec["default"]).resolve()
    if not into.is_relative_to(WORLD_DIR / spec["folder"]):
        sys.exit(f"--into 必须是 world/{spec['folder']}/ 下的文件")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_world = Path(tmp) / "world"
        shutil.copytree(WORLD_DIR, tmp_world)
        texts: dict[Path, list[str]] = {}
        parsed: dict[Path, tuple[YAML, dict]] = {}

        def lines_of(path: Path) -> list[str]:
            if path not in texts:
                texts[path] = path.read_text(encoding="utf-8").splitlines() if path.exists() else [f"{spec['key']}:"]
            return texts[path]

        def yaml_of(path: Path):
            if path not in parsed:
                text = "\n".join(lines_of(path))
                y = yaml_for(text)
                parsed[path] = (y, y.load(text) or CommentedMap())
            return parsed[path]

        new_parent = {eid: ch.get("parent") for eid, new, ch, _ in plans if new}

        def chain_of(eid: str) -> list[str]:
            chain, cur = [], eid
            while cur:
                chain.append(cur)
                cur = new_parent.get(cur) or imp.world.entities.get(cur, {}).get("parent")
            return chain

        def generator_for(eid: str) -> Path:
            for p in sorted((WORLD_DIR / "generator").glob("*.yaml")):
                if yaml_of(p)[1].get("territory") in chain_of(eid):
                    return p
            sys.exit(f"{eid}：找不到负责其所在领地的生成器文件（world/generator/）")

        added, updated = [], []
        for eid, is_new, changes, extras in plans:
            if is_new:
                src = into
                ent = CommentedMap([("id", eid)])
                for path, v in changes.items():
                    if v is not DELETE:
                        set_path(ent, path, v)
                order = ORDER[kind]
                ent = CommentedMap(sorted(ent.items(), key=lambda kv: order.index(kv[0]) if kv[0] in order else 99))
                added.append(ent)
            else:
                src = ROOT / imp.world.entities[eid]["_source"]
                ent = next(e for e in yaml_of(src)[1][spec["key"]] if e["id"] == eid)
                for path, v in changes.items():
                    set_path(ent, path, v)
                updated.append(ent)
            for key in FLOW[kind]:
                if isinstance(ent.get(key), (CommentedMap, CommentedSeq)):
                    ent[key].fa.set_flow_style()
            y, _ = yaml_of(src)
            lines = lines_of(src)
            block = dump_item(y, ent)
            parent = ent.get("parent") if kind == "divisions" else None
            after = [i for i in re.findall(r"^\s*- id: (\S+)", "\n".join(lines), flags=re.M)
                     if parent and parent in chain_of(i)] if is_new else []
            if after and after[-1] != re.findall(r"^\s*- id: (\S+)", "\n".join(lines), flags=re.M)[-1]:
                _, end = item_block(lines, after[-1])
                lines[end:end] = block
            elif is_new:
                while lines and not lines[-1].strip():
                    lines.pop()
                lines.extend(block)
            else:
                start, end = item_block(lines, eid)
                lines[start:end] = block
            name = ent["names"]["zh"]
            for path, v in extras.items():
                set_layout(lines_of(generator_for(eid)), path.split(".")[1], eid, v, name)
        for path, lines in texts.items():
            out = tmp_world / path.relative_to(WORLD_DIR)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        try:
            errors = World(tmp_world).validate()
        except Exception as exc:  # noqa: BLE001
            errors = [str(exc)]
        if errors:
            print(f"合并后的数据校验未通过（{len(errors)} 处），未写入任何文件：")
            for e in errors:
                print("  · " + translate(e))
            sys.exit(1)

        def label(e):
            return f"{e['id']} {e['names']['zh']}"

        print(f"校验通过：新增 {len(added)} 条{spec['label']}，更新 {len(updated)} 条。")
        for e in added:
            print(f"  + {label(e)}")
        for e in updated:
            print(f"  ~ {label(e)}")
        if args.check:
            print("（--check：未写入）")
            return
        for path in texts:
            shutil.copyfile(tmp_world / path.relative_to(WORLD_DIR), path)
            print(f"已写入 {path.relative_to(ROOT).as_posix()}")
        print("运行 npm run data 重新生成地图。")


if __name__ == "__main__":
    main()
