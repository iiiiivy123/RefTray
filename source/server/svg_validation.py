"""Accept inert, self-contained SVG without rewriting the original vector bytes."""
import re
import xml.etree.ElementTree as ET

MAX_SVG_BYTES = 2 * 1024 * 1024
ELEMENTS = set('svg g defs title desc metadata path rect circle ellipse line polyline polygon text tspan textPath use symbol clipPath mask pattern linearGradient radialGradient stop filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence style'.split())


def validate_svg(data):
    if not data or len(data) > MAX_SVG_BYTES:
        raise ValueError('SVG 为空或超过 2MB，未保存')
    try:
        text = data.decode('utf-8-sig')
        if re.search(r'<!\s*(?:DOCTYPE|ENTITY)|<\?xml-stylesheet', text, re.I):
            raise ValueError('SVG 含外部文档或实体声明')
        root = ET.fromstring(text)
        if root.tag not in ('svg', '{http://www.w3.org/2000/svg}svg'):
            raise ValueError('内容不是 SVG')
        stack = [(root, 0)]
        count = 0
        while stack:
            node, depth = stack.pop()
            count += 1
            if depth > 100 or count > 20000:
                raise ValueError('SVG 结构过大')
            name = node.tag.removeprefix('{http://www.w3.org/2000/svg}')
            if name not in ELEMENTS:
                raise ValueError('SVG 含不支持的活动元素：' + name)
            for attribute, value in node.attrib.items():
                local = attribute.rsplit('}', 1)[-1].lower()
                if local.startswith('on') or local == 'base':
                    raise ValueError('SVG 含事件脚本或外部基址')
                if local in ('href', 'src') and not re.fullmatch(r'#[\w.:-]+', value.strip()):
                    raise ValueError('SVG 含外部资源引用')
            css = ' '.join(node.attrib.values()) + (' ' + (node.text or '') if name == 'style' else '')
            # Reject CSS escapes/comments too: they can obscure url/import tokens.
            if '\\' in css or '/*' in css or re.search(r'@import|expression\s*\(|javascript\s*:', css, re.I):
                raise ValueError('SVG 含不支持的动态样式')
            for target in re.findall(r'url\s*\((.*?)\)', css, re.I | re.S):
                if not re.fullmatch(r'#[\w.:-]+', target.strip().strip('\'"')):
                    raise ValueError('SVG 样式含外部资源')
            remaining = re.sub(r'url\s*\((.*?)\)', '', css, flags=re.I | re.S)
            if re.search(r'url\s*\(', remaining, re.I):
                raise ValueError('SVG 样式资源引用不完整')
            stack.extend((child, depth + 1) for child in node)
        return '.svg'
    except (UnicodeError, ET.ParseError) as exc:
        raise ValueError('SVG XML 无效，未保存') from exc
