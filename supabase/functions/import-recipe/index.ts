// Spoonful – Rezept-Import (Supabase Edge Function)
// 1) Link: liest die Webseite und übernimmt das eingebettete Rezept (schema.org/Recipe) – ohne KI, kostenlos.
// 2) Text/Foto oder Seiten ohne Rezeptdaten: fragt Claude, falls ANTHROPIC_API_KEY als Secret gesetzt ist.
// Nur angemeldete Nutzer können die Funktion aufrufen (JWT-Prüfung ist bei Supabase standardmäßig an).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5';
const CATS = ['Frühstück', 'Vorspeisen', 'Mittagessen', 'Abendessen', 'Snack', 'Dessert', 'Backen', 'vegan', 'vegetarisch', 'Fleisch', 'Fisch', 'Suppen'];

async function askClaude(prompt: string, images: { media_type: string; data: string }[] = []) {
  const content = [
    ...images.slice(0, 1).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } })),
    { type: 'text', text: prompt },
  ];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`Claude-API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
}

// ---- schema.org/Recipe auslesen ----
const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
function num(s: string): number | null {
  s = s.trim().replace(/[½¼¾⅓⅔]/g, m => ' ' + FRAC[m]).replace(',', '.').split(/\s*[-–]\s*/)[0].trim();
  if (!s) return null;
  let v = 0;
  for (const part of s.split(/\s+/)) {
    const f = part.match(/^(\d+)\/(\d+)$/);
    if (f) v += +f[1] / +f[2]; else if (!isNaN(+part)) v += +part; else return null;
  }
  return v || null;
}
const UNIT = /^(g|gr|kg|ml|l|cl|el|tl|stück|stk\.?|prise[n]?|zehe[n]?|bund|dose[n]?|packung|pck\.?|päckchen|tasse[n]?|becher|msp\.?|scheibe[n]?|handvoll|glas)\b\.?/i;
function parseIngredient(line: string) {
  const t = line.replace(/\s+/g, ' ').trim();
  const m = t.match(/^([\d.,/½¼¾⅓⅔\s–-]+)\s*(.*)$/);
  let qty: number | null = null, rest = t;
  if (m) { qty = num(m[1]); rest = m[2]; }
  let unit = '';
  const u = rest.match(UNIT);
  if (u && qty != null) { unit = u[1].replace(/\.$/, ''); unit = ({ el: 'EL', tl: 'TL', gr: 'g', stk: 'Stück', 'stück': 'Stück', pck: 'Packung', 'päckchen': 'Packung' } as Record<string, string>)[unit.toLowerCase()] ?? unit; rest = rest.slice(u[0].length).trim(); }
  return { qty, unit, name: rest || t };
}
function minutes(iso?: string): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const v = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return v || null;
}
function steps(ins: unknown): string[] {
  if (!ins) return [];
  if (typeof ins === 'string') return ins.split(/\n+|(?<=\.)\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(steps);
  const o = ins as Record<string, unknown>;
  if (o.itemListElement) return steps(o.itemListElement);
  if (typeof o.text === 'string') return [o.text.trim()];
  if (typeof o.name === 'string') return [o.name.trim()];
  return [];
}
function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  const o = node as Record<string, unknown>;
  const t = o['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
  return findRecipe(o['@graph']) ?? findRecipe(o.mainEntity);
}
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
function guessCats(text: string): string[] {
  const t = text.toLowerCase(), c = new Set<string>();
  if (/vegan/.test(t)) c.add('vegan'); else if (/vegetari/.test(t)) c.add('vegetarisch');
  if (/fisch|lachs|thunfisch|garnele|fish|salmon/.test(t)) c.add('Fisch');
  if (/hähnchen|huhn|rind|schwein|hack|speck|chicken|beef|pork|lamm/.test(t)) c.add('Fleisch');
  if (/suppe|soup|eintopf/.test(t)) c.add('Suppen');
  if (/kuchen|brot|backen|torte|muffin|cake|bread/.test(t)) c.add('Backen');
  if (/dessert|nachtisch|nachspeise/.test(t)) c.add('Dessert');
  if (/frühstück|breakfast/.test(t)) c.add('Frühstück');
  if (/vorspeise|starter|appetizer/.test(t)) c.add('Vorspeisen');
  if (/snack|fingerfood/.test(t)) c.add('Snack');
  if (/abendessen|dinner/.test(t)) c.add('Abendessen');
  if (/mittagessen|lunch/.test(t)) c.add('Mittagessen');
  return [...c].filter(x => CATS.includes(x));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { url, prompt, images } = await req.json();

    if (url) {
      if (!/^https?:\/\//i.test(url)) return reply({ error: 'Ungültiger Link.', code: 'upstream_error' });
      const page = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Spoonful Rezept-Import)', 'Accept-Language': 'de,en;q=0.8' } });
      if (!page.ok) return reply({ error: `Die Seite antwortet nicht (${page.status}).`, code: 'upstream_error' });
      const html = await page.text();
      for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        let data: unknown; try { data = JSON.parse(m[1].trim()); } catch { continue; }
        const r = findRecipe(data);
        if (!r) continue;
        const ing = ((r.recipeIngredient ?? r.ingredients ?? []) as string[]).map(s => parseIngredient(strip(String(s))));
        const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
        const kw = [r.name, r.recipeCategory, r.keywords, r.recipeCuisine, r.description].flat().filter(Boolean).join(' ');
        const recipe = {
          name: strip(String(r.name ?? '')).slice(0, 120),
          description: strip(String(r.description ?? '')).slice(0, 600),
          servings: parseInt(String(yieldRaw ?? ''), 10) || 2,
          time: minutes(r.totalTime as string) ?? ((minutes(r.prepTime as string) ?? 0) + (minutes(r.cookTime as string) ?? 0) || null),
          level: null,
          ingredients: ing.filter(i => i.name),
          steps: steps(r.recipeInstructions).map(strip).filter(Boolean),
          categories: guessCats(kw),
        };
        if (recipe.name) return reply({ recipe });
      }
      if (!KEY) return reply({ error: 'Auf der Seite wurden keine Rezeptdaten gefunden. Kopiere den Text stattdessen.', code: 'upstream_error' });
      const text = strip(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')).slice(0, 15000);
      return reply({ text: await askClaude(`${prompt}\n\nInhalt der Webseite ${url}:\n${text}`) });
    }

    if (!KEY) return reply({ error: 'Für Text- und Foto-Import fehlt der ANTHROPIC_API_KEY.', code: 'sampling_disabled' });
    if (!prompt) return reply({ error: 'Kein Inhalt.', code: 'upstream_error' });
    return reply({ text: await askClaude(String(prompt).slice(0, 60000), Array.isArray(images) ? images : []) });
  } catch (e) {
    return reply({ error: String((e as Error)?.message ?? e), code: 'upstream_error' });
  }
});
