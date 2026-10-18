#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
食物库生成器 —— 把《中国食物成分表 标准版（第6版）》的 OCR 数据清洗后，
写成 健身小程序/utils/kb.js 里的 FOODS 数组（扩充段）。

为什么要有这个脚本：
  食物库有 1000+ 条，手改必错。以后想更新数据/调分类/加别名，
  改这个脚本重跑一遍即可，不动 kb.js 的其他部分。

数据来源与合规：
  · 数值：tools/data/food-raw/*.json，来自开源项目 Sanotsu/china-food-composition-data
    （对《中国食物成分表 标准版（第6版）》"能量和食物一般营养成分"部分的 OCR 整理）。
    食物成分数值属客观事实，不受著作权保护；本项目只取数值，中文命名/别名/分类/字段结构均自行编写。
  · 手工补充的 5 条坚果取自 USDA FoodData Central（美国政府作品，公有领域）。

用法：
    python3 tools/build-foods.py            # 干跑：只打印统计，不写文件
    python3 tools/build-foods.py --write    # 真正写回 kb.js
"""
import json, glob, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'data', 'food-raw')
KB = os.path.abspath(os.path.join(HERE, '..', '..', '健身小程序', 'utils', 'kb.js'))

BEGIN = '  // ——— 以下为扩充库'
END = '\n]\n'

# 来源分类 → 我们的 6 类（按原表分类直接映射，比拿名字猜可靠）
CAT_MAP = {
    '谷类及其制品': '主食', '薯类淀粉及其制品': '主食', '干豆类及其制品': '主食',
    '蔬菜类及其制品': '蔬菜', '菌藻类': '蔬菜', '水果类及其制品': '水果',
    '畜肉类及其制品': '蛋白', '禽肉类及其制品': '蛋白', '蛋类及其制品': '蛋白',
    '鱼虾蟹贝类': '蛋白', '乳类及其制品': '蛋白',
    '坚果种子类': '脂肪坚果', '植物油': '脂肪坚果', '动物油脂类': '脂肪坚果',
    '其他类': '其他',
}
# 整类丢弃：健身场景用不到 / 生僻野菜 / 罕见肉 / 品牌奶粉
DROP_CATS = ['蔬菜类及其制品-野生蔬菜类', '畜肉类及其制品-马', '畜肉类及其制品-驴',
             '禽肉类及其制品-火鸡', '乳类及其制品-奶粉', '薯类淀粉及其制品-淀粉类']
# 「其他类」里混着中药材，不是食物 → 丢
DROP_NAMES = {'乌梢蛇', '刺猬皮', '团螵蛸', '牛黄', '珍珠', '蛤蚧', '龟甲',
              '鸡内金', '马鹿胎(粉)', '人参', '西洋参', '鹿茸', '鹿鞭', '海马',
              # 下面这些是"能吃但不该出现在健身小程序里"的：
              #   鲨鱼翅在中国属违法交易；狗肉/牛鞭/龟板涉及平台审核与观感；
              #   大麻油（火麻油）名字容易被误读；养殖鹿肉虽合法但没必要冒险。
              '狗肉', '乌龟(肉)', '乌龟(龟板)', '牛鞭(泡发)', '大麻油',
              '双髻鲨', '金鲨鱼翅(干)', '鲨鱼(真鲨、白斑角鲨)', '鹿肉(养殖梅花鹿)'}
# 名字里出现这些一律不收录（覆盖可能的变体写法）
DROP_RE = re.compile(r'鱼翅|鲨鱼|鲨|狗肉|乌龟|龟板|牛鞭|大麻油|鹿肉|鹿鞭|虎骨|熊掌|穿山甲')
# 名字里被原仓库流水线注入了字段（fat9g 之类）或含拉丁字母 → 丢
POLLUTED = re.compile(r'fat\d+g|kcal|CHO|[A-Za-z]')

# 这些大类的条目按原表口径都是「生重可食部」—— 补一个「生」前缀别名，
# 用户搜「生鸡胸肉」「生猪里脊」也能命中，避免误当熟重记（2026-10-17 用户反馈食材库口径混乱）。
MEAT_TOPS = {'畜肉类及其制品', '禽肉类及其制品', '鱼虾蟹贝类'}

# 表里没有、但健身人群常吃的 —— 数值来源都写清楚，不凭记忆编
MANUAL = [
    # 坚果（表里只有国产杏仁，没有进口扁桃仁等）
    {'name': '巴旦木', 'kcal': 579, 'protein': 21.2, 'fat': 49.9, 'carbs': 21.6, 'fiber': 12.5,
     'cat': '脂肪坚果', 'alias': ['扁桃仁', '美国大杏仁', '巴旦木仁', '大杏仁', '杏仁(进口)']},
    {'name': '夏威夷果', 'kcal': 718, 'protein': 7.9, 'fat': 75.8, 'carbs': 13.8, 'fiber': 8.6,
     'cat': '脂肪坚果', 'alias': ['澳洲坚果', '夏威夷果仁']},
    {'name': '碧根果', 'kcal': 691, 'protein': 9.2, 'fat': 72.0, 'carbs': 13.9, 'fiber': 9.6,
     'cat': '脂肪坚果', 'alias': ['长寿果', '美国山核桃', '碧根果仁']},
    {'name': '开心果仁', 'kcal': 560, 'protein': 20.2, 'fat': 45.3, 'carbs': 27.2, 'fiber': 10.6,
     'cat': '脂肪坚果', 'alias': ['开心果(去壳)']},
    # 主食：生米单列一条，因为称生米和盛饭差 3 倍（346 vs 116 kcal）
    {'name': '生米', 'kcal': 346, 'protein': 7.9, 'fat': 0.9, 'carbs': 77.2, 'fiber': 0.6,
     'cat': '主食', 'alias': []},
    {'name': '贝果', 'kcal': 257, 'protein': 10.2, 'fat': 1.7, 'carbs': 50.5, 'fiber': 2.3,
     'cat': '主食', 'alias': ['bagel', '面包圈']},
    # 糖 / 饮品：原表这一部分未在 OCR 数据里，按公开标准值补。
    #   ⚠️ 记录用够了，但别拿它做"能不能喝"的判断。
    {'name': '白砂糖', 'kcal': 400, 'protein': 0, 'fat': 0, 'carbs': 99.9, 'fiber': 0,
     'cat': '其他', 'alias': ['砂糖', '白糖', '糖']},          # 蔗糖 4kcal/g 的定义值
    {'name': '蜂蜜', 'kcal': 304, 'protein': 0.3, 'fat': 0, 'carbs': 82.4, 'fiber': 0.2,
     'cat': '其他', 'alias': ['蜜']},                          # USDA FoodData Central
    {'name': '可乐', 'kcal': 43, 'protein': 0, 'fat': 0, 'carbs': 10.8, 'fiber': 0,
     'cat': '其他', 'alias': ['可乐(含糖)', '汽水']},           # 市售含糖碳酸饮料通用值
]

CAT_ORDER = {'蛋白': 0, '主食': 1, '蔬菜': 2, '水果': 3, '脂肪坚果': 4, '其他': 5}


def norm_name(raw):
    """把原表的『核桃（干）［胡桃］』这类拆成 正名 + 俗名列表。"""
    s = (raw or '').strip()
    if not s:
        return None, []
    alias = []
    for m in re.findall(r'［([^］]*)］', s):
        alias += [x.strip() for x in re.split(r'[，,、]', m) if x.strip()]
    s = re.sub(r'［[^］]*］', '', s)
    s = s.replace('（', '(').replace('）', ')')
    s = re.sub(r'\((代表值|均值|平均)\)', '', s)
    s = re.sub(r'\s+', '', s)
    # 括号配对修复
    if s.count('(') > s.count(')'):
        s += ')' * (s.count('(') - s.count(')'))
    if s.count(')') > s.count('('):
        s = s.replace(')', '', s.count(')') - s.count('('))
    # 只清左端；右端不能清（会把 木耳(干) 变成 木耳(干 再把 ) 清掉 → 名字被吃）
    while s and s[0] in '()·-—　':
        s = s[1:]
    while s and s[-1] in '·-—　':
        s = s[:-1]
    return (s or None), alias


def num(v):
    if v is None:
        return None
    v = str(v).strip()
    if v in ('', '—', '-', '...', '…', '—*'):
        return None
    if v.lower() in ('tr', 'tr*'):          # 原书用 Tr 表示"微量"，按 0 处理
        return 0.0
    v = v.replace(',', '.')
    # 原书数值带脚注星号（如植物油的 "899*"）→ 去掉非数字字符再解析。
    # 不处理的话整类油都会被判成"数值缺失"丢掉。
    v = re.sub(r'[^0-9.\-]', '', v)
    if v in ('', '.', '-'):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def build():
    rows, seen = [], set()
    dropped = collections.Counter()
    for f in sorted(glob.glob(os.path.join(RAW, '*.json'))):
        cat = os.path.basename(f)[7:-5]           # 去掉 merged_ 与 .json
        if cat in DROP_CATS:
            dropped['整类丢弃'] += len(json.load(open(f, encoding='utf-8')))
            continue
        top = cat.split('-')[0]
        our = CAT_MAP.get(top, '其他')
        if top == '干豆类及其制品' and '大豆' in cat:
            our = '蛋白'
        for x in json.load(open(f, encoding='utf-8')):
            nm = x.get('foodName', '')
            # 先做"名字级"过滤（这些必须看原始名）
            if '牌' in nm:
                dropped['品牌款'] += 1; continue
            if POLLUTED.search(nm):
                dropped['名字被污染'] += 1; continue
            if '罐头' in nm:
                dropped['罐头'] += 1; continue
            kcal = num(x.get('energyKCal'))
            p, fat, ch = num(x.get('protein')), num(x.get('fat')), num(x.get('CHO'))
            fib = num(x.get('dietaryFiber')) or 0
            if None in (kcal, p, fat, ch) or kcal <= 0 or kcal > 950:
                dropped['数值缺失或异常'] += 1; continue
            # 再规范化
            name, alias = norm_name(nm)
            if not name:
                dropped['名字为空'] += 1; continue
            if len(name) > 13:                      # 长度检查放在规范化之后（否则误杀 木耳(干)［…］）
                dropped['名字过长'] += 1; continue
            # 正名里带全角逗号 = 品牌/品种/细分变体，搜索噪音大 → 丢
            # 注意：必须看规范化之后的「正名」，不能看原始名 ——
            #   原始名的逗号多在［俗名］里（如「木耳(干)［黑木耳，云耳］」），看原始名会误杀。
            if '，' in name or ',' in name:
                dropped['品牌或品种变体'] += 1; continue
            if name in DROP_NAMES:
                dropped['中药材或不宜收录'] += 1; continue
            if DROP_RE.search(name):
                dropped['中药材或不宜收录'] += 1; continue
            if name in seen:
                dropped['重名'] += 1; continue
            seen.add(name)
            c = our
            # 纠正按来源分类会出错的几类
            if c == '脂肪坚果' and ch >= 35 and fat < 10:
                c = '主食'                          # 栗子 / 莲子 / 白果 / 芡实 其实是主食
            if c == '蔬菜' and kcal >= 200:
                c = '主食'                          # 干香菇 / 干木耳 这类干制蔬菜
            rows.append({'name': name, 'kcal': round(kcal), 'protein': round(p, 1),
                         'fat': round(fat, 1), 'carbs': round(ch, 1), 'fiber': round(fib, 1),
                         'cat': c,
                         'alias': alias + ([u'生' + name] if top in MEAT_TOPS else [])})
    return rows, dropped


def jsline(r):
    al = r.get('alias') or []
    al_s = (", alias: [" + ', '.join("'%s'" % a for a in al) + "]") if al else ''
    return ("  { name: '%s', kcal: %d, protein: %s, fat: %s, carbs: %s, fiber: %s, cat: '%s'%s },"
            % (r['name'], r['kcal'], r['protein'], r['fat'], r['carbs'], r['fiber'], r['cat'], al_s))


HEADER = """  // ——— 以下为扩充库（%d 条）———
  // 来源：数值摘录自《中国食物成分表 标准版（第6版）》"能量和食物一般营养成分"部分
  //   （经开源项目 Sanotsu/china-food-composition-data 的 OCR 整理数据核对。
  //     食物成分数值属客观事实；此处中文命名、别名、分类与字段结构为本项目自行编写。）
  // 另补 %d 条：原 OCR 数据未覆盖到、但日常真会记录的东西（进口坚果 / 生米 / 糖 / 可乐），
  //   逐条来源见 tools/build-foods.py 里的 MANUAL 常量。
  // 口径：每 100g 可食部。**米饭=熟重、稻米=生重** —— 称生米搜「稻米/生米」，盛饭搜「米饭」。
  // 重新生成：python3 tools/build-foods.py --write
"""


def splice(new_rows):
    src = open(KB, encoding='utf-8').read()
    i = src.find('const FOODS = [')
    assert i > 0, 'kb.js 里找不到 FOODS'
    j = src.find(BEGIN, i)
    assert j > 0, 'kb.js 里找不到扩充库起点标记（%s）' % BEGIN
    k = src.index(END, j)                      # FOODS 数组的结束
    manual = [r for r in new_rows if r['name'] in {m['name'] for m in MANUAL}]
    block = (HEADER % (len(new_rows), len(manual))
             + '\n'.join(jsline(r) for r in new_rows) + '\n')
    return src[:j] + block + src[k:]


def main():
    write = '--write' in sys.argv
    rows, dropped = build()
    src = open(KB, encoding='utf-8').read()
    i = src.find('const FOODS = [')
    j = src.find(BEGIN, i)
    orig = set(re.findall(r"\{ name: '([^']+)'", src[i:j]))       # 原有 88 条（值可能被菜谱依赖）
    names = {r['name'] for r in rows}
    manual = [m for m in MANUAL if m['name'] not in names and m['name'] not in orig]
    for m in manual:
        m = dict(m)
        rows.append(m)
    rows = [r for r in rows if r['name'] not in orig]
    rows.sort(key=lambda r: (CAT_ORDER.get(r['cat'], 9), r['name']))

    print('原有条目（保留不动）: %d' % len(orig))
    print('扩充条目: %d' % len(rows))
    print('分类分布: %s' % dict(collections.Counter(r['cat'] for r in rows)))
    print('丢弃统计: %s' % dict(dropped))

    out = splice(rows)
    body = '\n'.join(jsline(r) for r in rows)
    print('写入体积: %.1f KB' % (len(body.encode('utf-8')) / 1024))
    if write:
        open(KB, 'w', encoding='utf-8').write(out)
        print('✅ 已写回 %s' % KB)
    else:
        print('（干跑，未写文件。加 --write 才真正写入）')


if __name__ == '__main__':
    main()
