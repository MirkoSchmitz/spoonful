# Übernimmt die App-Oberfläche aus der Testversion und ergänzt PWA- und Supabase-Anbindung.
import pathlib, sys, json, datetime
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'src/app.html').read_text(encoding='utf-8')
head = '''<meta name="app-version" content="__VERSION__">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#2E6A39">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Spoonful">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js"></script>
<script src="config.js"></script>
<script src="shim.js"></script>
</head>'''
assert src.count('</head>') == 1
version = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
out = src.replace('</head>', head.replace('__VERSION__', version), 1)
pathlib.Path('public/version.json').write_text(json.dumps({'version': version}), encoding='utf-8')
pathlib.Path('public/index.html').write_text(out, encoding='utf-8')
print('public/index.html geschrieben', len(out))
