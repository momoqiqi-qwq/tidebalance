from pathlib import Path
import xml.etree.ElementTree as ET
from io import BytesIO
from PIL import Image
import cairosvg
import json

root = Path(__file__).resolve().parent.parent
package_root = root.parent
sprite = package_root / '01-windows/app/public/icons/fontawesome/solid.svg'
out = root / 'images/tab'
out.mkdir(parents=True, exist_ok=True)
plugin_out = root / 'images/plugins'
plugin_out.mkdir(parents=True, exist_ok=True)

icons = {
    'quadrant': 'table-cells-large',
    'timeblock': 'clock',
    'elder': 'heart',
    'capture': 'inbox',
    'settings': 'gear',
}
colors = {'': '#8A979E', '-on': '#0F4C5C'}
plugin_icons = {}
plugins_dir = package_root / '01-windows/app/public/plugins'
for manifest in sorted(plugins_dir.glob('*/manifest.json')):
    data = json.loads(manifest.read_text(encoding='utf-8'))
    plugin_icons[data['id']] = data.get('faIcon') or data.get('icon') or 'puzzle-piece'
ns = {'svg': 'http://www.w3.org/2000/svg'}
tree = ET.parse(sprite)
root_svg = tree.getroot()

def render(symbol_id, color, size=58):
    symbol = root_svg.find(f"svg:symbol[@id='{symbol_id}']", ns)
    if symbol is None:
        raise RuntimeError(f'Font Awesome symbol not found: {symbol_id}')
    viewbox = symbol.attrib.get('viewBox', '0 0 512 512')
    body = ''.join(ET.tostring(child, encoding='unicode') for child in list(symbol))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" fill="{color}">{body}</svg>'''
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    icon = Image.open(BytesIO(png)).convert('RGBA')
    canvas = Image.new('RGBA', (81, 81), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((81-size)//2, (81-size)//2))
    return canvas

for name, symbol_id in icons.items():
    for suffix, color in colors.items():
        render(symbol_id, color).save(out / f'{name}{suffix}.png')
for plugin_id, symbol_id in plugin_icons.items():
    render(symbol_id, '#0F4C5C', 50).save(plugin_out / f'{plugin_id}.png')
print(f'Generated {len(icons)*len(colors)} tab icons and {len(plugin_icons)} plugin icons from bundled Font Awesome Free SVG sprite.')
